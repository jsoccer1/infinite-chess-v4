
// ================= MODULE 1: BoardGraph (pure data, no drawing) =================
const BoardGraph = (() => {
  const LANES = ['Q', 'B', 'N', 'R'];
  const ORTHOGONAL = [{ dc: 1, dt: 0 }, { dc: -1, dt: 0 }, { dc: 0, dt: 1 }, { dc: 0, dt: -1 }];
  const DIAGONAL = [{ dc: 1, dt: 1 }, { dc: 1, dt: -1 }, { dc: -1, dt: 1 }, { dc: -1, dt: -1 }];

  function wrapT(t) { return ((t - 1) % 22 + 22) % 22 + 1; }
  function inCrossing(t) { return (t >= 8 && t <= 11) || (t >= 19 && t <= 22); }

  function cellAt(c, t) {
    if (typeof c === 'object') { t = c.t; c = c.c; }
    if (t <= 18) return LANES[c] + t;
    return LANES[t - 19] + (11 - c);
  }

  function positionsOf(name) {
    const lane = LANES.indexOf(name[0]);
    const n = parseInt(name.slice(1), 10);
    const list = [{ c: lane, t: n, frame: 1 }];
    if (n >= 8 && n <= 11) list.push({ c: 11 - n, t: 19 + lane, frame: 2 });
    return list;
  }

  function otherFrame(pos, dir) {
    if (pos.t >= 8 && pos.t <= 11) {
      return { pos: { c: 11 - pos.t, t: 19 + pos.c }, dir: { dc: -dir.dt, dt: dir.dc } };
    }
    return { pos: { c: pos.t - 19, t: 11 - pos.c }, dir: { dc: dir.dt, dt: -dir.dc } };
  }

  // Tip links: the inner-ring cells either side of each hole's tip touch diagonally across it.
  // R7 <-> R1 (beside R8) and Q12 <-> Q18 (beside Q11). A diagonal line entering the tip
  // comes out on the other side heading away from the hole, e.g. N6, R7, R1, N2.
  // Only diagonal sliders and the king use these; pawn and knight patterns do not.
  function tipLink(pos, dir) {
    if (pos.c === 3 && pos.t === 7 && dir.dc === 1 && dir.dt === 1) return { pos: { c: 3, t: 1 }, dir: { dc: -1, dt: 1 } };
    if (pos.c === 3 && pos.t === 1 && dir.dc === 1 && dir.dt === -1) return { pos: { c: 3, t: 7 }, dir: { dc: -1, dt: -1 } };
    if (pos.c === 0 && pos.t === 12 && dir.dc === -1 && dir.dt === -1) return { pos: { c: 0, t: 18 }, dir: { dc: 1, dt: -1 } };
    if (pos.c === 0 && pos.t === 18 && dir.dc === -1 && dir.dt === 1) return { pos: { c: 0, t: 12 }, dir: { dc: 1, dt: 1 } };
    return null;
  }

  function step(pos, dir, tips) {
    let c2 = pos.c + dir.dc;
    if (c2 >= 0 && c2 <= 3) return { pos: { c: c2, t: wrapT(pos.t + dir.dt) }, dir };
    if (inCrossing(pos.t)) {
      const o = otherFrame(pos, dir);
      c2 = o.pos.c + o.dir.dc;
      if (c2 >= 0 && c2 <= 3) return { pos: { c: c2, t: wrapT(o.pos.t + o.dir.dt) }, dir: o.dir };
    }
    return tips ? tipLink(pos, dir) : null;
  }

  const ALL_CELLS = [];
  for (const L of LANES) for (let n = 1; n <= 18; n++) ALL_CELLS.push(L + n);

  function neighbors(name, dirs) {
    const s = new Set();
    for (const p of positionsOf(name)) for (const d of dirs) {
      const r = step(p, d, true);
      if (r) { const n = cellAt(r.pos); if (n !== name) s.add(n); }
    }
    return s;
  }
  const orthogonalNeighbors = (name) => neighbors(name, ORTHOGONAL);
  const diagonalNeighbors = (name) => neighbors(name, DIAGONAL);

  function walkLine(name, startPos, dir, isBlocked) {
    const out = [];
    let pos = startPos, d = dir;
    for (let i = 0; i < 100; i++) {
      const r = step(pos, d, true);
      if (!r) break;
      const n = cellAt(r.pos);
      if (n === name) break;
      out.push(n);
      if (isBlocked && isBlocked(n)) break;
      pos = r.pos; d = r.dir;
    }
    return out;
  }

  function linesFrom(name, dirs, isBlocked) {
    const res = [], seen = new Set();
    for (const p of positionsOf(name)) for (const d of dirs) {
      const path = walkLine(name, p, d, isBlocked);
      if (!path.length) continue;
      const k = path.join(',');
      if (seen.has(k)) continue;
      seen.add(k); res.push(path);
    }
    return res;
  }

  function leaperTargets(name) {
    const s = new Set();
    for (const P of positionsOf(name)) {
      for (const D of ORTHOGONAL) {
        const m = step(P, D); if (!m) continue;
        const D2 = m.dir;
        for (const S of [{ dc: D2.dt, dt: -D2.dc }, { dc: -D2.dt, dt: D2.dc }]) {
          const r = step(m.pos, { dc: D2.dc + S.dc, dt: D2.dt + S.dt });
          if (r) s.add(cellAt(r.pos));
        }
      }
      for (const D of DIAGONAL) {
        const m = step(P, D); if (!m) continue;
        const D2 = m.dir;
        for (const O of [{ dc: D2.dc, dt: 0 }, { dc: 0, dt: D2.dt }]) {
          const r = step(m.pos, O);
          if (r) s.add(cellAt(r.pos));
        }
      }
    }
    s.delete(name);
    return s;
  }

  function cellKey(name) { return LANES.indexOf(name[0]) * 100 + parseInt(name.slice(1), 10); }
  function sortCells(arr) { return [...arr].sort((a, b) => cellKey(a) - cellKey(b)); }

  return { LANES, ORTHOGONAL, DIAGONAL, wrapT, inCrossing, cellAt, positionsOf, otherFrame, step,
    ALL_CELLS, neighbors, orthogonalNeighbors, diagonalNeighbors, walkLine, linesFrom, leaperTargets, sortCells };
})();

// ================= MODULE 2: Geometry (board units, y up) =================
const Geometry = (() => {
  // Proportions follow the reference board: four equal rings that run all the way into the
  // centre point, so every ring boundary meets a crossing grid line exactly (R7 lines up with R8,
  // Q7 with Q8). The centre is a small almond-shaped hole, not a circle.
  const R4 = 4.6, W = R4 / 4, R0 = 0, D = R4 / Math.SQRT2;
  const HOLE_W = 0.6, HOLE_H = 0.3;                                    // half-width, half-height of the almond
  const HOLE_RHO = (HOLE_W * HOLE_W + HOLE_H * HOLE_H) / (2 * HOLE_H);  // radius of each of its two arcs
  const HOLE_OFF = HOLE_RHO - HOLE_H;
  const CL = { x: -D, y: 0 }, CR = { x: D, y: 0 };
  const SEC = 270 / 7, M = R0 / R4, DEG = Math.PI / 180;
  const LEFT_RING = { R: 0, N: 1, B: 2, Q: 3 };
  const RIGHT_RING = { Q: 0, B: 1, N: 2, R: 3 };
  const CROSS_V = { R: 0, N: 1, B: 2, Q: 3 };
  const BOARD_W = 2 * D + 2 * R4, BOARD_H = 2 * R4;

  function point(a, b) { return { x: CL.x + (a + b) / Math.SQRT2, y: (a - b) / Math.SQRT2 }; }
  // The crossing is a true 4x4 grid of equal squares, the same size as a ring width.
  const CELL = R4 / 4;
  const lineDef = (k) => ({ m: 0, c: k * CELL });
  function corner(k, j) {
    const A = lineDef(k), B = lineDef(j);
    const a = (A.c - A.m * B.c) / (1 - A.m * B.m);
    const b = B.c - B.m * a;
    return point(a, b);
  }
  function parse(name) { return { L: name[0], n: parseInt(name.slice(1), 10) }; }

  function shape(name) {
    const { L, n } = parse(name);
    if (n <= 7) {
      const k = LEFT_RING[L];
      return { kind: 'sector', c: CL, r1: R0 + k * W, r2: R0 + (k + 1) * W, a1: 315 - n * SEC, a2: 315 - (n - 1) * SEC };
    }
    if (n >= 12) {
      const k = RIGHT_RING[L];
      return { kind: 'sector', c: CR, r1: R0 + k * W, r2: R0 + (k + 1) * W, a1: 225 + (n - 12) * SEC, a2: 225 + (n - 11) * SEC };
    }
    const v = CROSS_V[L], u = n - 8;
    return { kind: 'quad', pts: [corner(v, u), corner(v + 1, u), corner(v + 1, u + 1), corner(v, u + 1)] };
  }

  function polygon(name) {
    const s = shape(name);
    if (s.kind === 'quad') return s.pts;
    const pts = [], N = 16;
    for (let i = 0; i < N; i++) { const a = (s.a1 + (s.a2 - s.a1) * i / (N - 1)) * DEG; pts.push({ x: s.c.x + s.r2 * Math.cos(a), y: s.c.y + s.r2 * Math.sin(a) }); }
    for (let i = N - 1; i >= 0; i--) { const a = (s.a1 + (s.a2 - s.a1) * i / (N - 1)) * DEG; pts.push({ x: s.c.x + s.r1 * Math.cos(a), y: s.c.y + s.r1 * Math.sin(a) }); }
    return pts;
  }

  // inner-ring wedges narrow to a point, so their centre sits further out
  const sectorMidR = (s) => (s.r1 === 0 ? 0.74 * W : (s.r1 + s.r2) / 2);
  function labelPos(name) {
    const s = shape(name);
    if (s.kind === 'sector') {
      const a = (s.a1 + s.a2) / 2 * DEG, r = sectorMidR(s);
      return { x: s.c.x + r * Math.cos(a), y: s.c.y + r * Math.sin(a) };
    }
    const p = s.pts;
    return { x: (p[0].x + p[1].x + p[2].x + p[3].x) / 4, y: (p[0].y + p[1].y + p[2].y + p[3].y) / 4 };
  }

  // approximate usable size of a cell (board units), used to scale pieces
  function cellSize(name) {
    const s = shape(name);
    if (s.kind === 'sector') {
      const rm = sectorMidR(s);
      return Math.min(W, rm * SEC * DEG);
    }
    const p = s.pts;
    let area = 0;
    for (let i = 0; i < 4; i++) { const a = p[i], b = p[(i + 1) % 4]; area += a.x * b.y - b.x * a.y; }
    return Math.sqrt(Math.abs(area) / 2);
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const norm360 = (d) => ((d % 360) + 360) % 360;

  function holePoints(c) {
    const pts = [], a0 = Math.asin(HOLE_W / HOLE_RHO), N = 24;
    for (let i = 0; i <= N; i++) { const a = -a0 + 2 * a0 * i / N; pts.push({ x: c.x - HOLE_RHO * Math.sin(a), y: c.y - HOLE_OFF + HOLE_RHO * Math.cos(a) }); }
    for (let i = 0; i <= N; i++) { const a = -a0 + 2 * a0 * i / N; pts.push({ x: c.x + HOLE_RHO * Math.sin(a), y: c.y + HOLE_OFF - HOLE_RHO * Math.cos(a) }); }
    return pts;
  }
  function inHole(x, y) {
    for (const c of [CL, CR]) {
      if (Math.hypot(x - c.x, y - c.y + HOLE_OFF) <= HOLE_RHO && Math.hypot(x - c.x, y - c.y - HOLE_OFF) <= HOLE_RHO) return true;
    }
    return false;
  }

  function hitTest(x, y) {
    const dL = Math.hypot(x - CL.x, y - CL.y), dR = Math.hypot(x - CR.x, y - CR.y);
    if (inHole(x, y)) return null;
    const a = ((x - CL.x) + y) / Math.SQRT2, b = ((x - CL.x) - y) / Math.SQRT2;
    if (a >= 0 && a <= R4 && b >= 0 && b <= R4) {
      const v = clamp(Math.floor(a / CELL), 0, 3), u = clamp(Math.floor(b / CELL), 0, 3);
      return ['R', 'N', 'B', 'Q'][v] + (8 + u);
    }
    if (dL <= R4) {
      const theta = norm360(Math.atan2(y, x - CL.x) / DEG);
      const s = clamp(Math.floor((315 - theta) / SEC) + 1, 1, 7);
      const k = clamp(Math.floor(dL / W), 0, 3);
      return ['R', 'N', 'B', 'Q'][k] + s;
    }
    if (dR <= R4) {
      const theta = norm360(Math.atan2(y, x - CR.x) / DEG - 225);
      const s = clamp(12 + Math.floor(theta / SEC), 12, 18);
      const k = clamp(Math.floor(dR / W), 0, 3);
      return ['Q', 'B', 'N', 'R'][k] + s;
    }
    return null;
  }

  function shade(name) { return ('QBNR'.indexOf(name[0]) + parseInt(name.slice(1), 10)) % 2; }

  return { W, R0, R4, D, CL, CR, SEC, M, BOARD_W, BOARD_H, HOLE_W, point, shape, polygon, labelPos, cellSize, hitTest, shade, inHole, holePoints };
})();

// ================= MODULE 3: Rules (Phase 4 patterns + Phase 5 chess) =================
const Rules = (() => {
  const G = BoardGraph;
  const NAMES = G.ALL_CELLS;                      // index -> name
  const IDX = {}; NAMES.forEach((n, i) => (IDX[n] = i));
  const NUM = NAMES.map((n) => parseInt(n.slice(1), 10));
  const config = { BISHOP_MAX_STEPS: Infinity };

  // ---- precomputed empty-board patterns (all built from Phase 1 functions) ----
  const toIdx = (arr) => arr.map((n) => IDX[n]);
  const ORTHO_LINES = NAMES.map((n) => G.linesFrom(n, G.ORTHOGONAL).map(toIdx));
  const DIAG_LINES = NAMES.map((n) => G.linesFrom(n, G.DIAGONAL).map(toIdx));
  const ONE_STEP = NAMES.map((n) => toIdx([...new Set([...G.orthogonalNeighbors(n), ...G.diagonalNeighbors(n)])]));
  const LEAP = NAMES.map((n) => toIdx([...G.leaperTargets(n)]));

  // ---- RUNNER (pawn) ----
  function forwardDirs(color, name) {
    const n = parseInt(name.slice(1), 10);
    if (n >= 8 && n <= 11) return color === 'w' ? [{ dc: 0, dt: 1 }, { dc: -1, dt: 0 }] : [{ dc: 0, dt: -1 }, { dc: 1, dt: 0 }];
    const lowSide = (n >= 5 && n <= 7) || (n >= 12 && n <= 14);
    const plus = color === 'w' ? lowSide : !lowSide;
    return [{ dc: 0, dt: plus ? 1 : -1 }];
  }
  function pawnPattern(color, name) {
    const pos = G.positionsOf(name)[0];                // frame-1 position
    const adv = [], caps = new Set();
    for (const F of forwardDirs(color, name)) {
      const r1 = G.step(pos, F);
      if (r1) {
        const r2 = G.step(r1.pos, r1.dir);
        adv.push({ one: IDX[G.cellAt(r1.pos)], two: r2 ? IDX[G.cellAt(r2.pos)] : -1 });
      }
      for (const S of [{ dc: F.dt, dt: -F.dc }, { dc: -F.dt, dt: F.dc }]) {
        const r = G.step(pos, { dc: F.dc + S.dc, dt: F.dt + S.dt });
        if (r) { const c = G.cellAt(r.pos); if (c !== name) caps.add(IDX[c]); }
      }
    }
    // Once a pawn is in the centre diamond it can never step back into the loop it came from
    // (White came from cells 1-7, Black from 12-18), e.g. White R10 to Q1, Black Q9 to R18.
    const n = parseInt(name.slice(1), 10);
    if (n >= 8 && n <= 11) {
      const home = (i) => (color === 'w' ? NUM[i] <= 7 : NUM[i] >= 12);
      return { adv: adv.filter((a) => !home(a.one)), caps: [...caps].filter((i) => !home(i)) };
    }
    return { adv, caps: [...caps] };
  }
  const PAWN = { w: NAMES.map((n) => pawnPattern('w', n)), b: NAMES.map((n) => pawnPattern('b', n)) };
  // reverse map: PAWN_ATTACKERS[color][target] = cells from which a pawn of `color` attacks target
  const PAWN_ATTACKERS = { w: NAMES.map(() => []), b: NAMES.map(() => []) };
  for (const c of ['w', 'b']) PAWN[c].forEach((p, i) => p.caps.forEach((t) => PAWN_ATTACKERS[c][t].push(i)));
  const isPromoCell = (color, i) => (color === 'w' ? NUM[i] === 15 : NUM[i] === 4);

  // distance (in pawn advances) to promotion, for the evaluator
  const PROMO_DIST = {};
  for (const c of ['w', 'b']) {
    const d = NAMES.map(() => Infinity);
    const q = [];
    NAMES.forEach((_, i) => { if (isPromoCell(c, i)) { d[i] = 0; q.push(i); } });
    const rev = NAMES.map(() => []);
    PAWN[c].forEach((p, i) => p.adv.forEach((a) => rev[a.one].push(i)));
    while (q.length) { const x = q.shift(); for (const y of rev[x]) if (d[y] === Infinity) { d[y] = d[x] + 1; q.push(y); } }
    PROMO_DIST[c] = d;
  }

  // ---- Phase 4 generic patterns on an occupancy (board[i] = {c:color} or null) ----
  function walkTargets(lines, from, board, color, maxSteps = Infinity) {
    const out = new Set();
    for (const path of lines[from]) {
      for (let k = 0; k < path.length && k < maxSteps; k++) {
        const j = path[k], p = board[j];
        if (!p) { out.add(j); continue; }
        if (p.c !== color) out.add(j);
        break;
      }
    }
    return out;
  }
  const Patterns = {
    ORTHO_LINE: (i, board, color) => walkTargets(ORTHO_LINES, i, board, color),
    DIAG_LINE: (i, board, color, max = Infinity) => walkTargets(DIAG_LINES, i, board, color, max),
    ANY_LINE: (i, board, color) => new Set([...walkTargets(ORTHO_LINES, i, board, color), ...walkTargets(DIAG_LINES, i, board, color)]),
    ONE_STEP: (i, board, color) => new Set(ONE_STEP[i].filter((j) => !board[j] || board[j].c !== color)),
    LEAP: (i, board, color) => new Set(LEAP[i].filter((j) => !board[j] || board[j].c !== color)),
    RUNNER: (i, board, color, firstMove) => {
      const out = new Set(), pp = PAWN[color][i];
      for (const a of pp.adv) {
        if (board[a.one]) continue;
        out.add(a.one);
        if (firstMove && a.two >= 0 && !board[a.two]) out.add(a.two);
      }
      for (const j of pp.caps) if (board[j] && board[j].c !== color) out.add(j);
      return out;
    },
  };

  // ---- Game state ----
  const VALUES = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
  const SETUP = {
    w: { K: ['Q4'], Q: ['Q5'], B: ['B4', 'B5'], N: ['N4', 'N5'], R: ['R4', 'R5'], P: ['Q3', 'B3', 'N3', 'R3', 'Q6', 'B6', 'N6', 'R6'] },
    b: { K: ['R14'], Q: ['R15'], B: ['N14', 'N15'], N: ['B14', 'B15'], R: ['Q14', 'Q15'], P: ['R13', 'N13', 'B13', 'Q13', 'R16', 'N16', 'B16', 'Q16'] },
  };
  const CASTLE = {
    w: { k: IDX.Q4, kTo: IDX.N4, r: IDX.R4, rTo: IDX.B4, between: [IDX.B4, IDX.N4], pass: [IDX.B4, IDX.N4] },
    b: { k: IDX.R14, kTo: IDX.B14, r: IDX.Q14, rTo: IDX.N14, between: [IDX.N14, IDX.B14], pass: [IDX.N14, IDX.B14] },
  };

  function newGame() {
    const board = new Array(72).fill(null);
    for (const c of ['w', 'b']) for (const t in SETUP[c]) for (const n of SETUP[c][t]) board[IDX[n]] = { t, c, moved: false };
    const s = { board, turn: 'w', history: [], posCounts: {} };
    s.posCounts[positionKey(s)] = 1;
    return s;
  }
  function emptyGame() { return { board: new Array(72).fill(null), turn: 'w', history: [], posCounts: {} }; }

  function findKing(s, color) { for (let i = 0; i < 72; i++) { const p = s.board[i]; if (p && p.t === 'K' && p.c === color) return i; } return -1; }

  // Is cell `T` attacked by pieces of color `by`? (reverse lookup from T; patterns are symmetric)
  function isAttacked(s, T, by) {
    const b = s.board;
    for (const j of LEAP[T]) { const p = b[j]; if (p && p.c === by && p.t === 'N') return true; }
    for (const j of ONE_STEP[T]) { const p = b[j]; if (p && p.c === by && p.t === 'K') return true; }
    for (const j of PAWN_ATTACKERS[by][T]) { const p = b[j]; if (p && p.c === by && p.t === 'P') return true; }
    for (const path of ORTHO_LINES[T]) for (const j of path) { const p = b[j]; if (!p) continue; if (p.c === by && (p.t === 'R' || p.t === 'Q')) return true; break; }
    for (const path of DIAG_LINES[T]) for (let k = 0; k < path.length; k++) {
      const p = b[path[k]]; if (!p) continue;
      if (p.c === by && (p.t === 'Q' || (p.t === 'B' && k < config.BISHOP_MAX_STEPS))) return true;
      break;
    }
    return false;
  }
  // forward attack set (used by tests to validate isAttacked)
  function attacksOf(s, i) {
    const p = s.board[i], b = s.board;
    switch (p.t) {
      case 'P': return new Set(PAWN[p.c][i].caps);
      case 'N': return new Set(LEAP[i]);
      case 'K': return new Set(ONE_STEP[i]);
      case 'R': return lineAttacks(ORTHO_LINES, i, b);
      case 'B': return lineAttacks(DIAG_LINES, i, b, config.BISHOP_MAX_STEPS);
      case 'Q': return new Set([...lineAttacks(ORTHO_LINES, i, b), ...lineAttacks(DIAG_LINES, i, b)]);
    }
    return new Set();
  }
  function lineAttacks(lines, i, b, max = Infinity) {
    const out = new Set();
    for (const path of lines[i]) for (let k = 0; k < path.length && k < max; k++) { out.add(path[k]); if (b[path[k]]) break; }
    return out;
  }
  const inCheck = (s, color) => { const k = findKing(s, color); return k >= 0 && isAttacked(s, k, color === 'w' ? 'b' : 'w'); };

  function pseudoMoves(s, color) {
    const moves = [], b = s.board;
    for (let i = 0; i < 72; i++) {
      const p = b[i]; if (!p || p.c !== color) continue;
      let targets;
      switch (p.t) {
        case 'R': targets = Patterns.ORTHO_LINE(i, b, color); break;
        case 'B': targets = Patterns.DIAG_LINE(i, b, color, config.BISHOP_MAX_STEPS); break;
        case 'Q': targets = Patterns.ANY_LINE(i, b, color); break;
        case 'K': targets = Patterns.ONE_STEP(i, b, color); break;
        case 'N': targets = Patterns.LEAP(i, b, color); break;
        case 'P': targets = Patterns.RUNNER(i, b, color, !p.moved); break;
      }
      for (const j of targets) {
        if (b[j] && b[j].t === 'K') continue; // kings are never captured (legal play prevents this anyway)
        if (p.t === 'P' && isPromoCell(color, j)) {
          for (const pr of ['Q', 'R', 'B', 'N']) moves.push({ from: i, to: j, promo: pr });
        } else moves.push({ from: i, to: j });
      }
      if (p.t === 'K' && !p.moved) {
        const C = CASTLE[color], r = b[C.r];
        if (i === C.k && r && r.t === 'R' && r.c === color && !r.moved && C.between.every((x) => !b[x]))
          moves.push({ from: i, to: C.kTo, castle: true });
      }
    }
    return moves;
  }

  function makeMove(s, m) {
    const b = s.board, p = b[m.from];
    const undo = { m, captured: b[m.to], movedBefore: p.moved, piece: p, rook: null, turn: s.turn };
    b[m.to] = m.promo ? { t: m.promo, c: p.c, moved: true } : p;
    b[m.from] = null;
    p.moved = true;
    if (m.castle) {
      const C = CASTLE[p.c], r = b[C.r];
      undo.rook = { piece: r, moved: r.moved };
      b[C.rTo] = r; b[C.r] = null; r.moved = true;
    }
    s.turn = s.turn === 'w' ? 'b' : 'w';
    return undo;
  }
  function unmakeMove(s, u) {
    const b = s.board, m = u.m;
    b[m.from] = u.piece; u.piece.moved = u.movedBefore;
    b[m.to] = u.captured;
    if (u.rook) { const C = CASTLE[u.piece.c]; b[C.r] = u.rook.piece; b[C.rTo] = null; u.rook.piece.moved = u.rook.moved; }
    s.turn = u.turn;
  }

  function legalMoves(s, color = s.turn) {
    const opp = color === 'w' ? 'b' : 'w';
    const out = [];
    for (const m of pseudoMoves(s, color)) {
      if (m.castle) {
        const C = CASTLE[color];
        if (isAttacked(s, C.k, opp) || C.pass.some((x) => isAttacked(s, x, opp))) continue;
      }
      const saveTurn = s.turn; s.turn = color;
      const u = makeMove(s, m);
      const ok = !inCheck(s, color);
      unmakeMove(s, u); s.turn = saveTurn;
      if (ok) out.push(m);
    }
    return out;
  }

  function positionKey(s) {
    let k = s.turn;
    for (let i = 0; i < 72; i++) { const p = s.board[i]; k += p ? (p.c === 'w' ? p.t : p.t.toLowerCase()) : '.'; }
    return k;
  }

  // Full move with bookkeeping (used by the UI and the AI-vs-AI test)
  function playMove(s, m) {
    const fromName = NAMES[m.from], toName = NAMES[m.to];
    const p = s.board[m.from];
    const u = makeMove(s, m);
    const key = positionKey(s);
    s.posCounts[key] = (s.posCounts[key] || 0) + 1;
    let note = m.castle ? `${fromName}-${toName} (castles)` : `${fromName}${u.captured ? 'x' : '-'}${toName}${m.promo ? '=' + m.promo : ''}`;
    s.history.push({ undo: u, key, note, piece: p.t, color: p.c, captured: u.captured });
    return u;
  }
  function undoLast(s) {
    const h = s.history.pop(); if (!h) return null;
    s.posCounts[h.key]--; if (!s.posCounts[h.key]) delete s.posCounts[h.key];
    unmakeMove(s, h.undo);
    return h;
  }

  function status(s) {
    const moves = legalMoves(s);
    const check = inCheck(s, s.turn);
    if (!moves.length) return check ? { over: true, result: 'checkmate', winner: s.turn === 'w' ? 'b' : 'w', check } : { over: true, result: 'stalemate', check };
    const last = s.history[s.history.length - 1];
    if (last && s.posCounts[last.key] >= 3) return { over: true, result: 'repetition', check };
    return { over: false, check, moves };
  }

  // ---- Hooks for online play and the bot playbook (added on top; existing behavior unchanged) ----
  // Deterministic move string: "FROM-TO", plus "=Q|R|B|N" for promotions. Castling is the king's move.
  function moveToString(m) { return NAMES[m.from] + '-' + NAMES[m.to] + (m.promo ? '=' + m.promo : ''); }
  // Returns the legal move matching a move string in this position, or null if it is not legal.
  function moveFromString(s, str) {
    if (typeof str !== 'string' || str.length > 20) return null;
    return legalMoves(s).find((m) => moveToString(m) === str) || null;
  }
  // Playbook position key: "<w|b>|<white pieces>|<black pieces>|<castling rights>".
  function playbookKey(s) {
    const lists = { w: [], b: [] };
    s.board.forEach((p, i) => { if (p) lists[p.c].push(p.t + '@' + NAMES[i]); });
    const can = (c) => {
      const C = CASTLE[c], k = s.board[C.k], r = s.board[C.r];
      return !!(k && k.t === 'K' && k.c === c && !k.moved && r && r.t === 'R' && r.c === c && !r.moved);
    };
    const rights = (can('w') ? 'W' : '') + (can('b') ? 'B' : '') || '-';
    return s.turn + '|' + lists.w.sort().join(',') + '|' + lists.b.sort().join(',') + '|' + rights;
  }

  // Builds a game state from a playbook key (used for puzzles). Pawns on their starting
  // cells may still double-step; castling rights come from the key's last field.
  function stateFromKey(key) {
    const [turn, wl, bl, rights] = String(key).split('|');
    const s = emptyGame();
    s.turn = turn === 'b' ? 'b' : 'w';
    for (const [c, list] of [['w', wl], ['b', bl]]) {
      for (const e of (list || '').split(',').filter(Boolean)) {
        const [t, cell] = e.split('@');
        if (!(cell in IDX) || !'KQRBNP'.includes(t)) throw new Error('Bad position key');
        const start = t === 'P' && SETUP[c].P.includes(cell);
        s.board[IDX[cell]] = { t, c, moved: t === 'P' ? !start : true };
      }
    }
    for (const c of ['w', 'b']) {
      if (!(rights || '').includes(c === 'w' ? 'W' : 'B')) continue;
      const C = CASTLE[c], k = s.board[C.k], r = s.board[C.r];
      if (k && k.t === 'K' && k.c === c) k.moved = false;
      if (r && r.t === 'R' && r.c === c) r.moved = false;
    }
    s.posCounts[positionKey(s)] = 1;
    return s;
  }

  return { NAMES, IDX, NUM, config, Patterns, PAWN, PROMO_DIST, VALUES, ORTHO_LINES, DIAG_LINES, ONE_STEP, LEAP,
    moveToString, moveFromString, playbookKey, stateFromKey,
    newGame, emptyGame, findKing, isAttacked, attacksOf, inCheck, pseudoMoves, legalMoves, makeMove, unmakeMove,
    playMove, undoLast, status, isPromoCell, positionKey };
})();

// ================= MODULE 4: Computer opponent =================
const AI = (() => {
  const R = Rules;
  const MATE = 100000;

  function evaluate(s) {             // from White's point of view
    let score = 0;
    const b = s.board;
    for (let i = 0; i < 72; i++) {
      const p = b[i]; if (!p) continue;
      let v = R.VALUES[p.t];
      if (p.t === 'P') { const d = R.PROMO_DIST[p.c][i]; if (d < 30) v += Math.max(0, 12 - d) * 0.06; }
      score += p.c === 'w' ? v : -v;
    }
    score += 0.02 * (R.pseudoMoves(s, 'w').length - R.pseudoMoves(s, 'b').length);
    return score;
  }

  function order(s, moves) {
    const b = s.board;
    return moves.map((m) => ({ m, k: (b[m.to] ? 10 * R.VALUES[b[m.to].t] - R.VALUES[b[m.from].t] : 0) + (m.promo === 'Q' ? 8 : 0) }))
      .sort((a, b2) => b2.k - a.k).map((x) => x.m);
  }

  function negamax(s, depth, alpha, beta, ply) {
    const color = s.turn, sign = color === 'w' ? 1 : -1;
    const moves = R.legalMoves(s);
    if (!moves.length) return R.inCheck(s, color) ? -MATE + ply : 0;
    if (depth === 0) return sign * evaluate(s);
    let best = -Infinity;
    for (const m of order(s, moves)) {
      const u = R.makeMove(s, m);
      const v = -negamax(s, depth - 1, -beta, -alpha, ply + 1);
      R.unmakeMove(s, u);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Returns the chosen move. Random tie-break among equally scored moves.
  // `preferred` (optional): move strings to search first, e.g. playbook moves. Only changes search order.
  // `avoid` (optional): move strings the bot should skip at the root when it has other moves.
  function chooseMove(s, depth, preferred, avoid) {
    let moves = R.legalMoves(s);
    if (!moves.length) return null;
    if (avoid && avoid.length) {
      const kept = moves.filter((m) => !avoid.includes(R.moveToString(m)));
      if (kept.length) moves = kept;
    }
    for (let i = moves.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [moves[i], moves[j]] = [moves[j], moves[i]]; }
    const scored = [];
    let alpha = -Infinity;
    let ordered = order(s, moves);
    if (preferred && preferred.length) {
      const rank = (m) => { const i = preferred.indexOf(R.moveToString(m)); return i < 0 ? Infinity : i; };
      ordered = ordered.map((m, i) => ({ m, i, r: rank(m) })).sort((a, b) => (a.r - b.r) || (a.i - b.i)).map((x) => x.m);
    }
    for (const m of ordered) {
      const u = R.makeMove(s, m);
      // full window at the root so ties are exact
      const v = -negamax(s, depth - 1, -Infinity, -alpha + 1e-9, 1);
      R.unmakeMove(s, u);
      scored.push({ m, v });
      if (v > alpha) alpha = v;
    }
    const best = Math.max(...scored.map((x) => x.v));
    const top = scored.filter((x) => x.v >= best - 1e-6);
    return top[Math.floor(Math.random() * top.length)].m;
  }

  return { evaluate, chooseMove };
})();


// Global alias required by the multiplayer spec (Rules.positionKey is the older repetition key and is unchanged).
function positionKey(state) { return Rules.playbookKey(state); }
