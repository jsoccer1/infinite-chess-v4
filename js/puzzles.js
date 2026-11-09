// ================= Puzzle solver helpers (shared by the puzzle screen and the bank generator) =================
const PuzzleLogic = (() => {
  const R = Rules;
  const opp = (c) => (c === 'w' ? 'b' : 'w');

  function material(s, side) {
    let m = 0;
    for (const p of s.board) if (p && p.t !== 'K') m += (p.c === side ? 1 : -1) * R.VALUES[p.t];
    return m;
  }
  // true if `color` has at least one legal move (stops at the first one)
  function hasLegalMove(s, color) {
    for (const m of R.pseudoMoves(s, color)) {
      if (m.castle) return R.legalMoves(s, color).length > 0;
      const save = s.turn; s.turn = color;
      const u = R.makeMove(s, m);
      const ok = !R.inCheck(s, color);
      R.unmakeMove(s, u); s.turn = save;
      if (ok) return true;
    }
    return false;
  }
  const isMate = (s) => R.inCheck(s, s.turn) && !hasLegalMove(s, s.turn);

  // legal moves for the side to move that give checkmate
  function mateMoves(s) {
    const out = [];
    for (const m of R.legalMoves(s)) {
      const u = R.makeMove(s, m);
      if (isMate(s)) out.push(m);
      R.unmakeMove(s, u);
    }
    return out;
  }
  // after `m`, can the side that played it mate next move against every reply?
  function forcesMate2(s, m) {
    const u = R.makeMove(s, m);
    let ok = true;
    const replies = R.legalMoves(s);
    if (!replies.length) ok = false;                  // mate in 1 or stalemate, not a mate in 2
    for (const r of replies) {
      const v = R.makeMove(s, r);
      const has = mateMoves(s).length > 0;
      R.unmakeMove(s, v);
      if (!has) { ok = false; break; }
    }
    R.unmakeMove(s, u);
    return ok;
  }
  // the reply that leaves the fewest mating moves (the toughest defence)
  function toughestReply(s) {
    let best = null, bestN = Infinity;
    for (const r of R.legalMoves(s)) {
      const v = R.makeMove(s, r);
      const n = mateMoves(s).length;
      R.unmakeMove(s, v);
      if (n < bestN) { bestN = n; best = r; }
    }
    return best;
  }

  // captures-only extension so a search never stops in the middle of an exchange
  function qsearch(s, alpha, beta, side, depth) {
    const stand = material(s, side), max = s.turn === side;
    if (depth === 0) return stand;
    if (max) { if (stand >= beta) return stand; if (stand > alpha) alpha = stand; }
    else { if (stand <= alpha) return stand; if (stand < beta) beta = stand; }
    let best = stand;
    for (const m of R.pseudoMoves(s, s.turn)) {
      if (!s.board[m.to] && !m.promo) continue;
      const mover = s.turn;
      const u = R.makeMove(s, m);
      if (R.inCheck(s, mover)) { R.unmakeMove(s, u); continue; }
      const v = qsearch(s, alpha, beta, side, depth - 1);
      R.unmakeMove(s, u);
      if (max) { if (v > best) best = v; if (v > alpha) alpha = v; }
      else { if (v < best) best = v; if (v < beta) beta = v; }
      if (alpha >= beta) break;
    }
    return best;
  }
  // material-only minimax from `side`'s point of view; mate scores +-1000
  function search(s, depth, alpha, beta, side) {
    if (depth === 0) {
      if (!hasLegalMove(s, s.turn)) return R.inCheck(s, s.turn) ? (s.turn === side ? -1000 : 1000) : material(s, side);
      return qsearch(s, alpha, beta, side, 4);
    }
    const moves = R.legalMoves(s);
    if (!moves.length) return R.inCheck(s, s.turn) ? (s.turn === side ? -1000 : 1000) : material(s, side);
    const max = s.turn === side;
    let best = max ? -Infinity : Infinity;
    for (const m of moves) {
      const u = R.makeMove(s, m);
      const v = search(s, depth - 1, alpha, beta, side);
      R.unmakeMove(s, u);
      if (max) { if (v > best) best = v; if (v > alpha) alpha = v; }
      else { if (v < best) best = v; if (v < beta) beta = v; }
      if (alpha >= beta) break;
    }
    return best;
  }
  // how many squares the defending king could step to (a cheap filter before mate-in-2 checks)
  function kingRoom(s, color) {
    const k = R.findKing(s, color); if (k < 0) return 0;
    const save = s.turn; s.turn = color;
    const n = R.legalMoves(s, color).filter((m) => m.from === k).length;
    s.turn = save;
    return n;
  }
  // value of playing `m` for the side to move, looking `depth` more plies after it
  function valueAfter(s, m, depth) {
    const side = s.turn;
    const u = R.makeMove(s, m);
    const v = search(s, depth, -Infinity, Infinity, side);
    R.unmakeMove(s, u);
    return v;
  }
  // best reply for the defender in a material puzzle (minimises the attacker's result)
  function bestDefence(s, depth) {
    const attacker = opp(s.turn);
    let best = null, bestV = Infinity;
    for (const r of R.legalMoves(s)) {
      const u = R.makeMove(s, r);
      const v = search(s, depth, -Infinity, Infinity, attacker);
      R.unmakeMove(s, u);
      if (v < bestV) { bestV = v; best = r; }
    }
    return best;
  }

  return { material, kingRoom, hasLegalMove, isMate, mateMoves, forcesMate2, toughestReply, search, valueAfter, bestDefence };
})();
