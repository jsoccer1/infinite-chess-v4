-- =====================================================================================
-- Infinite Chess: Supabase setup
-- Run this whole file once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- It is safe to run again: it creates what is missing and replaces functions and policies.
--
-- Creates:
--   tables     profiles, lobbies, games, playbook (+ private lobby_secrets, game_reports)
--   functions  list_open_lobbies, create_lobby, join_lobby, leave_lobby, make_move,
--              report_result, resign_game, claim_abandoned, record_bot_game, learn_from_game
--   storage    public "avatars" bucket, each user may write only their own folder
--   realtime   lobbies and games broadcast row updates to the two players
--
-- Security model
--   * RLS is on for every table. The browser can read what the app needs and can only
--     write profiles.username and profiles.avatar for its own row.
--   * All game logic runs in the functions below. They are SECURITY DEFINER so they can
--     update ratings, but each one checks auth.uid() first and only signed-in users may
--     call them. Helpers live in the unexposed schema "ic_private".
--   * New tables are not exposed to the Data API automatically on current Supabase
--     projects, so every grant the app needs is written out explicitly.
-- =====================================================================================

create extension if not exists pgcrypto with schema extensions;
create schema if not exists ic_private;
revoke all on schema ic_private from public, anon, authenticated;

-- -------------------------------------------------------------------------------------
-- Tables
-- -------------------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null,
  avatar       text not null default 'preset:1',
  rating       integer not null default 1200,
  games_played integer not null default 0,
  wins         integer not null default 0,
  losses       integer not null default 0,
  draws        integer not null default 0,
  created_at   timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint profiles_avatar_format check (
    avatar ~ '^preset:([1-9]|1[0-2])$'
    or avatar ~ ('^upload:' || id::text || '/avatar\.webp(\?v=[0-9]{1,15})?$')
  )
);
create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));
create index if not exists profiles_rating_idx on public.profiles (rating desc);

create table if not exists public.lobbies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  host       uuid not null references public.profiles (id) on delete cascade,
  host_color text not null check (host_color in ('white', 'black')),
  guest      uuid references public.profiles (id) on delete set null,
  game_id    uuid,
  status     text not null default 'waiting' check (status in ('waiting', 'playing', 'closed')),
  created_at timestamptz not null default now()
);
-- a name can be reused once its lobby is closed
create unique index if not exists lobbies_open_name_key on public.lobbies (lower(name)) where status <> 'closed';
create index if not exists lobbies_host_idx on public.lobbies (host);
create index if not exists lobbies_guest_idx on public.lobbies (guest);
create index if not exists lobbies_waiting_idx on public.lobbies (created_at desc) where status = 'waiting';

-- lobby passwords are kept apart from the lobby row so Realtime and selects never carry them
create table if not exists public.lobby_secrets (
  lobby_id      uuid primary key references public.lobbies (id) on delete cascade,
  password_hash text not null
);

create table if not exists public.games (
  id                  uuid primary key default gen_random_uuid(),
  lobby_id            uuid references public.lobbies (id) on delete set null,
  mode                text not null check (mode in ('online', 'bot')),
  white               uuid references public.profiles (id) on delete set null,
  black               uuid references public.profiles (id) on delete set null,
  bot_level           text check (bot_level in ('easy', 'medium', 'hard')),
  moves               jsonb not null default '[]'::jsonb check (jsonb_typeof(moves) = 'array'),
  status              text not null default 'active' check (status in ('active', 'finished', 'disputed')),
  result              text check (result in ('white', 'black', 'draw')),
  result_reason       text,
  white_rating_change integer,
  black_rating_change integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  finished_at         timestamptz,
  learned             boolean not null default false
);
create index if not exists games_white_idx on public.games (white, created_at desc);
create index if not exists games_black_idx on public.games (black, created_at desc);
create index if not exists games_lobby_idx on public.games (lobby_id);

alter table public.lobbies drop constraint if exists lobbies_game_fk;
alter table public.lobbies add constraint lobbies_game_fk foreign key (game_id) references public.games (id) on delete set null;

-- each player's end-of-game report, compared by report_result
create table if not exists public.game_reports (
  game_id    uuid not null references public.games (id) on delete cascade,
  player     uuid not null references public.profiles (id) on delete cascade,
  result     text not null,
  reason     text not null,
  created_at timestamptz not null default now(),
  primary key (game_id, player)
);
create index if not exists game_reports_player_idx on public.game_reports (player);

create table if not exists public.playbook (
  position_key text not null,
  move         text not null,
  wins         integer not null default 0,
  losses       integer not null default 0,
  draws        integer not null default 0,
  primary key (position_key, move)
);

-- -------------------------------------------------------------------------------------
-- Row Level Security and grants
-- -------------------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.lobbies       enable row level security;
alter table public.lobby_secrets enable row level security;
alter table public.games         enable row level security;
alter table public.game_reports  enable row level security;
alter table public.playbook      enable row level security;

revoke all on public.profiles, public.lobbies, public.lobby_secrets, public.games, public.game_reports, public.playbook
  from anon, authenticated;

-- profiles: everyone reads; a signed-in user may change only their own username and avatar
grant select on public.profiles to anon, authenticated;
grant update (username, avatar) on public.profiles to authenticated;
drop policy if exists "Profiles are readable by everyone" on public.profiles;
create policy "Profiles are readable by everyone" on public.profiles
  for select to anon, authenticated using (true);
drop policy if exists "Players update their own profile" on public.profiles;
create policy "Players update their own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- lobbies: only the two players in a lobby can read it
grant select on public.lobbies to authenticated;
drop policy if exists "Lobby players read their lobby" on public.lobbies;
create policy "Lobby players read their lobby" on public.lobbies
  for select to authenticated
  using ((select auth.uid()) = host or (select auth.uid()) = guest);

-- games: only the players in a game can read it
grant select on public.games to authenticated;
drop policy if exists "Players read their games" on public.games;
create policy "Players read their games" on public.games
  for select to authenticated
  using ((select auth.uid()) = white or (select auth.uid()) = black);

-- playbook: everyone reads (guests' bots use it too)
grant select on public.playbook to anon, authenticated;
drop policy if exists "Playbook is readable by everyone" on public.playbook;
create policy "Playbook is readable by everyone" on public.playbook
  for select to anon, authenticated using (true);

-- lobby_secrets and game_reports: no grants and no policies, so only the functions can touch them

-- -------------------------------------------------------------------------------------
-- Profiles: friendly checks and automatic creation on sign-up
-- -------------------------------------------------------------------------------------
create or replace function ic_private.check_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.username := btrim(new.username);
  if new.username !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Usernames are 3 to 20 characters: letters, numbers and underscore.';
  end if;
  if exists (select 1 from public.profiles p where lower(p.username) = lower(new.username) and p.id <> new.id) then
    raise exception 'That username is taken. Try another one.';
  end if;
  if not (new.avatar ~ '^preset:([1-9]|1[0-2])$'
          or new.avatar ~ ('^upload:' || new.id::text || '/avatar\.webp(\?v=[0-9]{1,15})?$')) then
    raise exception 'That avatar is not valid.';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_check on public.profiles;
create trigger profiles_check before insert or update of username, avatar on public.profiles
  for each row execute function ic_private.check_profile();

create or replace function ic_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := btrim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  pick   text := coalesce(new.raw_user_meta_data ->> 'avatar', '');
  uname  text;
  tries  int := 0;
begin
  if wanted !~ '^[A-Za-z0-9_]{3,20}$' then wanted := 'player'; end if;
  if pick !~ '^preset:([1-9]|1[0-2])$' then pick := 'preset:1'; end if;
  uname := wanted;
  -- if the name is taken, add digits until it is free
  while exists (select 1 from public.profiles p where lower(p.username) = lower(uname)) loop
    tries := tries + 1;
    uname := left(wanted, 14) || '_' || lpad((floor(random() * 100000))::int::text, 5, '0');
    if tries > 20 then uname := 'p_' || replace(left(new.id::text, 18), '-', ''); exit; end if;
  end loop;
  insert into public.profiles (id, username, avatar) values (new.id, uname, pick);
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function ic_private.handle_new_user();

-- profiles for any users that existed before this script ran
insert into public.profiles (id, username)
select u.id, 'p_' || replace(left(u.id::text, 18), '-', '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- -------------------------------------------------------------------------------------
-- Private helpers
-- -------------------------------------------------------------------------------------
create or replace function ic_private.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  return uid;
end;
$$;

create or replace function ic_private.valid_move(m text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select m is not null and length(m) <= 20
     and m ~ '^[QBNR]([1-9]|1[0-8])-[QBNR]([1-9]|1[0-8])(=[QRBN])?$';
$$;

-- Ends an online game, applies Elo (K = 32) and updates both players' stats.
create or replace function ic_private.finish_online(p_game uuid, p_result text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g     public.games%rowtype;
  rw    int;
  rb    int;
  ew    numeric;
  sw    numeric;
  dw    int;
begin
  select * into g from public.games where id = p_game for update;
  if not found or g.status <> 'active' then return; end if;

  select rating into rw from public.profiles where id = g.white for update;
  select rating into rb from public.profiles where id = g.black for update;
  sw := case p_result when 'white' then 1 when 'black' then 0 else 0.5 end;
  ew := 1 / (1 + power(10::numeric, (coalesce(rb, 1200) - coalesce(rw, 1200)) / 400.0));
  dw := round(32 * (sw - ew));

  update public.games
     set status = 'finished', result = p_result, result_reason = p_reason,
         white_rating_change = dw, black_rating_change = -dw,
         finished_at = now(), updated_at = now()
   where id = p_game;

  update public.profiles
     set rating = rating + dw, games_played = games_played + 1,
         wins = wins + (p_result = 'white')::int, losses = losses + (p_result = 'black')::int, draws = draws + (p_result = 'draw')::int
   where id = g.white;
  update public.profiles
     set rating = rating - dw, games_played = games_played + 1,
         wins = wins + (p_result = 'black')::int, losses = losses + (p_result = 'white')::int, draws = draws + (p_result = 'draw')::int
   where id = g.black;

  if g.lobby_id is not null then
    update public.lobbies set status = 'closed' where id = g.lobby_id;
  end if;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Lobbies
-- -------------------------------------------------------------------------------------
create or replace function public.list_open_lobbies()
returns table (name text, host_username text, host_rating integer, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform ic_private.require_user();
  return query
    select l.name, p.username, p.rating, l.created_at
      from public.lobbies l
      join public.profiles p on p.id = l.host
     where l.status = 'waiting' and l.created_at > now() - interval '2 hours'
     order by l.created_at desc
     limit 50;
end;
$$;

create or replace function public.create_lobby(p_name text, p_password text, p_color text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := ic_private.require_user();
  nm    text := btrim(coalesce(p_name, ''));
  color text := p_color;
  lid   uuid;
begin
  if length(nm) < 1 or length(nm) > 40 then raise exception 'Lobby names are 1 to 40 characters.'; end if;
  if coalesce(length(p_password), 0) < 1 then raise exception 'Please choose a lobby password.'; end if;
  if length(p_password) > 72 then raise exception 'Lobby passwords can be at most 72 characters.'; end if;
  if color = 'random' then color := case when random() < 0.5 then 'white' else 'black' end; end if;
  if color not in ('white', 'black') then raise exception 'Pick White, Black or Random.'; end if;

  -- a host has one waiting lobby at a time; old waiting lobbies stop blocking their names
  update public.lobbies set status = 'closed'
   where status = 'waiting' and (host = uid or created_at < now() - interval '2 hours');

  if exists (select 1 from public.lobbies where lower(name) = lower(nm) and status <> 'closed') then
    raise exception 'That lobby name is already in use. Pick another one.';
  end if;

  insert into public.lobbies (name, host, host_color) values (nm, uid, color) returning id into lid;
  insert into public.lobby_secrets (lobby_id, password_hash)
    values (lid, extensions.crypt(p_password, extensions.gen_salt('bf')));
  return lid;
end;
$$;

create or replace function public.join_lobby(p_name text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := ic_private.require_user();
  l   public.lobbies%rowtype;
  h   text;
  gid uuid;
begin
  select * into l from public.lobbies
   where lower(name) = lower(btrim(coalesce(p_name, ''))) and status <> 'closed'
   for update;
  if not found then raise exception 'Wrong lobby name or password.'; end if;
  select password_hash into h from public.lobby_secrets where lobby_id = l.id;
  if h is null or h <> extensions.crypt(coalesce(p_password, ''), h) then
    raise exception 'Wrong lobby name or password.';
  end if;

  if l.status = 'playing' then
    -- rejoin after a refresh
    if uid = l.host or uid = l.guest then return l.game_id; end if;
    raise exception 'That lobby already has two players.';
  end if;
  if uid = l.host then raise exception 'You are hosting this lobby. Wait for someone to join.'; end if;

  insert into public.games (lobby_id, mode, white, black)
  values (l.id, 'online',
          case when l.host_color = 'white' then l.host else uid end,
          case when l.host_color = 'white' then uid else l.host end)
  returning id into gid;
  update public.lobbies set guest = uid, game_id = gid, status = 'playing' where id = l.id;
  return gid;
end;
$$;

create or replace function public.leave_lobby(p_lobby uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := ic_private.require_user();
begin
  update public.lobbies set status = 'closed'
   where id = p_lobby and host = uid and status = 'waiting';
  if not found then raise exception 'That lobby can no longer be cancelled.'; end if;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Online games
-- -------------------------------------------------------------------------------------
create or replace function public.make_move(p_game uuid, p_move text, p_ply integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := ic_private.require_user();
  g   public.games%rowtype;
  n   int;
begin
  select * into g from public.games where id = p_game for update;
  if not found or (uid is distinct from g.white and uid is distinct from g.black) then
    raise exception 'Game not found.';
  end if;
  if g.mode <> 'online' or g.status <> 'active' then raise exception 'This game is already over.'; end if;
  n := jsonb_array_length(g.moves);
  if p_ply is distinct from n then raise exception 'That move is out of date. The board will catch up in a moment.'; end if;
  if (n % 2 = 0 and uid is distinct from g.white) or (n % 2 = 1 and uid is distinct from g.black) then
    raise exception 'It is not your turn.';
  end if;
  if not ic_private.valid_move(p_move) then raise exception 'That move could not be read.'; end if;
  if n >= 2000 then raise exception 'This game has reached the move limit.'; end if;

  update public.games
     set moves = moves || jsonb_build_array(p_move), updated_at = now()
   where id = p_game;
end;
$$;

create or replace function public.report_result(p_game uuid, p_result text, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := ic_private.require_user();
  g    public.games%rowtype;
  mine public.game_reports%rowtype;
  them public.game_reports%rowtype;
begin
  select * into g from public.games where id = p_game for update;
  if not found or (uid is distinct from g.white and uid is distinct from g.black) then
    raise exception 'Game not found.';
  end if;
  if g.status <> 'active' then return g.status; end if;
  if p_result not in ('white', 'black', 'draw') then raise exception 'That result is not valid.'; end if;
  if coalesce(length(p_reason), 0) < 1 or length(p_reason) > 40 then raise exception 'That result reason is not valid.'; end if;

  insert into public.game_reports (game_id, player, result, reason)
  values (p_game, uid, p_result, p_reason)
  on conflict (game_id, player) do update set result = excluded.result, reason = excluded.reason, created_at = now();

  select * into mine from public.game_reports where game_id = p_game and player = uid;
  select * into them from public.game_reports where game_id = p_game and player <> uid;
  if not found then return 'waiting_for_opponent_report'; end if;

  if mine.result = them.result and mine.reason = them.reason then
    perform ic_private.finish_online(p_game, p_result, p_reason);
    return 'finished';
  end if;

  update public.games set status = 'disputed', finished_at = now(), updated_at = now() where id = p_game;
  if g.lobby_id is not null then update public.lobbies set status = 'closed' where id = g.lobby_id; end if;
  return 'disputed';
end;
$$;

create or replace function public.resign_game(p_game uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := ic_private.require_user();
  g   public.games%rowtype;
begin
  select * into g from public.games where id = p_game for update;
  if not found or (uid is distinct from g.white and uid is distinct from g.black) then
    raise exception 'Game not found.';
  end if;
  if g.mode <> 'online' or g.status <> 'active' then raise exception 'This game is already over.'; end if;
  perform ic_private.finish_online(p_game, case when uid = g.white then 'black' else 'white' end, 'resign');
end;
$$;

create or replace function public.claim_abandoned(p_game uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := ic_private.require_user();
  g   public.games%rowtype;
  n   int;
begin
  select * into g from public.games where id = p_game for update;
  if not found or (uid is distinct from g.white and uid is distinct from g.black) then
    raise exception 'Game not found.';
  end if;
  if g.mode <> 'online' or g.status <> 'active' then raise exception 'This game is already over.'; end if;
  n := jsonb_array_length(g.moves);
  if (n % 2 = 0 and uid = g.white) or (n % 2 = 1 and uid = g.black) then
    raise exception 'It is your turn, so there is nothing to claim yet.';
  end if;
  if g.updated_at > now() - interval '10 minutes' then
    raise exception 'Your opponent still has time. You can claim the win after 10 minutes without a move.';
  end if;
  perform ic_private.finish_online(p_game, case when uid = g.white then 'white' else 'black' end, 'abandoned');
end;
$$;

-- -------------------------------------------------------------------------------------
-- Bot games and the learned playbook
-- -------------------------------------------------------------------------------------
-- Rating rules for bot games: wins add points (easy 5, medium 10, hard 15); losses and
-- draws never lower the rating; games under 20 moves (plies) are unrated.
create or replace function public.record_bot_game(p_level text, p_color text, p_moves jsonb, p_result text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := ic_private.require_user();
  n      int;
  bad    int;
  won    boolean;
  change int := 0;
  gid    uuid;
  newr   int;
begin
  if p_level not in ('easy', 'medium', 'hard') then raise exception 'Unknown bot level.'; end if;
  if p_color not in ('white', 'black') then raise exception 'Unknown color.'; end if;
  if p_result not in ('white', 'black', 'draw') then raise exception 'That result is not valid.'; end if;
  if coalesce(length(p_reason), 0) < 1 or length(p_reason) > 40 then raise exception 'That result reason is not valid.'; end if;
  if p_moves is null or jsonb_typeof(p_moves) <> 'array' then raise exception 'The move list is missing.'; end if;
  n := jsonb_array_length(p_moves);
  if n < 1 or n > 2000 then raise exception 'The move list is not valid.'; end if;
  select count(*) into bad from jsonb_array_elements(p_moves) e
   where jsonb_typeof(e) <> 'string' or not ic_private.valid_move(e #>> '{}');
  if bad > 0 then raise exception 'The move list is not valid.'; end if;
  if exists (select 1 from public.games
              where mode = 'bot' and (white = uid or black = uid) and created_at > now() - interval '20 seconds') then
    raise exception 'Please wait a moment before saving another bot game.';
  end if;

  won := (p_result = p_color);
  if won and n >= 20 then change := case p_level when 'easy' then 5 when 'medium' then 10 else 15 end; end if;

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

  return jsonb_build_object('game_id', gid, 'rating_change', change, 'new_rating', newr);
end;
$$;

-- Adds a finished game's moves to the playbook. Each game is learned once; later calls return 0.
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
    select e ->> 'key' as k, e ->> 'move' as m, e ->> 'side' as s
      from jsonb_array_elements(p_entries) with ordinality as t(e, i)
     where i <= 200 and jsonb_typeof(e) = 'object'
  ),
  valid as (
    select k, m, s from entries
     where k is not null and length(k) between 5 and 400 and k ~ '^[wb]\|'
       and ic_private.valid_move(m) and s in ('white', 'black')
  ),
  tally as (
    select k, m,
           count(*) filter (where g.result = s)                    as w,
           count(*) filter (where g.result <> s and g.result <> 'draw') as l,
           count(*) filter (where g.result = 'draw')              as d
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
  return saved;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Function permissions: only signed-in players may call the game functions
-- -------------------------------------------------------------------------------------
-- helpers are called only from inside the functions below, which run as their owner
revoke execute on all functions in schema ic_private from public, anon, authenticated;

revoke execute on function
  public.list_open_lobbies(), public.create_lobby(text, text, text), public.join_lobby(text, text),
  public.leave_lobby(uuid), public.make_move(uuid, text, integer), public.report_result(uuid, text, text),
  public.resign_game(uuid), public.claim_abandoned(uuid),
  public.record_bot_game(text, text, jsonb, text, text), public.learn_from_game(uuid, jsonb)
  from public, anon;
grant execute on function
  public.list_open_lobbies(), public.create_lobby(text, text, text), public.join_lobby(text, text),
  public.leave_lobby(uuid), public.make_move(uuid, text, integer), public.report_result(uuid, text, text),
  public.resign_game(uuid), public.claim_abandoned(uuid),
  public.record_bot_game(text, text, jsonb, text, text), public.learn_from_game(uuid, jsonb)
  to authenticated;

-- -------------------------------------------------------------------------------------
-- Realtime: players receive updates to their lobby and game rows
-- -------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lobbies') then
      alter publication supabase_realtime add table public.lobbies;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games') then
      alter publication supabase_realtime add table public.games;
    end if;
  end if;
end;
$$;

-- -------------------------------------------------------------------------------------
-- Storage: public avatars bucket; each user writes only <their id>/avatar.webp
-- -------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/webp'];

drop policy if exists "Players upload their own avatar" on storage.objects;
create policy "Players upload their own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.webp');
drop policy if exists "Players read their own avatar object" on storage.objects;
create policy "Players read their own avatar object" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.webp');
drop policy if exists "Players replace their own avatar" on storage.objects;
create policy "Players replace their own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.webp')
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.webp');

-- -------------------------------------------------------------------------------------
-- Bot ratings and the Dynamic bot (also shipped separately as update-002-bot-ratings.sql)
-- -------------------------------------------------------------------------------------

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

-- Done. Next: fill in config.js and set Authentication > URL Configuration > Site URL to your GitHub Pages link.
