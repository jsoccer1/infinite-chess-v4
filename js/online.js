// ================= Online layer: Supabase client, accounts, profiles, lobbies, online games, playbook =================
// Everything here sits on top of the engine (js/engine.js) and the board UI (js/ui.js).
// If config.js still has placeholders, or Supabase cannot be reached, the online parts are hidden
// and bot play keeps working exactly as before.
const App = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cfg = window.APP_CONFIG || {};
  const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_KEY && !/PASTE_/.test(String(cfg.SUPABASE_URL) + String(cfg.SUPABASE_KEY)));
  const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
  const ACTIVE_KEY = 'ic_active_game';
  const ABANDON_MS = 10 * 60 * 1000;

  let sb = null, online = false, user = null, profile = null;
  let view = 'home', pendingJoin = null, afterAuth = null;

  // ---------- small helpers ----------
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
    remove: (k) => { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  };
  let busy = 0;
  function spin(d) { busy = Math.max(0, busy + d); $('net-spinner').hidden = busy === 0; }
  async function net(p) { spin(1); try { return await p; } finally { spin(-1); } }
  async function rpc(name, params) {
    const { data, error } = await net(sb.rpc(name, params));
    if (error) throw error;
    return data;
  }
  async function q(builder) {
    const { data, error } = await net(builder);
    if (error) throw error;
    return data;
  }
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  function toast(msg, kind = 'error') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind; t.textContent = msg; t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    $('toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'error' ? 6000 : 3500);
  }
  const errMsg = (e) => (e && e.message) || 'Something went wrong.';
  // run an async action with a spinner on the button that triggered it
  async function withButton(btn, fn) {
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }
    try { return await fn(); } catch (e) { toast(errMsg(e)); return undefined; } finally { if (btn) { btn.disabled = false; btn.classList.remove('loading'); } }
  }
  const signed = (n) => (n == null ? '' : n > 0 ? '+' + n : n < 0 ? '\u2212' + Math.abs(n) : '\u00B10');
  const fmtDate = (s) => { try { return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return ''; } };
  const REASON = { checkmate: 'by checkmate', stalemate: 'by stalemate', repetition: 'by threefold repetition', resign: 'by resignation', resignation: 'by resignation', abandoned: 'because the opponent left', abandon: 'because the opponent left' };
  const reasonText = (r) => REASON[r] || (r ? 'by ' + String(r).replace(/_/g, ' ') : '');
  function asRow(data) { return Array.isArray(data) ? data[0] : data; }
  function asId(data) { const d = asRow(data); return d && typeof d === 'object' ? (d.id || d.game_id || d.lobby_id || Object.values(d)[0]) : d; }

  // ---------- views ----------
  const VIEWS = ['home', 'game', 'online', 'leaderboard', 'profile', 'howto', 'auth'];
  function show(v) {
    view = v;
    VIEWS.forEach((x) => ($('view-' + x).hidden = x !== v));
    document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('current', b.dataset.nav === v));
    if (v === 'game') GameUI.activate();
    if (v === 'online') { renderOnlineView(); startLobbyList(); } else stopLobbyList();
    if (v === 'leaderboard') loadLeaderboard();
    if (v === 'profile') loadProfileView();
    if (v === 'home') renderHome();
    window.scrollTo(0, 0);
  }
  function needAuth(next) { afterAuth = next; showAuth('signin'); }
  function navigate(target) {
    if (target === 'bot') { playVsBot(); return; }
    if ((target === 'online' || target === 'profile') && !user) { needAuth(target); return; }
    show(target);
  }

  // ---------- header, banner, home ----------
  function setBanner(text) { const b = $('net-banner'); b.textContent = text || ''; b.hidden = !text; }
  function setOnlineUI(on) {
    document.querySelectorAll('[data-online]').forEach((el) => (el.hidden = !on));
    renderHeader(); renderHome(); GameUI.refresh();
  }
  function setMenu(open) {
    $('topbar').classList.toggle('open', open);
    $('menu-btn').setAttribute('aria-expanded', String(open));
    $('menu-btn').setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  function renderHeader() {
    $('menu-signout').hidden = !(online && user);
    const a = $('user-area');
    if (!online) { a.innerHTML = ''; return; }
    if (!user) { a.innerHTML = '<button type="button" class="btn primary small" id="hdr-signin">Sign in</button>'; $('hdr-signin').onclick = () => showAuth('signin'); return; }
    const p = profile || {};
    a.innerHTML = `<button type="button" class="user-chip" id="hdr-profile" title="Your profile">${Avatars.img(p.avatar, 28)}<span class="uname">${esc(p.username || 'Player')}</span><span class="urating">${p.rating != null ? esc(p.rating) : ''}</span></button>` +
      '<button type="button" class="btn small" id="hdr-signout">Sign out</button>';
    $('hdr-profile').onclick = () => show('profile');
    $('hdr-signout').onclick = (e) => withButton(e.currentTarget, async () => { closeGame(); await net(sb.auth.signOut()); });
  }
  function renderHome() {
    const r = $('home-resume');
    const id = store.get(ACTIVE_KEY);
    r.hidden = !(online && user && id && !(og && og.id === id && view === 'game'));
  }

  // ---------- init ----------
  async function init() {
    GameUI.setHooks({ toast, isSignedIn: () => !!(online && user), onlineAvailable: () => online, fetchPlaybook, onLocalGameOver });
    document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => { setMenu(false); navigate(b.dataset.nav); }));
    $('menu-btn').addEventListener('click', (e) => { e.stopPropagation(); setMenu(!$('topbar').classList.contains('open')); });
    document.addEventListener('click', (e) => { if (!e.target.closest('#topnav')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    $('menu-signout').addEventListener('click', () => { setMenu(false); if (sb) withButton(null, async () => { closeGame(); await net(sb.auth.signOut()); }); });
    $('home-resume').addEventListener('click', (e) => withButton(e.currentTarget, () => openGame(store.get(ACTIVE_KEY))));
    wireAuth(); wireProfile(); wireLobbies(); wireGame();
    setOnlineUI(false);
    show('home');

    const lobbyParam = new URLSearchParams(location.search).get('lobby');
    if (!configured) { setBanner('Online features not configured'); return; }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') { setBanner('Offline'); return; }
    try { sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY); } catch (e) { setBanner('Offline'); return; }
    const reachable = await net(withTimeout(sb.from('profiles').select('id').limit(1), 8000)).then((r) => !r.error).catch(() => false);
    if (!reachable) { setBanner('Offline'); sb = null; return; }
    online = true;
    setOnlineUI(true);

    sb.auth.onAuthStateChange((event, session) => {
      // run outside the callback: calling Supabase inside it can deadlock
      setTimeout(() => onAuth(event, session), 0);
    });
    const { data } = await net(sb.auth.getSession());
    await setUser(data && data.session ? data.session.user : null);
    if (lobbyParam) {
      pendingJoin = lobbyParam;
      if (user) openJoin(lobbyParam);
      else { needAuth('join'); $('auth-note').textContent = `Sign in to join the lobby \u201C${lobbyParam}\u201D.`; }
    }
  }

  async function onAuth(event, session) {
    if (event === 'PASSWORD_RECOVERY') { showAuth('reset'); return; }
    const u = session ? session.user : null;
    if (event === 'SIGNED_OUT') { await setUser(null); show('home'); return; }
    if ((u && (!user || u.id !== user.id)) || event === 'USER_UPDATED') await setUser(u);
  }

  async function setUser(u) {
    const changed = (u && u.id) !== (user && user.id);
    user = u;
    profile = null;
    if (user) await loadProfile();
    renderHeader(); renderHome(); GameUI.refresh();
    if (user && changed) {
      // reconnect to an online game that was in progress before a refresh
      const id = store.get(ACTIVE_KEY);
      if (id) {
        try {
          const row = await q(sb.from('games').select('id,status').eq('id', id).maybeSingle());
          if (row && row.status === 'active') { await openGame(id); return; }
          store.remove(ACTIVE_KEY); renderHome();
        } catch (e) { /* keep the id; the Resume button still works */ }
      }
      if (afterAuth) { const next = afterAuth; afterAuth = null; if (next === 'join' && pendingJoin) openJoin(pendingJoin); else show(next); }
      else if (view === 'auth') show('home');
    }
  }
  async function loadProfile() {
    if (!user) return;
    try { profile = await q(sb.from('profiles').select('*').eq('id', user.id).maybeSingle()); }
    catch (e) { toast(errMsg(e)); }
    renderHeader();
  }

  // ---------- accounts ----------
  function showAuth(tab) {
    show('auth');
    ['signin', 'signup', 'forgot', 'reset'].forEach((t) => ($('auth-' + t).hidden = t !== tab));
    document.querySelectorAll('.auth-tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    $('auth-tabs').hidden = tab === 'reset';
    $('auth-msg').textContent = ''; $('auth-msg').className = 'form-msg';
    if (tab !== 'signin' || !pendingJoin) $('auth-note').textContent = '';
  }
  function authMsg(text, ok) { const m = $('auth-msg'); m.textContent = text; m.className = 'form-msg ' + (ok ? 'ok' : 'err'); }
  let signupAvatar = 'preset:1';
  function avatarPicker(container, current, onPick) {
    container.innerHTML = Array.from({ length: Avatars.COUNT }, (_, i) => {
      const v = 'preset:' + (i + 1);
      return `<button type="button" class="av-pick" data-av="${v}" aria-pressed="${v === current}" aria-label="Avatar ${i + 1}">${Avatars.img(v, 40)}</button>`;
    }).join('');
    container.onclick = (e) => {
      const b = e.target.closest('[data-av]'); if (!b) return;
      container.querySelectorAll('[data-av]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      onPick(b.dataset.av);
    };
  }
  function wireAuth() {
    document.querySelectorAll('.auth-tabs button').forEach((b) => b.addEventListener('click', () => showAuth(b.dataset.tab)));
    avatarPicker($('su-avatars'), signupAvatar, (v) => (signupAvatar = v));
    $('auth-signin').addEventListener('submit', (e) => {
      e.preventDefault();
      withButton(e.submitter, async () => {
        const { error } = await net(sb.auth.signInWithPassword({ email: $('si-email').value.trim(), password: $('si-password').value }));
        if (error) { authMsg(error.message, false); return; }
        $('si-password').value = '';
      });
    });
    $('auth-signup').addEventListener('submit', (e) => {
      e.preventDefault();
      const username = $('su-username').value.trim();
      if (!USERNAME_RE.test(username)) { authMsg('Usernames are 3 to 20 characters: letters, numbers and underscore.', false); return; }
      withButton(e.submitter, async () => {
        const { error } = await net(sb.auth.signUp({
          email: $('su-email').value.trim(), password: $('su-password').value,
          options: { data: { username, avatar: signupAvatar }, emailRedirectTo: location.origin + location.pathname },
        }));
        if (error) { authMsg(error.message, false); return; }
        $('su-password').value = '';
        authMsg('Check your email to confirm your account, then sign in.', true);
      });
    });
    $('auth-forgot').addEventListener('submit', (e) => {
      e.preventDefault();
      withButton(e.submitter, async () => {
        const { error } = await net(sb.auth.resetPasswordForEmail($('fp-email').value.trim(), { redirectTo: location.origin + location.pathname }));
        if (error) { authMsg(error.message, false); return; }
        authMsg('If that email has an account, a reset link is on its way.', true);
      });
    });
    $('auth-reset').addEventListener('submit', (e) => {
      e.preventDefault();
      withButton(e.submitter, async () => {
        const { error } = await net(sb.auth.updateUser({ password: $('rp-password').value }));
        if (error) { authMsg(error.message, false); return; }
        $('rp-password').value = '';
        toast('Password updated.', 'ok');
        show('home');
      });
    });
  }

  // ---------- profile and leaderboard ----------
  let editAvatar = null;
  function wireProfile() {
    $('pf-save').addEventListener('click', (e) => {
      const username = $('pf-username').value.trim();
      if (!USERNAME_RE.test(username)) { toast('Usernames are 3 to 20 characters: letters, numbers and underscore.'); return; }
      withButton(e.currentTarget, async () => {
        await q(sb.from('profiles').update({ username, avatar: editAvatar }).eq('id', user.id));
        await loadProfile(); toast('Profile saved.', 'ok'); renderProfileHead();
      });
    });
    $('pf-upload').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0]; e.target.value = '';
      if (!file) return;
      withButton($('pf-upload-btn'), async () => {
        const blob = await Avatars.toWebP(file);
        const path = user.id + '/avatar.webp';
        const { error } = await net(sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/webp' }));
        if (error) throw error;
        editAvatar = 'upload:' + path + '?v=' + Date.now();
        await q(sb.from('profiles').update({ username: profile.username, avatar: editAvatar }).eq('id', user.id));
        await loadProfile(); renderProfileHead(); toast('Avatar updated.', 'ok');
      });
    });
    $('pf-upload-btn').addEventListener('click', () => $('pf-upload').click());
  }
  function renderProfileHead() {
    const p = profile || {};
    $('pf-avatar').innerHTML = Avatars.img(editAvatar || p.avatar, 72, 'big');
    $('pf-email').textContent = (user && user.email) || '';
    $('pf-stats').innerHTML = [['Rating', p.rating], ['Games', p.games_played], ['Wins', p.wins], ['Losses', p.losses], ['Draws', p.draws]]
      .map(([k, v]) => `<div><b>${esc(v == null ? '\u2013' : v)}</b><span>${k}</span></div>`).join('');
  }
  async function loadProfileView() {
    if (!user) return;
    await loadProfile();
    const p = profile || {};
    editAvatar = p.avatar || 'preset:1';
    $('pf-username').value = p.username || '';
    avatarPicker($('pf-avatars'), editAvatar, (v) => { editAvatar = v; renderProfileHead(); });
    renderProfileHead();
    const list = $('pf-games');
    list.innerHTML = '<tr><td colspan="4" class="muted"><span class="spinner inline"></span> Loading games\u2026</td></tr>';
    try {
      const games = await q(sb.from('games').select('id,mode,white,black,bot_level,status,result,result_reason,white_rating_change,black_rating_change,created_at')
        .or(`white.eq.${user.id},black.eq.${user.id}`).order('created_at', { ascending: false }).limit(20));
      const ids = [...new Set(games.filter((g) => g.mode === 'online').map((g) => (g.white === user.id ? g.black : g.white)).filter(Boolean))];
      const names = {};
      if (ids.length) (await q(sb.from('profiles').select('id,username').in('id', ids))).forEach((r) => (names[r.id] = r.username));
      list.innerHTML = games.length ? games.map((g) => {
        const mine = g.white === user.id ? 'white' : 'black';
        const opp = g.mode === 'bot' ? `Bot (${esc(g.bot_level || '')})` : esc(names[g.white === user.id ? g.black : g.white] || 'Opponent');
        let res = g.status === 'active' ? 'In progress' : g.status === 'disputed' ? 'Disputed' : g.result === 'draw' ? 'Draw' : g.result === mine ? 'Win' : 'Loss';
        const ch = mine === 'white' ? g.white_rating_change : g.black_rating_change;
        return `<tr><td>${esc(fmtDate(g.created_at))}</td><td>${opp}</td><td>${esc(res)}</td><td class="num ${ch > 0 ? 'up' : ch < 0 ? 'down' : ''}">${esc(signed(ch))}</td></tr>`;
      }).join('') : '<tr><td colspan="4" class="muted">No games yet.</td></tr>';
    } catch (e) { list.innerHTML = `<tr><td colspan="4" class="err">${esc(errMsg(e))}</td></tr>`; }
  }
  async function loadLeaderboard() {
    const body = $('lb-body');
    body.innerHTML = '<tr><td colspan="4" class="muted"><span class="spinner inline"></span> Loading\u2026</td></tr>';
    try {
      const rows = await q(sb.from('profiles').select('id,username,avatar,rating,wins,losses,draws').order('rating', { ascending: false }).limit(50));
      body.innerHTML = rows.map((r, i) => `<tr class="${user && r.id === user.id ? 'me' : ''}"><td class="num">${i + 1}</td><td><span class="who">${Avatars.img(r.avatar, 28)}${esc(r.username)}</span></td><td class="num">${esc(r.rating)}</td><td class="num">${esc(r.wins)}/${esc(r.losses)}/${esc(r.draws)}</td></tr>`).join('') ||
        '<tr><td colspan="4" class="muted">No players yet.</td></tr>';
    } catch (e) { body.innerHTML = `<tr><td colspan="4" class="err">${esc(errMsg(e))}</td></tr>`; }
  }

  // ---------- bots: rated games and the learned playbook ----------
  const playbookCache = new Map();
  async function fetchPlaybook(key) {
    if (!online) return [];
    if (playbookCache.has(key)) return playbookCache.get(key);
    try {
      const { data, error } = await net(withTimeout(sb.from('playbook').select('move,wins,losses,draws').eq('position_key', key), 1500));
      if (error) return [];
      playbookCache.set(key, data || []);
      return data || [];
    } catch (e) { return []; }   // slow or failed: the bot just searches normally
  }
  async function onLocalGameOver(info) {
    const out = $('rated-result');
    out.textContent = '';
    if (!online || !user || !info.rated) return;
    out.innerHTML = '<span class="spinner inline"></span> Saving game\u2026';
    try {
      const res = asRow(await rpc('record_bot_game', { p_level: info.level, p_color: info.humanColor, p_moves: info.moves, p_result: info.result, p_reason: info.reason }));
      const change = res && res.rating_change;
      out.textContent = change ? `Rating ${signed(change)} (now ${res.new_rating}).` : `No rating change${res && res.new_rating != null ? ` (rating ${res.new_rating})` : ''}.`;
      await loadProfile();
      if (res && res.game_id) rpc('learn_from_game', { p_game: res.game_id, p_entries: info.entries }).catch(() => {});
    } catch (e) { out.textContent = errMsg(e); }
  }
  function playVsBot() {
    if (!og && !GameUI.isOnline() && GameUI.moveCount() > 0) { show('game'); return; }   // continue the local game
    closeGame();
    $('opponent').value = 'computer';
    GameUI.newLocal();
    show('game');
  }

  // ---------- lobbies ----------
  let lobbyTimer = null, hosting = null;
  function wireLobbies() {
    $('host-form').addEventListener('submit', (e) => {
      e.preventDefault();
      withButton(e.submitter, async () => {
        const name = $('host-name').value.trim(), pass = $('host-pass').value;
        const id = asId(await rpc('create_lobby', { p_name: name, p_password: pass, p_color: $('host-color').value }));
        startHosting(id, name);
      });
    });
    $('join-form').addEventListener('submit', (e) => {
      e.preventDefault();
      withButton(e.submitter, async () => {
        const gameId = asId(await rpc('join_lobby', { p_name: $('join-name').value.trim(), p_password: $('join-pass').value }));
        $('join-pass').value = ''; pendingJoin = null;
        if (location.search.includes('lobby=')) history.replaceState(null, '', location.pathname);
        await openGame(gameId);
      });
    });
    $('lobby-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-lobby]'); if (!b) return;
      openJoin(b.dataset.lobby);
    });
    $('lobby-refresh').addEventListener('click', () => refreshLobbies());
    $('copy-invite').addEventListener('click', async () => {
      const link = $('invite-link').value;
      try { await navigator.clipboard.writeText(link); toast('Invite link copied.', 'ok'); }
      catch (e) { $('invite-link').select(); toast('Press Ctrl+C or Cmd+C to copy the link.', 'ok'); }
    });
    $('host-cancel').addEventListener('click', (e) => withButton(e.currentTarget, async () => {
      if (hosting) await rpc('leave_lobby', { p_lobby: hosting.id });
      stopHosting(); renderOnlineView();
    }));
  }
  function renderOnlineView() {
    $('lobby-waiting').hidden = !hosting;
    $('lobby-forms').hidden = !!hosting;
  }
  function openJoin(name) {
    show('online');
    $('join-name').value = name || '';
    $('join-pass').focus();
    $('join-form').scrollIntoView({ block: 'center' });
  }
  function startLobbyList() { stopLobbyList(); if (!online || !user) return; refreshLobbies(); lobbyTimer = setInterval(refreshLobbies, 10000); }
  function stopLobbyList() { if (lobbyTimer) clearInterval(lobbyTimer); lobbyTimer = null; }
  async function refreshLobbies() {
    const box = $('lobby-list');
    if (!box.dataset.loaded) box.innerHTML = '<p class="muted"><span class="spinner inline"></span> Loading lobbies\u2026</p>';
    try {
      const rows = (await rpc('list_open_lobbies', {})) || [];
      box.dataset.loaded = '1';
      box.innerHTML = rows.length ? rows.map((r) => `<button type="button" class="lobby-row" data-lobby="${esc(r.name)}"><b>${esc(r.name)}</b><span>${esc(r.host_username)} (${esc(r.host_rating)})</span><small>${esc(fmtDate(r.created_at))}</small></button>`).join('')
        : '<p class="muted">No open lobbies right now. Host one!</p>';
    } catch (e) { box.innerHTML = `<p class="err">${esc(errMsg(e))}</p>`; }
  }
  function startHosting(id, name) {
    stopHosting();
    hosting = { id, name, channel: null, poll: null };
    $('invite-link').value = location.origin + location.pathname + '?lobby=' + encodeURIComponent(name);
    $('waiting-name').textContent = name;
    renderOnlineView();
    hosting.channel = sb.channel('lobby-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lobbies', filter: 'id=eq.' + id }, (payload) => onLobby(payload.new))
      .subscribe();
    hosting.poll = setInterval(async () => {
      try { const row = await q(sb.from('lobbies').select('*').eq('id', id).maybeSingle()); if (row) onLobby(row); } catch (e) { /* retry next tick */ }
    }, 5000);
  }
  function stopHosting() {
    if (!hosting) return;
    if (hosting.channel) sb.removeChannel(hosting.channel);
    if (hosting.poll) clearInterval(hosting.poll);
    hosting = null;
  }
  function onLobby(row) {
    if (!hosting || !row || row.id !== hosting.id) return;
    if (row.status === 'playing' && row.game_id) { const gid = row.game_id; stopHosting(); renderOnlineView(); openGame(gid).catch((e) => toast(errMsg(e))); }
    else if (row.status === 'closed') { stopHosting(); renderOnlineView(); toast('The lobby was closed.'); }
  }

  // ---------- online games ----------
  let og = null;
  function wireGame() {
    $('resign').addEventListener('click', () => {
      if (!og) return;
      confirmModal('Resign this game?', 'Your opponent will be awarded the win.', 'Resign', async () => {
        await rpc('resign_game', { p_game: og.id }); await fetchRow();
      });
    });
    $('claim').addEventListener('click', (e) => withButton(e.currentTarget, async () => { await rpc('claim_abandoned', { p_game: og.id }); await fetchRow(); }));
    $('leave-online').addEventListener('click', () => { const finished = og && og.row.status !== 'active'; closeGame(); if (finished) store.remove(ACTIVE_KEY); show('home'); });
    $('modal-cancel').addEventListener('click', () => ($('modal').hidden = true));
  }
  function confirmModal(title, body, okText, action) {
    $('modal-title').textContent = title; $('modal-body').textContent = body;
    const ok = $('modal-ok'); ok.textContent = okText; ok.hidden = false;
    $('modal-cancel').textContent = 'Cancel';
    ok.onclick = () => withButton(ok, async () => { await action(); $('modal').hidden = true; });
    $('modal').hidden = false; ok.focus();
  }
  function infoModal(title, html) {
    $('modal-title').textContent = title; $('modal-body').innerHTML = html;
    $('modal-ok').hidden = true; $('modal-cancel').textContent = 'Close';
    $('modal').hidden = false;
  }

  async function openGame(gameId) {
    if (!gameId) return;
    if (!user) { needAuth('online'); return; }
    closeGame();
    const row = await q(sb.from('games').select('*').eq('id', gameId).maybeSingle());
    if (!row) { store.remove(ACTIVE_KEY); renderHome(); toast('That game could not be found.'); return; }
    const myColor = row.white === user.id ? 'w' : row.black === user.id ? 'b' : null;
    if (!myColor) { toast('You are not a player in that game.'); return; }
    og = { id: row.id, row, myColor, oppId: myColor === 'w' ? row.black : row.white, players: {}, oppOnline: false,
      channel: null, presence: null, poll: null, tick: null, report: null, reportTimer: null, reportErr: false, finishedShown: false, disputedShown: false, learned: false };
    if (row.status === 'active') store.set(ACTIVE_KEY, row.id);
    try {
      const ps = await q(sb.from('profiles').select('id,username,avatar,rating').in('id', [row.white, row.black].filter(Boolean)));
      ps.forEach((p) => (og.players[p.id] = p));
    } catch (e) { /* names are cosmetic */ }
    const gid = row.id;
    GameUI.startOnline({
      myColor, moves: row.moves || [],
      onMove: (str, ply) => rpc('make_move', { p_game: gid, p_move: str, p_ply: ply }),
      onBoardOver: (result, reason) => startReporting(gid, result, reason),
    });
    renderPlayers();
    show('game');
    og.channel = sb.channel('game-' + gid)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: 'id=eq.' + gid }, (payload) => onRow(payload.new))
      .subscribe();
    og.presence = sb.channel('presence-' + gid, { config: { presence: { key: user.id } } });
    og.presence.on('presence', { event: 'sync' }, () => {
      if (!og || og.id !== gid) return;
      const state = og.presence.presenceState();
      og.oppOnline = !!(og.oppId && state[og.oppId] && state[og.oppId].length);
      renderPlayers();
    }).subscribe(async (status) => { if (status === 'SUBSCRIBED' && og && og.id === gid) await og.presence.track({ user_id: user.id, online_at: new Date().toISOString() }); });
    og.poll = setInterval(fetchRow, 5000);
    og.tick = setInterval(updateClaim, 15000);
    onRow(row);
  }
  async function fetchRow() {
    if (!og) return;
    const id = og.id;
    try { const row = await q(sb.from('games').select('*').eq('id', id).maybeSingle()); if (row && og && og.id === id) onRow(row); } catch (e) { /* next poll */ }
  }
  function onRow(row) {
    if (!og || !row || row.id !== og.id) return;
    og.row = row;
    GameUI.syncMoves(row.moves || []);
    updateClaim();
    if (row.status === 'finished' && !og.finishedShown) finishOnline(row);
    else if (row.status === 'disputed' && !og.disputedShown) {
      og.disputedShown = true; endTimers(); store.remove(ACTIVE_KEY); GameUI.setOnlineFinished(true);
      $('online-msg').textContent = 'Players reported different results. Game not rated.';
      infoModal('Result disputed', '<p>Players reported different results. Game not rated.</p>');
      learn();
    }
    renderPlayers();
  }
  function startReporting(gid, result, reason) {
    if (!og || og.id !== gid) return;
    og.report = { result, reason };
    const send = async () => {
      if (!og || og.id !== gid || og.row.status !== 'active') { if (og && og.reportTimer) { clearInterval(og.reportTimer); og.reportTimer = null; } return; }
      try {
        const res = await rpc('report_result', { p_game: gid, p_result: result, p_reason: reason });
        if (res === 'waiting_for_opponent_report') $('online-msg').textContent = 'Waiting for your opponent to confirm the result\u2026';
        if (res === 'finished' || res === 'disputed') fetchRow();
      } catch (e) { if (og && !og.reportErr) { og.reportErr = true; toast(errMsg(e)); } }
    };
    send();
    if (!og.reportTimer) og.reportTimer = setInterval(() => { fetchRow(); send(); }, 5000);
  }
  async function finishOnline(row) {
    og.finishedShown = true;
    endTimers(); store.remove(ACTIVE_KEY); renderHome();
    GameUI.setOnlineFinished(true);
    const me = og.myColor === 'w' ? 'white' : 'black';
    const headline = row.result === 'draw' ? 'Draw' : row.result === me ? 'You win' : 'You lose';
    const wName = (og.players[row.white] || {}).username || 'White', bName = (og.players[row.black] || {}).username || 'Black';
    const who = row.result === 'draw' ? 'The game is drawn' : (row.result === 'white' ? `${wName} (White) wins` : `${bName} (Black) wins`);
    $('online-msg').textContent = `${headline}. ${who} ${reasonText(row.result_reason)}.`;
    infoModal(headline, `<p>${esc(who)} ${esc(reasonText(row.result_reason))}.</p>` +
      `<table class="mini"><tr><td>${esc(wName)} (White)</td><td class="num">${esc(signed(row.white_rating_change))}</td></tr><tr><td>${esc(bName)} (Black)</td><td class="num">${esc(signed(row.black_rating_change))}</td></tr></table>`);
    await loadProfile();
    learn();
  }
  function learn() {
    if (!og || og.learned) return;
    og.learned = true;
    rpc('learn_from_game', { p_game: og.id, p_entries: GameUI.entries() }).catch(() => {});
  }
  function updateClaim() {
    const btn = $('claim');
    if (!og || og.row.status !== 'active') { btn.hidden = true; return; }
    const ply = (og.row.moves || []).length;
    const turn = ply % 2 === 0 ? 'w' : 'b';
    const last = Date.parse(og.row.updated_at || og.row.created_at) || Date.now();
    btn.hidden = !(turn !== og.myColor && Date.now() - last >= ABANDON_MS);
    $('resign').hidden = false;
  }
  function renderPlayers() {
    if (!og) return;
    const row = og.row, done = row.status !== 'active';
    const line = (id, color, isMe) => {
      const p = og.players[id] || {};
      const presence = isMe ? '' : `<span class="presence ${og.oppOnline ? 'on' : ''}">${og.oppOnline ? 'Opponent online' : 'Opponent offline'}</span>`;
      return `<div class="player ${isMe ? 'me' : ''}">${Avatars.img(p.avatar, 36)}<div><b>${esc(p.username || (isMe ? 'You' : 'Opponent'))}</b><span>${color} \u00B7 ${esc(p.rating != null ? p.rating : '')}</span>${presence}</div></div>`;
    };
    const myId = user.id;
    $('players').innerHTML = line(og.oppId, og.myColor === 'w' ? 'Black' : 'White', false) + line(myId, og.myColor === 'w' ? 'White' : 'Black', true);
    $('resign').hidden = done;
    $('leave-online').textContent = done ? 'Back to home' : 'Leave (game continues)';
  }
  function endTimers() {
    if (!og) return;
    if (og.poll) clearInterval(og.poll); if (og.tick) clearInterval(og.tick); if (og.reportTimer) clearInterval(og.reportTimer);
    og.poll = og.tick = og.reportTimer = null;
    $('claim').hidden = true;
  }
  function closeGame() {
    if (!og) return;
    endTimers();
    if (sb) { if (og.channel) sb.removeChannel(og.channel); if (og.presence) sb.removeChannel(og.presence); }
    og = null;
    $('online-msg').textContent = '';
    GameUI.leaveOnline();
    renderHome();
  }

  return { init, toast };
})();

// Boot: loading screen, then the app, then the #test runner if requested.
GameUI.runLoader(() => { App.init().catch((e) => App.toast((e && e.message) || 'Startup error')); TestRunner.init(); });
