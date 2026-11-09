// ================= MODULE 5: Board drawing, input and game sessions =================
const GameUI = (() => {
  const G = BoardGraph, Ge = Geometry, R = Rules;
  const GLYPH = { K: '\u265A', Q: '\u265B', R: '\u265C', B: '\u265D', N: '\u265E', P: '\u265F' };
  const VS = '\uFE0E';
  const PIECE_FONT = '"Segoe UI Symbol", "Noto Sans Symbols 2", "Noto Sans Symbols", "DejaVu Sans", "Apple Symbols", serif';
  const PIECE_UNITS = 0.68;   // piece size in board units, sized to fit the narrowest (inner ring) cells
  const NAME_OF = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };
  const POLY = {}; G.ALL_CELLS.forEach((n) => (POLY[n] = Ge.polygon(n)));
  const LABEL = {}; G.ALL_CELLS.forEach((n) => (LABEL[n] = Ge.labelPos(n)));
  const SIZE = {}; G.ALL_CELLS.forEach((n) => (SIZE[n] = Ge.cellSize(n)));

  const $ = (id) => document.getElementById(id);
  const canvas = $('board'), ctx = canvas.getContext('2d');

  const st = {
    game: R.newGame(), moveStrs: [], entries: [], selected: null, targets: [], flipped: false, showNames: false,
    humanColor: 'w', level: 'medium', thinking: false, status: null, promo: null, anim: null, botNote: '',
  };
  // session: the local game (vs a person or a bot) or an online game
  let session = { kind: 'local', opponent: 'human', tainted: false, reported: false, token: {} };
  let hooks = { fetchPlaybook: null, onLocalGameOver: null, isSignedIn: () => false, toast: (m) => alert(m), onlineAvailable: () => false, botRating: () => null, myRating: () => null };

  // ---------- player customizations (saved on this device) ----------
  const THEMES = {
    classic:    { name: 'Classic',    light: '#ebebe3', dark: '#1b1b1b', label: '#e0322f' },
    tournament: { name: 'Tournament', light: '#eeeed2', dark: '#769656', label: '#b3261e' },
    walnut:     { name: 'Walnut',     light: '#ecd3a5', dark: '#8b5a2b', label: '#7a1f12' },
    ocean:      { name: 'Ocean',      light: '#dce8f4', dark: '#3a6ea5', label: '#c0392b' },
    midnight:   { name: 'Midnight',   light: '#8f9aa8', dark: '#252c38', label: '#ffd166' },
    rose:       { name: 'Rose',       light: '#f6e4e1', dark: '#b65c67', label: '#5b1a24' },
  };
  const PIECE_SETS = {
    classic: { name: 'Classic',         w: { fill: '#fbf7ee', stroke: '#1a1d1b' }, b: { fill: '#1f2421', stroke: '#efe8d6' } },
    metal:   { name: 'Gold and Silver', w: { fill: '#e3e7ec', stroke: '#3d4652' }, b: { fill: '#d4a52a', stroke: '#4a3100' } },
    royal:   { name: 'Ruby and Sapphire', w: { fill: '#e5484d', stroke: '#ffffff' }, b: { fill: '#3e63dd', stroke: '#ffffff' } },
    ivory:   { name: 'Ivory and Ebony', w: { fill: '#fff4dc', stroke: '#6b4e1e' }, b: { fill: '#2b1d14', stroke: '#e9c88a' } },
  };
  const PREF_KEY = 'ic_prefs';
  const prefs = Object.assign({ orient: 'vertical', theme: 'tournament', pieces: 'classic', size: 100, names: false },
    (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch (e) { return {}; } })());
  if (!THEMES[prefs.theme] || !prefs.themeChosen) prefs.theme = 'tournament';   // Tournament unless the player picked a theme
  if (!PIECE_SETS[prefs.pieces]) prefs.pieces = 'classic';
  prefs.size = Math.min(140, Math.max(60, +prefs.size || 100));
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* private mode */ } }
  st.showNames = !!prefs.names;

  // ---------- coordinate transforms ----------
  let view = { ox: 0, oy: 0, sc: 1, dpr: 1 };
  const MARGIN = 0.25;
  // Vertical (default) turns the figure-8 a quarter turn so White's loop is at the bottom.
  function resize() {
    const wrap = canvas.parentElement;
    canvas.style.width = '0px'; canvas.style.height = '0px';   // measure the container, not the old canvas
    const cssW = wrap.clientWidth;
    if (!cssW) return;                                         // view hidden
    const rot = prefs.orient === 'vertical';
    const bw = (rot ? Ge.BOARD_H : Ge.BOARD_W) + 2 * MARGIN, bh = (rot ? Ge.BOARD_W : Ge.BOARD_H) + 2 * MARGIN;
    const aspect = bh / bw;
    // room left on screen below the board's top edge (keeps the status row above the tab bar)
    const top = wrap.getBoundingClientRect().top + window.scrollY;
    const tabbar = document.getElementById('tabbar');
    const tabH = tabbar && getComputedStyle(tabbar).display !== 'none' ? tabbar.offsetHeight : 0;
    const phone = window.innerWidth <= 640;
    const below = phone ? tabH + 72 : (window.innerWidth > 860 || window.innerHeight < 560 ? 24 : 0);
    const maxH = Math.max(220, window.innerHeight - top - below);
    let w = cssW, h = w * aspect;
    if (below && h > maxH) { h = maxH; w = h / aspect; }
    const k = prefs.size / 100;                               // player's board size setting
    w = Math.min(cssW, w * k); h = w * aspect;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    view = { ox: w / 2, oy: h / 2, sc: w / bw, dpr, rot };
    draw();
  }
  function toScreen(p) {
    let x = st.flipped ? -p.x : p.x, y = st.flipped ? -p.y : p.y;
    if (view.rot) { const t = x; x = -y; y = t; }               // quarter turn: White's loop at the bottom
    return { x: view.ox + x * view.sc, y: view.oy - y * view.sc };
  }
  function fromScreen(sx, sy) {
    let x = (sx - view.ox) / view.sc, y = (view.oy - sy) / view.sc;
    if (view.rot) { const t = y; y = -x; x = t; }
    if (st.flipped) { x = -x; y = -y; }
    return { x, y };
  }
  function pathPoly(pts) {
    ctx.beginPath();
    pts.forEach((p, i) => { const s = toScreen(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
    ctx.closePath();
  }
  function circlePts(c, r, a1 = 0, a2 = 360, n = 96) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = (a1 + (a2 - a1) * i / n) * Math.PI / 180; pts.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }); }
    return pts;
  }
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  // ---------- drawing ----------
  function fillCell(name, color) { pathPoly(POLY[name]); ctx.fillStyle = color; ctx.fill(); }
  function strokeCell(name, color, w) { pathPoly(POLY[name]); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); }
  function dotAt(name, color, rFrac) {
    const s = toScreen(LABEL[name]); ctx.beginPath();
    ctx.arc(s.x, s.y, SIZE[name] * view.sc * rFrac, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }

  function draw() {
    const C = {
      light: THEMES[prefs.theme].light, dark: THEMES[prefs.theme].dark, bg: cssVar('--surface'), rim: cssVar('--rim'),
      accent: cssVar('--accent'), check: cssVar('--danger'), last: cssVar('--last'), label: THEMES[prefs.theme].label,
    };
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // all 72 cells
    for (const n of G.ALL_CELLS) { fillCell(n, Ge.shade(n) ? C.dark : C.light); strokeCell(n, 'rgba(128,128,128,0.35)', 0.6); }

    // overlays (drawn before the holes so the holes trim them too)
    const h = st.game.history[st.game.history.length - 1];
    if (h) { fillCell(R.NAMES[h.undo.m.from], C.last); fillCell(R.NAMES[h.undo.m.to], C.last); }
    if (st.status && st.status.check) { const k = R.findKing(st.game, st.game.turn); if (k >= 0) fillCell(R.NAMES[k], C.check); }
    if (st.selected != null) fillCell(R.NAMES[st.selected], C.accent + '99');
    if (st.hint != null) { fillCell(R.NAMES[st.hint], C.accent + '66'); strokeCell(R.NAMES[st.hint], C.accent, 3); }

    // the two holes, drawn on top in the background colour
    for (const c of [Ge.CL, Ge.CR]) { pathPoly(Ge.holePoints(c)); ctx.fillStyle = C.bg; ctx.fill(); }
    // outer outline of the figure-8
    pathPoly([...circlePts(Ge.CL, Ge.R4, 45, 315), ...circlePts(Ge.CR, Ge.R4, 225, 495)]);
    ctx.strokeStyle = C.rim; ctx.lineWidth = 1.2; ctx.stroke();

    // legal targets
    for (const m of st.targets) {
      const n = R.NAMES[m.to];
      if (st.game.board[m.to]) strokeCell(n, C.accent, 3.5); else dotAt(n, C.accent, 0.17);
    }

    if (st.anim) {
      // mid-move: draw the position from before the move, with the moving piece(s) in flight
      const a = st.anim, skip = new Set(a.movers.map((x) => x.from));
      a.before.forEach((p, i) => { if (p && !skip.has(i)) drawPiece(R.NAMES[i], p); });
      const e = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2;
      for (const mv of a.movers) {
        const A = LABEL[R.NAMES[mv.from]], B = LABEL[R.NAMES[mv.to]];
        drawPieceAt({ x: A.x + (B.x - A.x) * e, y: A.y + (B.y - A.y) * e }, mv.piece);
      }
    } else st.game.board.forEach((p, i) => { if (p) drawPiece(R.NAMES[i], p); });

    // cell names: one size everywhere, like the reference board
    if (st.showNames) {
      const px = Math.max(8, 0.2 * view.sc);
      for (const n of G.ALL_CELLS) {
        const s = toScreen(LABEL[n]);
        const occupied = st.game.board[R.IDX[n]];
        ctx.font = `500 ${occupied ? px * 0.85 : px}px ${cssVar('--font')}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.label;
        ctx.fillText(n, s.x, s.y + (occupied ? SIZE[n] * view.sc * 0.4 : 0));
      }
    }
  }
  function drawPiece(name, p) { drawPieceAt(LABEL[name], p); }
  // Chess glyphs come from different fonts on different devices (Apple, Google, Microsoft) and
  // each places the symbol differently inside its text box. So each piece is drawn once onto a
  // small off-screen canvas, its visible pixels are measured, and that ink box is centred in
  // the cell. This works the same in every browser, including Safari on iPhone.
  const spriteCache = new Map();
  function pieceSprite(p, px) {
    const dpr = view.dpr || 1, set = PIECE_SETS[prefs.pieces][p.c];
    const key = p.t + p.c + prefs.pieces + '|' + Math.round(px * dpr);
    let sp = spriteCache.get(key);
    if (sp) return sp;
    const fpx = px * dpr, size = Math.ceil(fpx * 1.8) + 4;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.font = `${fpx}px ${PIECE_FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = Math.max(1.5 * dpr, fpx * 0.075);
    g.strokeStyle = set.stroke; g.fillStyle = set.fill;
    const glyph = GLYPH[p.t] + VS;
    g.strokeText(glyph, size / 2, size / 2);
    g.fillText(glyph, size / 2, size / 2);
    let cx = size / 2, cy = size / 2;
    try {
      const d = g.getImageData(0, 0, size, size).data;
      let x0 = size, y0 = size, x1 = -1, y1 = -1;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (d[(y * size + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 >= 0) { cx = (x0 + x1 + 1) / 2; cy = (y0 + y1 + 1) / 2; }
    } catch (e) { /* keep the text-box centre */ }
    sp = { c, cx, cy, dpr };
    spriteCache.set(key, sp);
    return sp;
  }
  function drawPieceAt(pt, p) {
    const s = toScreen(pt), px = PIECE_UNITS * view.sc;   // one size for every piece on every cell
    const sp = pieceSprite(p, px);
    ctx.drawImage(sp.c, s.x - sp.cx / sp.dpr, s.y - sp.cy / sp.dpr, sp.c.width / sp.dpr, sp.c.height / sp.dpr);
  }

  // ---------- game logic ----------
  const DEPTH = { easy: 1, medium: 2, hard: 3, dynamic: 3 };
  const LEVEL_NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard', dynamic: 'Dynamic' };
  const aiColor = () => (st.humanColor === 'w' ? 'b' : 'w');
  const sideName = (c) => (c === 'w' ? 'White' : 'Black');
  const colorWord = (c) => (c === 'w' ? 'white' : 'black');
  function refreshStatus() { st.status = R.status(st.game); }
  const vsBot = () => session.kind === 'local' && session.opponent === 'computer';

  function canInteract() {
    if (st.thinking || st.promo || st.anim || st.status.over) return false;
    if (session.kind === 'online') return !session.locked && !session.pending && !session.finished && st.game.turn === session.myColor;
    if (session.kind === 'puzzle') return !session.locked && !session.busy && st.game.turn === session.side;
    if (vsBot() && st.game.turn !== st.humanColor) return false;
    return true;
  }

  function clickPlay(name) {
    if (!canInteract()) return;
    const i = R.IDX[name];
    if (st.selected != null) {
      const hits = st.targets.filter((m) => m.to === i);
      if (hits.length) {
        if (hits.some((m) => m.promo)) { st.promo = hits; showPromo(true); return; }
        commit(hits[0]); return;
      }
    }
    const p = st.game.board[i];
    if (p && p.c === st.game.turn) {
      if (st.selected === i) { st.selected = null; st.targets = []; }
      else { st.selected = i; st.targets = st.status.moves.filter((m) => m.from === i && (!m.promo || m.promo === 'Q')).concat(st.status.moves.filter((m) => m.from === i && m.promo && m.promo !== 'Q')); }
    } else { st.selected = null; st.targets = []; }
    draw();
  }

  // Apply a move to the local position, recording its move string and playbook entry.
  function applyLocal(m) {
    const str = R.moveToString(m);
    st.entries.push({ key: R.playbookKey(st.game), move: str, side: colorWord(st.game.turn) });
    R.playMove(st.game, m);
    st.moveStrs.push(str);
    return str;
  }
  function undoLocal() {
    if (!st.moveStrs.length) return;
    R.undoLast(st.game); st.moveStrs.pop(); st.entries.pop();
  }

  const ANIM_DELAY = 90, ANIM_MS = 360;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function commit(m, opts = {}) {
    const before = st.game.board.slice();
    const plyBefore = st.moveStrs.length;
    const str = applyLocal(m);
    st.selected = null; st.targets = []; st.promo = null;
    if (!opts.remote) st.botNote = opts.botNote || '';
    // every piece that changed cell (king and rook when castling); a promoting pawn flies as a pawn
    const after = st.game.board, movers = [];
    before.forEach((p, i) => { if (!p) return; const j = after.indexOf(p); if (j >= 0 && j !== i) movers.push({ piece: p, from: i, to: j }); });
    if (m.promo) movers.push({ piece: before[m.from], from: m.from, to: m.to });

    if (session.kind === 'online' && !opts.remote) sendOnline(str, plyBefore);
    if (session.kind === 'puzzle' && !opts.remote) sendPuzzle(str);
    st.hint = null;

    const finish = () => { st.anim = null; refreshStatus(); render(); afterMove(); };
    if (reduceMotion.matches || !movers.length) { finish(); return; }
    const token = {};
    st.anim = { before, movers, t: 0, token };
    draw();
    const start = performance.now() + ANIM_DELAY;
    (function frame(now) {
      if (!st.anim || st.anim.token !== token) return;   // cancelled
      st.anim.t = Math.max(0, Math.min(1, (now - start) / ANIM_MS));
      draw();
      if (st.anim.t < 1) requestAnimationFrame(frame); else finish();
    })(performance.now());
  }

  function gameResult() {
    const s = st.status;
    if (!s.over) return null;
    if (s.result === 'checkmate') return { result: colorWord(s.winner), reason: 'checkmate' };
    return { result: 'draw', reason: s.result };
  }

  function afterMove() {
    if (session.kind === 'puzzle') { const f = session.afterAnim; session.afterAnim = null; if (f) f(); return; }
    if (session.kind === 'local') {
      if (vsBot() && st.status.over && !session.reported && hooks.onLocalGameOver) {
        session.reported = true;
        const r = gameResult();
        hooks.onLocalGameOver({ level: st.level, humanColor: colorWord(st.humanColor), moves: st.moveStrs.slice(),
          result: r.result, reason: r.reason, entries: st.entries.slice(0, 200), rated: !session.tainted });
      }
      maybeAI();
    } else {
      if (st.status.over && !session.boardOverSent) {
        session.boardOverSent = true;
        const r = gameResult();
        session.onBoardOver && session.onBoardOver(r.result, r.reason);
      }
      if (session.queued) { const q = session.queued; session.queued = null; syncMoves(q); }
    }
  }

  // ---------- computer opponent (with the learned playbook) ----------
  function maybeAI() {
    if (!vsBot() || st.status.over || st.game.turn !== aiColor() || st.thinking) return;
    st.thinking = true; render();
    const token = session.token;
    setTimeout(async () => {
      let move = null, used = false, preferred = [], avoid = [];
      const level = st.level;
      if (level !== 'easy' && hooks.fetchPlaybook) {
        let rows = [];
        try { rows = (await hooks.fetchPlaybook(R.playbookKey(st.game))) || []; } catch (e) { rows = []; }
        if (token !== session.token) return;                 // a new game started meanwhile
        const legal = new Map(R.legalMoves(st.game).map((m) => [R.moveToString(m), m]));
        const cand = rows.filter((r) => legal.has(r.move)).map((r) => {
          const n = (r.wins || 0) + (r.losses || 0) + (r.draws || 0);
          const score = n ? ((r.wins || 0) + 0.5 * (r.draws || 0)) / n : 0;
          return { move: r.move, n, score, lcb: score - 0.5 / Math.sqrt(Math.max(n, 1)) };
        });
        if (level === 'dynamic') {
          // Dynamic: trust any move with a solid record, skip moves that keep losing
          cand.sort((a, b) => (b.lcb - a.lcb) || (b.n - a.n));
          preferred = cand.map((c) => c.move);
          avoid = cand.filter((c) => c.n >= 3 && c.score <= 0.25).map((c) => c.move);
          const best = cand.find((c) => c.n >= 2 && c.lcb >= 0.35 && !avoid.includes(c.move));
          if (best) { move = legal.get(best.move); used = true; }
        } else {
          cand.sort((a, b) => (b.score - a.score) || (b.n - a.n));
          preferred = cand.map((c) => c.move);
          const good = cand.filter((c) => c.n >= 3 && c.score >= 0.55);
          if (good.length && (level === 'hard' || Math.random() < 0.7)) { move = legal.get(good[0].move); used = true; }
        }
      }
      if (token !== session.token) return;
      if (!move) move = AI.chooseMove(st.game, DEPTH[level], preferred, avoid);
      st.thinking = false;
      if (move) commit(move, { botNote: used ? 'Bot used its playbook' : '' }); else render();
    }, 60);
  }

  // ---------- online sessions ----------
  function sendOnline(str, plyBefore) {
    session.pending = true;
    Promise.resolve(session.onMove(str, plyBefore)).then(() => {
      session.pending = false; render();
      if (!st.anim && session.queued) { const q = session.queued; session.queued = null; syncMoves(q); }
    }, (err) => {
      session.pending = false;
      if (st.anim) st.anim = null;
      if (st.moveStrs.length === plyBefore + 1 && st.moveStrs[plyBefore] === str) undoLocal();
      session.boardOverSent = false;
      refreshStatus(); render();
      hooks.toast((err && err.message) || 'Move was not accepted.');
      if (session.queued) { const q = session.queued; session.queued = null; syncMoves(q); }
    });
  }

  function desync() {
    session.locked = true; session.lockMsg = 'Game out of sync';
    st.selected = null; st.targets = []; render();
    return 'desync';
  }
  // Bring the local position in line with the server's move list.
  function syncMoves(moves) {
    if (session.kind !== 'online' || session.locked) return session.locked ? 'desync' : 'ok';
    moves = Array.isArray(moves) ? moves : [];
    if (session.pending || st.anim) { session.queued = moves; return 'ok'; }
    const local = st.moveStrs;
    for (let i = 0; i < Math.min(moves.length, local.length); i++) if (moves[i] !== local[i]) return desync();
    if (moves.length <= local.length) return 'ok';
    for (let i = local.length; i < moves.length; i++) {
      const m = R.moveFromString(st.game, moves[i]);
      if (!m) return desync();
      if (i < moves.length - 1) applyLocal(m);
      else { refreshStatus(); commit(m, { remote: true }); return 'ok'; }
    }
    return 'ok';
  }

  function resetBoard() {
    session.token = {};
    st.anim = null; st.thinking = false; st.promo = null; showPromo(false);
    st.game = R.newGame(); st.moveStrs = []; st.entries = []; st.selected = null; st.targets = []; st.botNote = ''; st.hint = null;
  }

  function newLocal() {
    resetBoard();
    session = { kind: 'local', opponent: $('opponent').value === 'computer' ? 'computer' : 'human', tainted: false, reported: false, token: session.token };
    st.flipped = vsBot() && st.humanColor === 'b';
    refreshStatus(); render(); resize(); maybeAI();
  }

  // opts: { myColor: 'w'|'b', moves: [...], onMove(str, plyBefore) -> Promise, onBoardOver(result, reason) }
  function startOnline(opts) {
    resetBoard();
    session = { kind: 'online', myColor: opts.myColor, onMove: opts.onMove, onBoardOver: opts.onBoardOver,
      locked: false, pending: false, finished: false, boardOverSent: false, queued: null, token: session.token };
    st.flipped = opts.myColor === 'b';
    let res = 'ok';
    for (const s of opts.moves || []) {
      const m = R.moveFromString(st.game, s);
      if (!m) { res = desync(); break; }
      applyLocal(m);
    }
    refreshStatus(); render(); resize();
    if (res === 'ok' && st.status.over) { session.boardOverSent = true; opts.onBoardOver && opts.onBoardOver(gameResult().result, gameResult().reason); }
    return res;
  }
  function setOnlineFinished(flag) { if (session.kind === 'online') { session.finished = flag; st.selected = null; st.targets = []; render(); } }

  // ---------- puzzle sessions ----------
  // opts: { key, side: 'w'|'b', onMove(str) -> Promise<{ result: 'continue'|'solved'|'wrong', reply? }> }
  function startPuzzle(opts) {
    resetBoard();
    st.game = R.stateFromKey(opts.key);
    session = { kind: 'puzzle', side: opts.side, onMove: opts.onMove, locked: false, busy: false, msg: '', tone: '', afterAnim: null, token: session.token };
    st.flipped = opts.side === 'b';
    refreshStatus(); render(); resize();
  }
  function sendPuzzle(str) {
    session.busy = true; render();
    const token = session.token;
    Promise.resolve(session.onMove(str)).then((res) => {
      if (token !== session.token || session.kind !== 'puzzle') return;
      const go = () => {
        if (res && res.result === 'continue' && res.reply) {
          setTimeout(() => {
            if (token !== session.token) return;
            const m = R.moveFromString(st.game, res.reply);
            session.afterAnim = () => { session.busy = false; render(); };
            if (m) commit(m, { remote: true }); else { session.busy = false; render(); }
          }, 380);
        } else { session.busy = false; if (res && res.result !== 'continue') session.locked = true; render(); }
      };
      if (st.anim) session.afterAnim = go; else go();
    }, () => { session.busy = false; render(); });
  }
  function setPuzzleMessage(msg, tone) { if (session.kind === 'puzzle') { session.msg = msg || ''; session.tone = tone || ''; render(); } }
  function setHint(cell) { st.hint = cell ? R.IDX[cell] : null; draw(); }
  // replays a list of moves from the current position with the normal animation
  function playLine(moves, done) {
    const token = session.token;
    session.locked = true; session.busy = true;
    const next = (i) => {
      if (token !== session.token) return;
      if (i >= moves.length) { session.busy = false; render(); if (done) done(); return; }
      const m = R.moveFromString(st.game, moves[i]);
      if (!m) { session.busy = false; render(); return; }
      session.afterAnim = () => setTimeout(() => next(i + 1), 420);
      commit(m, { remote: true });
    };
    setTimeout(() => next(0), 300);
  }

  function showPromo(open) {
    const dlg = $('promo');
    if (!open) { dlg.hidden = true; return; }
    const c = st.game.turn;
    dlg.querySelector('.promo-choices').innerHTML = ['Q', 'R', 'B', 'N'].map((t) =>
      `<button type="button" data-p="${t}" aria-label="Promote to ${NAME_OF[t]}"><span class="glyph ${c}">${GLYPH[t]}${VS}</span><span>${NAME_OF[t][0].toUpperCase() + NAME_OF[t].slice(1)}</span></button>`).join('');
    dlg.hidden = false;
    dlg.querySelector('button').focus();
  }
  $('promo').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-p]');
    if (b && st.promo) { const m = st.promo.find((x) => x.promo === b.dataset.p); showPromo(false); commit(m); }
    if (e.target.id === 'promo-cancel') { st.promo = null; showPromo(false); draw(); }
  });

  // ---------- sidebar ----------
  function render() {
    const s = st.status, g = st.game, online = session.kind === 'online', puzzle = session.kind === 'puzzle';
    $('local-controls').hidden = online || puzzle;
    $('online-controls').hidden = !online;
    $('puzzle-controls').hidden = !puzzle;
    $('opp-block').hidden = online || puzzle;
    document.body.classList.toggle('in-online-game', online);
    document.body.classList.toggle('in-puzzle', puzzle);
    let msg, sub = '';
    if (puzzle) {
      msg = session.msg || (session.busy ? 'Checking\u2026' : g.turn === session.side ? 'Your move' : 'Opponent is replying\u2026');
      sub = s.check && !s.over ? (g.turn === session.side ? 'You are in check.' : 'Check!') : '';
    } else if (online && session.locked) { msg = session.lockMsg; sub = 'Input is stopped. Reload the page to resync.'; }
    else if (s.over) {
      if (s.result === 'checkmate') msg = online ? (s.winner === session.myColor ? 'Checkmate. You win.' : 'Checkmate. You lose.') : `Checkmate. ${sideName(s.winner)} wins.`;
      else if (s.result === 'stalemate') msg = 'Stalemate. The game is a draw.';
      else msg = 'Draw by threefold repetition.';
      sub = online ? '' : 'Start a new game or undo to keep playing.';
    } else if (online) {
      msg = session.finished ? 'Game over' : (g.turn === session.myColor ? 'Your move' : 'Opponent\u2019s move');
      if (session.pending) sub = 'Sending move\u2026';
      else if (s.check) sub = g.turn === session.myColor ? 'You are in check.' : 'Opponent is in check.';
    } else {
      msg = `${sideName(g.turn)} to move`;
      if (s.check) sub = `${sideName(g.turn)} is in check.`;
      if (st.thinking) sub = 'Thinking\u2026';
    }
    $('status').textContent = msg;
    $('status-sub').textContent = sub;
    $('status-sub').classList.toggle('alert', !!s.check && !s.over);
    $('turn-chip').className = 'chip ' + (s.over || (online && session.locked) || (puzzle && session.locked) ? 'over' : g.turn);
    $('status').dataset.tone = puzzle ? session.tone : '';
    $('bot-note').textContent = vsBot() ? st.botNote : '';
    const h = g.history, rows = [];
    for (let i = 0; i < h.length; i += 2) rows.push(`<li><span>${h[i].note}</span><span>${h[i + 1] ? h[i + 1].note : ''}</span></li>`);
    const ol = $('moves'); ol.innerHTML = rows.join('');
    $('moves-empty').hidden = h.length > 0;
    ol.scrollTop = ol.scrollHeight;
    const cap = { w: [], b: [] };
    for (const e of h) if (e.captured) cap[e.color].push(e.captured);
    const ord = 'QRBNP';
    for (const c of ['w', 'b']) {
      const list = cap[c].sort((a, b) => ord.indexOf(a.t) - ord.indexOf(b.t)).map((p) => `<span class="glyph ${p.c}">${GLYPH[p.t]}${VS}</span>`).join('');
      $('cap-' + c).innerHTML = list || '<span class="muted">None yet</span>';
    }
    if (puzzle) $('vs-line').hidden = true;
    if (!online && !puzzle) {
      $('undo').disabled = !h.length || st.thinking || !!st.anim;
      $('m-undo').disabled = $('undo').disabled;
      $('ai-opts').hidden = !vsBot();
      // "You vs Bot" line with ratings
      const vs = $('vs-line');
      if (vsBot()) {
        const br = hooks.botRating(st.level), mr = hooks.myRating();
        vs.innerHTML = `<span>${mr != null ? 'You \u00B7 ' + mr : 'You'}</span><b>vs</b><span>${LEVEL_NAME[st.level]} bot${br != null ? ' \u00B7 ' + br : ''}</span>`;
        vs.hidden = false;
      } else vs.hidden = true;
      let note = '';
      if (vsBot()) {
        if (!hooks.isSignedIn()) note = hooks.onlineAvailable() ? 'Playing as a guest: bot games are unrated and not saved. Sign in to play rated games.' : 'Bot games are unrated while online features are off.';
        else if (session.tainted) note = 'This game is unrated because undo was used or the settings changed mid-game.';
        else note = 'Rated game. Beating a bot raises your rating, more for stronger bots. Losses and draws against bots never lower it. Games under 20 moves are unrated.';
      }
      $('rated-note').textContent = note;
      $('rated-note').hidden = !note;
    }
    draw();
  }

  // ---------- input ----------
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const p = fromScreen(e.clientX - r.left, e.clientY - r.top);
    const name = Ge.hitTest(p.x, p.y);
    if (name) clickPlay(name); else { st.selected = null; st.targets = []; draw(); }
  });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const p = fromScreen(e.clientX - r.left, e.clientY - r.top);
    const name = Ge.hitTest(p.x, p.y);
    $('hover').textContent = name || '';
    canvas.style.cursor = name ? 'pointer' : 'default';
  });
  canvas.addEventListener('mouseleave', () => ($('hover').textContent = ''));

  const taint = () => { if (vsBot() && st.moveStrs.length) session.tainted = true; };
  $('new-game').addEventListener('click', newLocal);
  $('undo').addEventListener('click', () => {
    if (st.thinking || st.anim || session.kind !== 'local') return;
    taint();
    undoLocal();
    if (vsBot() && st.game.turn !== st.humanColor) undoLocal();
    st.selected = null; st.targets = []; refreshStatus(); render();
  });
  $('flip').addEventListener('click', () => { st.flipped = !st.flipped; draw(); });
  $('flip-online').addEventListener('click', () => { st.flipped = !st.flipped; draw(); });
  // phone toolbar and the game settings sheet
  function setSheet(open) {
    document.body.classList.toggle('sheet-open', open);
    $('settings-sheet').setAttribute('aria-hidden', String(!open && matchMedia('(max-width: 640px)').matches));
  }
  $('m-undo').addEventListener('click', () => $('undo').click());
  $('m-flip').addEventListener('click', () => { st.flipped = !st.flipped; draw(); });
  $('m-settings').addEventListener('click', () => setSheet(true));
  $('m-next').addEventListener('click', () => $('pz-next').click());
  $('sheet-done').addEventListener('click', () => setSheet(false));
  $('sheet-backdrop').addEventListener('click', () => setSheet(false));
  $('sheet-new').addEventListener('click', () => { setSheet(false); newLocal(); });
  if (matchMedia('(max-width: 640px)').matches) { $('moves-box').open = false; $('appearance').open = true; }
  $('names').checked = st.showNames;
  $('names').addEventListener('change', (e) => { st.showNames = prefs.names = e.target.checked; savePrefs(); draw(); });

  // ---------- appearance controls ----------
  function renderAppearance() {
    document.querySelectorAll('[data-orient]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.orient === prefs.orient)));
    $('theme-swatches').innerHTML = Object.entries(THEMES).map(([k, t]) =>
      `<button type="button" class="swatch" data-theme-key="${k}" aria-pressed="${k === prefs.theme}" aria-label="${t.name} board"><span style="background:linear-gradient(135deg, ${t.light} 0 50%, ${t.dark} 50% 100%)"></span><small>${t.name}</small></button>`).join('');
    $('piece-swatches').innerHTML = Object.entries(PIECE_SETS).map(([k, t]) =>
      `<button type="button" class="swatch" data-piece-key="${k}" aria-pressed="${k === prefs.pieces}" aria-label="${t.name} pieces"><span class="pc"><i style="color:${t.w.fill};-webkit-text-stroke:1px ${t.w.stroke}">${GLYPH.K}${VS}</i><i style="color:${t.b.fill};-webkit-text-stroke:1px ${t.b.stroke}">${GLYPH.K}${VS}</i></span><small>${t.name}</small></button>`).join('');
    $('board-size').value = prefs.size;
    $('board-size-val').textContent = prefs.size + '%';
  }
  document.querySelectorAll('[data-orient]').forEach((b) => b.addEventListener('click', () => { prefs.orient = b.dataset.orient; savePrefs(); renderAppearance(); resize(); }));
  $('theme-swatches').addEventListener('click', (e) => { const b = e.target.closest('[data-theme-key]'); if (!b) return; prefs.theme = b.dataset.themeKey; prefs.themeChosen = true; savePrefs(); renderAppearance(); draw(); });
  $('piece-swatches').addEventListener('click', (e) => { const b = e.target.closest('[data-piece-key]'); if (!b) return; prefs.pieces = b.dataset.pieceKey; savePrefs(); renderAppearance(); draw(); });
  $('board-size').addEventListener('input', (e) => { prefs.size = +e.target.value; $('board-size-val').textContent = prefs.size + '%'; resize(); });
  $('board-size').addEventListener('change', savePrefs);
  $('appearance-reset').addEventListener('click', () => { Object.assign(prefs, { orient: 'vertical', theme: 'tournament', themeChosen: false, pieces: 'classic', size: 100 }); savePrefs(); renderAppearance(); resize(); });
  renderAppearance();
  $('opponent').addEventListener('change', (e) => {
    taint();
    session.opponent = e.target.value === 'computer' ? 'computer' : 'human';
    render(); maybeAI();
  });
  $('side').addEventListener('change', (e) => { taint(); st.humanColor = e.target.value; st.flipped = st.humanColor === 'b'; st.selected = null; st.targets = []; render(); maybeAI(); });
  $('depth').addEventListener('change', (e) => { taint(); st.level = e.target.value; render(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (st.promo) { st.promo = null; showPromo(false); } st.selected = null; st.targets = []; draw(); } });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  let rz = 0; window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(resize); });

  // ---------- fake loading screen ----------
  function runLoader(done) {
    const el = $('loader'), bar = $('loader-bar'), msg = $('loader-msg');
    const steps = [[18, 'Building the board'], [44, 'Joining the loops'], [71, 'Placing the pieces'], [92, 'Waking the computer'], [100, 'Ready']];
    let k = 0;
    (function next() {
      const [pct, text] = steps[k];
      bar.style.width = pct + '%'; msg.textContent = text; $('loader-track').setAttribute('aria-valuenow', pct);
      k++;
      if (k < steps.length) setTimeout(next, 280 + Math.random() * 220);
      else setTimeout(() => { el.classList.add('done'); setTimeout(() => { el.hidden = true; done(); }, 350); }, 300);
    })();
  }

  refreshStatus(); render();
  if (document.fonts) document.fonts.ready.then(() => { spriteCache.clear(); draw(); });

  return {
    setHooks: (h) => { hooks = Object.assign(hooks, h); render(); },
    newLocal, startOnline, syncMoves, setOnlineFinished,
    leaveOnline: () => { if (session.kind === 'online') newLocal(); },
    activate: () => { resize(); render(); },
    refresh: () => render(),
    runLoader,
    isOnline: () => session.kind === 'online',
    kind: () => session.kind,
    startPuzzle, setPuzzleMessage, setHint, playLine,
    state: () => st.game,
    entries: () => st.entries.slice(0, 200),
    moveCount: () => st.moveStrs.length,
  };
})();
