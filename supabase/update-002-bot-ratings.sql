-- =====================================================================================
-- Infinite Chess update 002: bot ratings and the Dynamic bot
-- Run once in the Supabase SQL Editor after setup.sql. Safe to run again.
--
--   * Every bot has a rating: Easy 800, Medium 1100, Hard 1400.
--   * New "dynamic" bot: plays like Hard but leans on the learned playbook. It starts at
--     1400 and its rating moves with its results against players (Elo, K = 24).
--   * Beating a bot now awards Elo points against that bot's rating, so stronger bots give
--     more. Losses and draws against bots still never lower a player's rating, and games
--     under 20 moves (plies) stay unrated.
-- =====================================================================================

alter table public.games drop constraint if exists games_bot_level_check;
alter table public.games add constraint games_bot_level_check
  check (bot_level in ('easy', 'medium', 'hard', 'dynamic'));

create table if not exists public.bot_ratings (
  level        text primary key check (level in ('easy', 'medium', 'hard', 'dynamic')),
  rating       integer not null,
  games_played integer not null default 0,
  wins         integer not null default 0,   -- bot wins
  losses       integer not null default 0,   -- bot losses
  draws        integer not null default 0,
  games_learned integer not null default 0   -- games added to the playbook (dynamic row only)
);
insert into public.bot_ratings (level, rating) values
  ('easy', 800), ('medium', 1100), ('hard', 1400), ('dynamic', 1400)
on conflict (level) do nothing;

alter table public.bot_ratings enable row level security;
revoke all on public.bot_ratings from anon, authenticated;
grant select on public.bot_ratings to anon, authenticated;
drop policy if exists "Bot ratings are readable by everyone" on public.bot_ratings;
create policy "Bot ratings are readable by everyone" on public.bot_ratings
  for select to anon, authenticated using (true);

-- the old 5-argument version is replaced (same signature, new rules)
create or replace function public.record_bot_game(p_level text, p_color text, p_moves jsonb, p_result text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := ic_private.require_user();
  n       int;
  bad     int;
  won     boolean;
  change  int := 0;
  gid     uuid;
  me      int;
  botr    int;
  e       numeric;
  sbot    numeric;
  dbot    int := 0;
  newr    int;
  newbot  int;
begin
  if p_level not in ('easy', 'medium', 'hard', 'dynamic') then raise exception 'Unknown bot level.'; end if;
  if p_color not in ('white', 'black') then raise exception 'Unknown color.'; end if;
  if p_result not in ('white', 'black', 'draw') then raise exception 'That result is not valid.'; end if;
  if coalesce(length(p_reason), 0) < 1 or length(p_reason) > 40 then raise exception 'That result reason is not valid.'; end if;
  if p_moves is null or jsonb_typeof(p_moves) <> 'array' then raise exception 'The move list is missing.'; end if;
  n := jsonb_array_length(p_moves);
  if n < 1 or n > 2000 then raise exception 'The move list is not valid.'; end if;
  select count(*) into bad from jsonb_array_elements(p_moves) x
   where jsonb_typeof(x) <> 'string' or not ic_private.valid_move(x #>> '{}');
  if bad > 0 then raise exception 'The move list is not valid.'; end if;
  if exists (select 1 from public.games
              where mode = 'bot' and (white = uid or black = uid) and created_at > now() - interval '20 seconds') then
    raise exception 'Please wait a moment before saving another bot game.';
  end if;

  select rating into me from public.profiles where id = uid for update;
  select rating into botr from public.bot_ratings where level = p_level for update;
  won := (p_result = p_color);
  e := 1 / (1 + power(10::numeric, (botr - me) / 400.0));          -- player's expected score

  if n >= 20 then
    if won then change := greatest(1, round(32 * (1 - e))::int); end if;
    if p_level = 'dynamic' then
      sbot := case when p_result = 'draw' then 0.5 when won then 0 else 1 end;
      dbot := round(24 * (sbot - (1 - e)))::int;
    end if;
  end if;

  insert into public.games (mode, white, black, bot_level, moves, status, result, result_reason,
                            white_rating_change, black_rating_change, finished_at)
  values ('bot',
          case when p_color = 'white' then uid end,
          case when p_color = 'black' then uid end,
          p_level, p_moves, 'finished', p_result, p_reason,
          case when p_color = 'white' then change end,
          case when p_color = 'black' then change end,
          now())
  returning id into gid;

  update public.profiles
     set rating = rating + change, games_played = games_played + 1,
         wins = wins + won::int,
         draws = draws + (p_result = 'draw')::int,
         losses = losses + (not won and p_result <> 'draw')::int
   where id = uid
  returning rating into newr;

  update public.bot_ratings
     set rating = greatest(400, rating + dbot), games_played = games_played + 1,
         wins = wins + (not won and p_result <> 'draw')::int,
         losses = losses + won::int,
         draws = draws + (p_result = 'draw')::int
   where level = p_level
  returning rating into newbot;

  return jsonb_build_object('game_id', gid, 'rating_change', change, 'new_rating', newr,
                            'bot_level', p_level, 'bot_rating', newbot, 'bot_rating_change', dbot);
end;
$$;

-- same as before, plus a count of learned games for the Dynamic bot's stats
create or replace function public.learn_from_game(p_game uuid, p_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := ic_private.require_user();
  g     public.games%rowtype;
  saved int := 0;
begin
  select * into g from public.games where id = p_game for update;
  if not found or (uid is distinct from g.white and uid is distinct from g.black) then
    raise exception 'Game not found.';
  end if;
  if g.status <> 'finished' or g.result is null or g.learned then return 0; end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then raise exception 'The game record is not valid.'; end if;

  update public.games set learned = true where id = p_game;

  with entries as (
    select x ->> 'key' as k, x ->> 'move' as m, x ->> 'side' as s
      from jsonb_array_elements(p_entries) with ordinality as t(x, i)
     where i <= 200 and jsonb_typeof(x) = 'object'
  ),
  valid as (
    select k, m, s from entries
     where k is not null and length(k) between 5 and 400 and k ~ '^[wb]\|'
       and ic_private.valid_move(m) and s in ('white', 'black')
  ),
  tally as (
    select k, m,
           count(*) filter (where g.result = s)                         as w,
           count(*) filter (where g.result <> s and g.result <> 'draw') as l,
           count(*) filter (where g.result = 'draw')                   as d
      from valid group by k, m
  ),
  up as (
    insert into public.playbook (position_key, move, wins, losses, draws)
    select k, m, w, l, d from tally
    on conflict (position_key, move) do update
      set wins = public.playbook.wins + excluded.wins,
          losses = public.playbook.losses + excluded.losses,
          draws = public.playbook.draws + excluded.draws
    returning 1
  )
  select count(*) into saved from up;

  if saved > 0 then
    update public.bot_ratings set games_learned = games_learned + 1 where level = 'dynamic';
  end if;
  return saved;
end;
$$;

revoke execute on function public.record_bot_game(text, text, jsonb, text, text), public.learn_from_game(uuid, jsonb) from public, anon;
grant execute on function public.record_bot_game(text, text, jsonb, text, text), public.learn_from_game(uuid, jsonb) to authenticated;
