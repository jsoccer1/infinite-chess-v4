// ================= Ground-truth data from the spec (used by the #test runner) =================
const APPENDIX_A = `
Q1  | Q2 B1 R11           | B2 R10              | B3 N2 N10 N12 R9
Q2  | Q1 Q3 B2            | B1 B3               | B4 N1 N3 R10
Q3  | Q2 Q4 B3            | B2 B4               | B1 B5 N2 N4
Q4  | Q3 Q5 B4            | B3 B5               | B2 B6 N3 N5
Q5  | Q4 Q6 B5            | B4 B6               | B3 B7 N4 N6
Q6  | Q5 Q7 B6            | B5 B7               | B4 B8 N5 N7
Q7  | Q6 Q8 B7            | B6 B8               | B5 B9 N6 N8 N18
Q8  | Q7 Q9 B8 R18        | B7 B9 N18           | B6 B10 B18 N7 N9 N17
Q9  | Q8 Q10 B9 N18       | B8 B10 B18 R18      | Q18 B7 B11 B17 N8 N10 R17
Q10 | Q9 Q11 B10 B18      | Q18 B9 B11 N18      | Q17 B8 B12 N9 N11 N17 R18
Q11 | Q10 Q12 Q18 B11     | B10 B12 B18         | B9 B13 B17 N10 N12 N18
Q12 | Q11 Q13 B12         | B11 B13             | B10 B14 B18 N11 N13
Q13 | Q12 Q14 B13         | B12 B14             | B11 B15 N12 N14
Q14 | Q13 Q15 B14         | B13 B15             | B12 B16 N13 N15
Q15 | Q14 Q16 B15         | B14 B16             | B13 B17 N14 N16
Q16 | Q15 Q17 B16         | B15 B17             | B14 B18 N15 N17
Q17 | Q16 Q18 B17         | B16 B18             | Q10 B15 N16 N18
Q18 | Q11 Q17 B18         | Q10 B17             | Q9 B10 B12 B16 N17
B1  | Q1 B2 N1 R10        | Q2 N2 R9 R11        | Q3 N3 N9 N11 R2 R8 R12
B2  | Q2 B1 B3 N2         | Q1 Q3 N1 N3         | Q4 N4 R1 R3 R9 R11
B3  | Q3 B2 B4 N3         | Q2 Q4 N2 N4         | Q1 Q5 N1 N5 R2 R4
B4  | Q4 B3 B5 N4         | Q3 Q5 N3 N5         | Q2 Q6 N2 N6 R3 R5
B5  | Q5 B4 B6 N5         | Q4 Q6 N4 N6         | Q3 Q7 N3 N7 R4 R6
B6  | Q6 B5 B7 N6         | Q5 Q7 N5 N7         | Q4 Q8 N4 N8 R5 R7
B7  | Q7 B6 B8 N7         | Q6 Q8 N6 N8         | Q5 Q9 N5 N9 R6 R8 R18
B8  | Q8 B7 B9 N8         | Q7 Q9 N7 N9         | Q6 Q10 N6 N10 N18 R7 R9
B9  | Q9 B8 B10 N9        | Q8 Q10 N8 N10       | Q7 Q11 B18 N7 N11 R8 R10 R18
B10 | Q10 B9 B11 N10      | Q9 Q11 N9 N11       | Q8 Q12 Q18 N8 N12 N18 R9 R11
B11 | Q11 B10 B12 N11     | Q10 Q12 N10 N12     | Q9 Q13 B18 N9 N13 R10 R12
B12 | Q12 B11 B13 N12     | Q11 Q13 N11 N13     | Q10 Q14 Q18 N10 N14 R11 R13
B13 | Q13 B12 B14 N13     | Q12 Q14 N12 N14     | Q11 Q15 N11 N15 R12 R14
B14 | Q14 B13 B15 N14     | Q13 Q15 N13 N15     | Q12 Q16 N12 N16 R13 R15
B15 | Q15 B14 B16 N15     | Q14 Q16 N14 N16     | Q13 Q17 N13 N17 R14 R16
B16 | Q16 B15 B17 N16     | Q15 Q17 N15 N17     | Q14 Q18 N14 N18 R15 R17
B17 | Q17 B16 B18 N17     | Q16 Q18 N16 N18     | Q9 Q11 Q15 N15 R16 R18
B18 | Q10 Q18 B17 N18     | Q9 Q11 Q17 N17      | Q8 Q12 Q16 B9 B11 N16 R17
N1  | B1 N2 R1 R9         | B2 R2 R8 R10        | Q2 B3 N8 N10 R3 R7 R11
N2  | B2 N1 N3 R2         | B1 B3 R1 R3         | Q1 Q3 B4 R4 R8 R10
N3  | B3 N2 N4 R3         | B2 B4 R2 R4         | Q2 Q4 B1 B5 R1 R5
N4  | B4 N3 N5 R4         | B3 B5 R3 R5         | Q3 Q5 B2 B6 R2 R6
N5  | B5 N4 N6 R5         | B4 B6 R4 R6         | Q4 Q6 B3 B7 R3 R7
N6  | B6 N5 N7 R6         | B5 B7 R5 R7         | Q5 Q7 B4 B8 R4 R8
N7  | B7 N6 N8 R7         | B6 B8 R6 R8         | Q6 Q8 B5 B9 R1 R5 R9
N8  | B8 N7 N9 R8         | B7 B9 R7 R9         | Q7 Q9 B6 B10 N1 R6 R10
N9  | B9 N8 N10 R9        | B8 B10 R8 R10       | Q8 Q10 B1 B7 B11 R1 R7 R11
N10 | B10 N9 N11 R10      | B9 B11 R9 R11       | Q1 Q9 Q11 B8 B12 N1 R8 R12
N11 | B11 N10 N12 R11     | B10 B12 R10 R12     | Q10 Q12 B1 B9 B13 R9 R13
N12 | B12 N11 N13 R12     | B11 B13 R11 R13     | Q1 Q11 Q13 B10 B14 R10 R14
N13 | B13 N12 N14 R13     | B12 B14 R12 R14     | Q12 Q14 B11 B15 R11 R15
N14 | B14 N13 N15 R14     | B13 B15 R13 R15     | Q13 Q15 B12 B16 R12 R16
N15 | B15 N14 N16 R15     | B14 B16 R14 R16     | Q14 Q16 B13 B17 R13 R17
N16 | B16 N15 N17 R16     | B15 B17 R15 R17     | Q15 Q17 B14 B18 R14 R18
N17 | B17 N16 N18 R17     | B16 B18 R16 R18     | Q8 Q10 Q16 Q18 B15 R15
N18 | Q9 B18 N17 R18      | Q8 Q10 B17 R17      | Q7 Q11 Q17 B8 B10 B16 R16
R1  | N1 R2 R8            | N2 R9               | B2 N3 N7 N9 R10
R2  | N2 R1 R3            | N1 N3               | B1 B3 N4 R9
R3  | N3 R2 R4            | N2 N4               | B2 B4 N1 N5
R4  | N4 R3 R5            | N3 N5               | B3 B5 N2 N6
R5  | N5 R4 R6            | N4 N6               | B4 B6 N3 N7
R6  | N6 R5 R7            | N5 N7               | B5 B7 N4 N8
R7  | N7 R6 R8            | N6 N8               | B6 B8 N1 N5 N9
R8  | N8 R1 R7 R9         | N1 N7 N9            | B1 B7 B9 N2 N6 N10
R9  | N1 N9 R8 R10        | B1 N8 N10 R1        | Q1 B2 B8 B10 N7 N11 R2
R10 | B1 N10 R9 R11       | Q1 N1 N9 N11        | Q2 B9 B11 N2 N8 N12 R1
R11 | Q1 N11 R10 R12      | B1 N10 N12          | B2 B10 B12 N1 N9 N13
R12 | N12 R11 R13         | N11 N13             | B1 B11 B13 N10 N14
R13 | N13 R12 R14         | N12 N14             | B12 B14 N11 N15
R14 | N14 R13 R15         | N13 N15             | B13 B15 N12 N16
R15 | N15 R14 R16         | N14 N16             | B14 B16 N13 N17
R16 | N16 R15 R17         | N15 N17             | B15 B17 N14 N18
R17 | N17 R16 R18         | N16 N18             | Q9 B16 B18 N15
R18 | Q8 N18 R17          | Q9 N17              | Q10 B7 B9 B17 N16`;

const APPENDIX_B = {
  laneLines: [
    { from: 'Q5', dir: { dc: 0, dt: 1 }, expect: 'Q6 Q7 Q8 Q9 Q10 Q11 Q12 Q13 Q14 Q15 Q16 Q17 Q18 Q11 B11 N11 R11 Q1 Q2 Q3 Q4' },
    { from: 'R7', dir: { dc: 0, dt: 1 }, expect: 'R8 R9 R10 R11 R12 R13 R14 R15 R16 R17 R18 Q8 B8 N8 R8 R1 R2 R3 R4 R5 R6' },
    { from: 'Q18', dir: { dc: 0, dt: 1 }, expect: 'Q11 B11 N11 R11 Q1 Q2 Q3 Q4 Q5 Q6 Q7 Q8 Q9 Q10 Q11 Q12 Q13 Q14 Q15 Q16 Q17' },
  ],
  acrossLines: [
    { from: 'N5', expect: [['R5'], ['B5', 'Q5']] },
  ],
  diagLines: [
    { from: 'R18', expect: [['Q9', 'B10', 'N11', 'R12'], ['N17', 'B16', 'Q15']] },
    { from: 'Q7', expect: [['B8', 'N9', 'R10', 'Q1'], ['B6', 'N5', 'R4']] },
    { from: 'B9', expect: [['N10', 'R11'], ['N8', 'R7'], ['Q10', 'Q18'], ['Q8']] },
    { from: 'N5', expect: [['R6'], ['R4'], ['B6', 'Q7'], ['B4', 'Q3']] },
    { from: 'Q4', expect: [['B5', 'N6', 'R7'], ['B3', 'N2', 'R1']] },
    { from: 'R8', expect: [['N1', 'B2', 'Q3'], ['N9', 'B10', 'Q11'], ['N7', 'B6', 'Q5']] },
  ],
};
const PHASE3_CELLS = ['Q1','Q4','R7','R8','Q8','Q9','B10','N11','R11','Q11','Q12','Q18','R18','R12','R1'];

// ================= Test runner (open with #test) =================
const Tests = (() => {
  const G = BoardGraph, Ge = Geometry, R = Rules;
  const sortJoin = (it) => G.sortCells([...it]).join(' ');
  const normLines = (ls) => ls.map((l) => l.join(',')).sort().join(' | ');

  function parseA() {
    return APPENDIX_A.trim().split('\n').map((line) => {
      const [n, o, d, l] = line.split('|').map((s) => s.trim());
      return { n, o: o.split(/\s+/), d: d.split(/\s+/), l: l.split(/\s+/) };
    });
  }

  function pointInPoly(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  // shared with the Line mode in the UI
  function lineModeLines(start, neighbor) {
    const out = [];
    for (const p of G.positionsOf(start)) for (const d of [...G.ORTHOGONAL, ...G.DIAGONAL]) {
      const r = G.step(p, d);
      if (r && G.cellAt(r.pos) === neighbor) {
        const path = G.walkLine(start, p, d);
        if (!out.some((x) => x.join() === path.join())) out.push(path);
      }
    }
    return out;
  }

  function syncTests() {
    const res = [];
    const add = (phase, name, pass, detail = '') => res.push({ phase, name, pass: !!pass, detail });

    // ---------- Phase 1 ----------
    const names = new Set();
    for (let c = 0; c < 4; c++) for (let t = 1; t <= 22; t++) names.add(G.cellAt(c, t));
    add(1, '88 strip positions map onto exactly 72 distinct names', names.size === 72 && G.ALL_CELLS.length === 72, `${names.size} names`);
    let rt = 0; for (const X of G.ALL_CELLS) for (const p of G.positionsOf(X)) if (G.cellAt(p) !== X) rt++;
    add(1, 'cellAt(positionsOf(X)) === X for every cell', rt === 0, `${rt} mismatches`);
    let asym = 0;
    for (const X of G.ALL_CELLS) {
      for (const Y of G.orthogonalNeighbors(X)) if (!G.orthogonalNeighbors(Y).has(X)) asym++;
      for (const Y of G.diagonalNeighbors(X)) if (!G.diagonalNeighbors(Y).has(X)) asym++;
      for (const Y of G.leaperTargets(X)) if (!G.leaperTargets(Y).has(X)) asym++;
    }
    add(1, 'Orthogonal, diagonal and leaper relations are symmetric', asym === 0, `${asym} asymmetric pairs`);
    let ov = 0;
    for (const X of G.ALL_CELLS) { const L = G.leaperTargets(X); for (const Y of [...G.orthogonalNeighbors(X), ...G.diagonalNeighbors(X)]) if (L.has(Y)) ov++; }
    add(1, 'No leaperTargets overlap orthogonal or diagonal neighbors', ov === 0, `${ov} overlaps`);
    const A = parseA();
    for (const row of A) {
      const ok = sortJoin(G.orthogonalNeighbors(row.n)) === sortJoin(row.o) && sortJoin(G.diagonalNeighbors(row.n)) === sortJoin(row.d) && sortJoin(G.leaperTargets(row.n)) === sortJoin(row.l);
      add(1, `Appendix A row ${row.n}`, ok, ok ? '' : `got ${sortJoin(G.orthogonalNeighbors(row.n))} | ${sortJoin(G.diagonalNeighbors(row.n))} | ${sortJoin(G.leaperTargets(row.n))}`);
    }
    for (const t of APPENDIX_B.laneLines) {
      const got = G.walkLine(t.from, G.positionsOf(t.from)[0], t.dir).join(' ');
      add(1, `Appendix B lane line from ${t.from} (0,+1)`, got === t.expect, got);
    }
    for (const t of APPENDIX_B.acrossLines) {
      const got = G.linesFrom(t.from, [{ dc: 1, dt: 0 }, { dc: -1, dt: 0 }]);
      add(1, `Appendix B lines across lanes from ${t.from}`, normLines(got) === normLines(t.expect), normLines(got));
    }
    for (const t of APPENDIX_B.diagLines) {
      const got = G.linesFrom(t.from, G.DIAGONAL);
      add(1, `Appendix B diagonal lines from ${t.from}`, normLines(got) === normLines(t.expect), normLines(got));
    }

    // ---------- Phase 2 ----------
    let clickFail = [];
    for (const n of G.ALL_CELLS) { const p = Ge.labelPos(n); if (Ge.hitTest(p.x, p.y) !== n) clickFail.push(n); }
    add(2, 'Clicking every label position returns that cell', clickFail.length === 0, clickFail.join(' '));
    const mid = []; let last = null;
    for (let x = -Ge.BOARD_W / 2 + 0.005; x < Ge.BOARD_W / 2; x += 0.01) {
      const h = Ge.hitTest(x, 0) || '(hole)';
      if (h !== last) { mid.push(h); last = h; }
    }
    const midStr = mid.join(' ');
    add(2, 'Horizontal midline reads Q4 B4 N4 R4 (hole) R8 N9 B10 Q11 (hole) Q15 B15 N15 R15', midStr === 'Q4 B4 N4 R4 (hole) R8 N9 B10 Q11 (hole) Q15 B15 N15 R15', midStr);
    const ringL = [0, 1, 2, 3].map((k) => Ge.hitTest(Ge.CL.x - (k + 0.7) * Ge.W, 0.0001)[0]).join('');
    const ringR = [0, 1, 2, 3].map((k) => Ge.hitTest(Ge.CR.x + (k + 0.7) * Ge.W, 0.0001)[0]).join('');
    add(2, 'Left loop rings inner to outer R N B Q; right loop Q B N R', ringL === 'RNBQ' && ringR === 'QBNR', `${ringL} / ${ringR}`);
    add(2, 'Q8 touches the top tip, R11 touches the bottom tip', Ge.hitTest(0, Ge.D - 0.02) === 'Q8' && Ge.hitTest(0, -Ge.D + 0.02) === 'R11');
    add(2, 'R8 touches the left hole, Q11 touches the right hole', Ge.hitTest(Ge.CL.x + Ge.HOLE_W + 0.02, 0) === 'R8' && Ge.hitTest(Ge.CR.x - Ge.HOLE_W - 0.02, 0) === 'Q11');
    { // ring boundaries meet the crossing grid lines on all four diamond edges
      let bad = 0;
      const edges = [[Ge.CL, 45, 1], [Ge.CL, 315, -1], [Ge.CR, 135, -1], [Ge.CR, 225, 1]]; // [centre, edge angle, which side is the loop]
      for (const [c, ang, loopSide] of edges) for (const k of [0, 1, 2, 3]) for (const off of [0.03, Ge.W / 2, Ge.W - 0.03]) {
        const r = k * Ge.W + off;
        if (r < Ge.HOLE_W + 0.05) continue;
        const at = (deg) => Ge.hitTest(c.x + r * Math.cos(deg * Math.PI / 180), c.y + r * Math.sin(deg * Math.PI / 180));
        const loop = at(ang + loopSide * 0.5), cross = at(ang - loopSide * 0.5);
        if (!loop || !cross || !G.orthogonalNeighbors(loop).has(cross)) bad++;   // each seam is a real orthogonal step
      }
      add(2, 'Every cell edge on the diamond seams meets the right neighbor exactly (R7 with R8, Q7 with Q8, N1 with R9)', bad === 0, `${bad} misaligned seam points`);
    }
    let same = 0; for (const n of G.ALL_CELLS) for (const m of G.orthogonalNeighbors(n)) if (Ge.shade(n) === Ge.shade(m)) same++;
    add(2, 'Checkerboard: no two edge-sharing cells have the same shade', same === 0, `${same} conflicts`);
    const polys = {}; for (const n of G.ALL_CELLS) polys[n] = Ge.polygon(n);
    let gaps = 0, overlaps = 0, wrong = 0, samples = 0;
    for (let x = -Ge.BOARD_W / 2; x < Ge.BOARD_W / 2; x += 0.0731) for (let y = -Ge.R4; y < Ge.R4; y += 0.0697) {
      const dL = Math.hypot(x - Ge.CL.x, y), dR = Math.hypot(x - Ge.CR.x, y);
      if (Ge.inHole(x, y) || Ge.inHole(x + 0.01, y) || Ge.inHole(x - 0.01, y) || Ge.inHole(x, y + 0.01) || Ge.inHole(x, y - 0.01)) continue;
      if (!(dL < Ge.R4 - 0.01 || dR < Ge.R4 - 0.01)) continue;
      // skip points within 0.01 of a ring arc: drawn arcs are 16-point chords (sagitta under 0.002)
      if ([1, 2, 3, 4].some((k) => Math.abs(dL - k * Ge.W) < 0.01 || Math.abs(dR - k * Ge.W) < 0.01)) continue;
      samples++;
      const inside = G.ALL_CELLS.filter((n) => pointInPoly({ x, y }, polys[n]));
      if (inside.length === 0) gaps++; else if (inside.length > 1) overlaps++;
      else if (Ge.hitTest(x, y) !== inside[0]) wrong++;
    }
    add(2, 'No gaps or overlaps between drawn cells; clicks agree with drawn shapes', gaps === 0 && overlaps === 0 && wrong === 0, `${samples} samples: ${gaps} gaps, ${overlaps} overlaps, ${wrong} click mismatches`);

    // ---------- Phase 3 ----------
    for (const c of PHASE3_CELLS) {
      const row = A.find((r) => r.n === c);
      const ok = sortJoin(G.orthogonalNeighbors(c)) === sortJoin(row.o) && sortJoin(G.diagonalNeighbors(c)) === sortJoin(row.d) && sortJoin(G.leaperTargets(c)) === sortJoin(row.l);
      add(3, `Inspector output for ${c}`, ok);
    }
    for (const t of APPENDIX_B.laneLines) {
      const exp = t.expect.split(' ');
      const got = lineModeLines(t.from, exp[0]);
      add(3, `Line mode ${t.from} then ${exp[0]}`, got.some((p) => p.join(' ') === t.expect));
    }
    for (const t of [...APPENDIX_B.acrossLines, ...APPENDIX_B.diagLines]) for (const exp of t.expect) {
      const got = lineModeLines(t.from, exp[0]);
      add(3, `Line mode ${t.from} then ${exp[0]}`, got.some((p) => p.join(' ') === exp.join(' ')), got.map((p) => p.join(' ')).join(' | '));
    }

    // ---------- Phase 4 ----------
    const r7 = G.walkLine('R7', G.positionsOf('R7')[0], { dc: 0, dt: 1 });
    add(4, 'A line arriving at R8 from R7 continues to R9', r7[0] === 'R8' && r7[1] === 'R9');
    for (const L of G.LANES) {
      const p = G.walkLine(L + '1', G.positionsOf(L + '1')[0], { dc: 0, dt: 1 });
      add(4, `Lane ${L} is one loop of 22 steps`, p.length === 21, `${p.length + 1} steps`);
    }
    const allDiag = G.ALL_CELLS.every((n) => !G.linesFrom(n, G.DIAGONAL).some((path) => {
      const seq = [n, ...path];
      for (let i = 1; i < seq.length; i++) { const a = seq[i - 1], b = seq[i]; if ((a === 'Q7' && b === 'R18') || (a === 'R18' && b === 'Q7') || (a === 'Q1' && b === 'R12') || (a === 'R12' && b === 'Q1')) return true; }
      return false;
    }));
    add(4, 'No diagonal move crosses a tip (Q7 to R18 or Q1 to R12)', allDiag);
    { const s = R.emptyGame(); s.board[R.IDX.B9] = { t: 'B', c: 'w' }; s.board[R.IDX.R11] = { t: 'P', c: 'b' }; s.board[R.IDX.R7] = { t: 'P', c: 'w' };
      const t = G.sortCells([...R.Patterns.DIAG_LINE(R.IDX.B9, s.board, 'w')].map((i) => R.NAMES[i])).join(' ');
      add(4, 'DIAG_LINE stops at first occupied cell (captures enemy, not friend)', t === 'Q8 Q10 Q18 N8 N10 R11', t); }

    // ---------- Phase 5 ----------
    const pawnTests = [
      ['w', 'Q6', true, 'Q7 Q8', 'B7'], ['w', 'R3', true, 'R2 R1', 'N2'], ['w', 'B7', false, 'B8', 'N8 Q8'], ['w', 'Q8', false, 'Q9 R18', 'B9 N18'],
      ['w', 'B9', false, 'B10 Q9', 'N10 Q10 Q8'], ['w', 'R11', false, 'R12 N11', 'N10 N12'], ['w', 'Q10', false, 'Q11 B18', 'B11 N18 Q18'],
      ['w', 'B12', false, 'B13', 'N13 Q13'], ['w', 'N17', false, 'N16', 'B16 R16'], ['b', 'R14', true, 'R13 R12', 'N13'],
      ['b', 'N17', true, 'N18 Q9', 'B18 R18'], ['b', 'B9', false, 'B8 N9', 'N10 N8 Q8'], ['b', 'Q1', false, 'Q2', 'B2']];
    for (const [c, cell, first, adv, cap] of pawnTests) {
      const s = R.emptyGame(), i = R.IDX[cell];
      s.board[i] = { t: 'P', c, moved: !first };
      const a = sortJoin([...R.Patterns.RUNNER(i, s.board, c, first)].map((x) => R.NAMES[x]));
      const ca = sortJoin(R.PAWN[c][i].caps.map((x) => R.NAMES[x]));
      add(5, `${c === 'w' ? 'White' : 'Black'} pawn ${cell}${first ? ', first move' : ''}`, a === sortJoin(adv.split(' ')) && ca === sortJoin(cap.split(' ')), `advances ${a}; captures ${ca}`);
    }
    const g = R.newGame();
    const wm = R.legalMoves(g, 'w'), bm = R.legalMoves(g, 'b');
    add(5, 'White has exactly 20 legal first moves', wm.length === 20, `${wm.length}`);
    add(5, 'Black has exactly 20 legal first moves', bm.length === 20, `${bm.length}`);
    const mv = (list, from) => sortJoin(list.filter((m) => R.NAMES[m.from] === from).map((m) => R.NAMES[m.to]));
    add(5, 'Knight N4 goes to B2 or R2; knight N5 to B7 or R7', mv(wm, 'N4') === 'B2 R2' && mv(wm, 'N5') === 'B7 R7');
    add(5, 'King, queen, rooks and bishops have no first moves', ['Q4', 'Q5', 'R4', 'R5', 'B4', 'B5'].every((c) => mv(wm, c) === ''));
    { const put = (s, n, t, c) => { s.board[R.IDX[n]] = { t, c, moved: false }; };
      const sw = R.emptyGame(); put(sw, 'Q4', 'K', 'w'); put(sw, 'R4', 'R', 'w'); put(sw, 'R5', 'R', 'w'); put(sw, 'B16', 'K', 'b');
      const wc = R.legalMoves(sw, 'w').filter((m) => m.castle);
      let ok = wc.length === 1 && R.NAMES[wc[0].to] === 'N4';
      if (ok) { R.makeMove(sw, wc[0]); ok = sw.board[R.IDX.B4] && sw.board[R.IDX.B4].t === 'R' && !sw.board[R.IDX.R4] && sw.board[R.IDX.N4].t === 'K'; }
      const sb = R.emptyGame(); put(sb, 'R14', 'K', 'b'); put(sb, 'Q14', 'R', 'b'); put(sb, 'Q15', 'R', 'b'); put(sb, 'B5', 'K', 'w');
      const bc = R.legalMoves(sb, 'b').filter((m) => m.castle);
      ok = ok && bc.length === 1 && R.NAMES[bc[0].to] === 'B14';
      if (ok) { R.makeMove(sb, bc[0]); ok = sb.board[R.IDX.N14] && sb.board[R.IDX.N14].t === 'R' && !sb.board[R.IDX.Q14] && sb.board[R.IDX.B14].t === 'K'; }
      add(5, 'Castling: Q4 to N4 with R4 to B4; R14 to B14 with Q14 to N14 (queen-side rook cannot castle)', ok); }
    { const s = R.emptyGame(); s.board[R.IDX.Q4] = { t: 'K', c: 'w', moved: false }; s.board[R.IDX.R4] = { t: 'R', c: 'w', moved: false }; s.board[R.IDX.R15] = { t: 'K', c: 'b', moved: false }; s.board[R.IDX.B6] = { t: 'R', c: 'b', moved: true };
      add(5, 'No castling through an attacked cell (B4 attacked)', !R.legalMoves(s, 'w').some((m) => m.castle)); }
    { const s = R.emptyGame(); s.board[R.IDX.B14] = { t: 'P', c: 'w', moved: true }; s.board[R.IDX.Q4] = { t: 'K', c: 'w', moved: true }; s.board[R.IDX.R13] = { t: 'K', c: 'b', moved: true };
      const ms = R.legalMoves(s, 'w').filter((m) => R.NAMES[m.from] === 'B14');
      add(5, 'White pawn reaching a 15 cell promotes (Q, R, B or N)', ms.length === 4 && ms.every((m) => R.NAMES[m.to] === 'B15' && m.promo)); }
    return res;
  }

  function selfPlay(games, depth, onProgress, done) {
    let g = 0, bad = 0; const results = {};
    function one() {
      const s = R.newGame(); let res = 'move cap (300 plies)';
      for (let ply = 0; ply < 300; ply++) {
        const st = R.status(s); if (st.over) { res = st.result; break; }
        const m = AI.chooseMove(s, depth);
        const legal = st.moves.some((x) => x.from === m.from && x.to === m.to && x.promo === m.promo && !!x.castle === !!m.castle);
        const tgt = s.board[m.to];
        if (!legal || (tgt && tgt.t === 'K')) { bad++; break; }
        R.playMove(s, m);
        if (R.findKing(s, 'w') < 0 || R.findKing(s, 'b') < 0) { bad++; break; }
      }
      results[res] = (results[res] || 0) + 1;
      g++; onProgress(g);
      if (g < games) setTimeout(one, 0); else done(bad, results);
    }
    setTimeout(() => { try { one(); } catch (e) { done(-1, { error: String(e) }); } }, 0);
  }

  return { syncTests, selfPlay, lineModeLines };
})();


// ================= #test runner overlay (open the page with #test) =================
const TestRunner = (() => {
  const $ = (id) => document.getElementById(id);
  function run() {
    const panel = $('tests'); panel.hidden = false;
    const res = Tests.syncTests();
    const phases = { 1: 'Phase 1: board graph', 2: 'Phase 2: geometry and drawing', 3: 'Phase 3: neighbor and line checks', 4: 'Phase 4: movement patterns', 5: 'Phase 5: chess rules', 6: 'Phase 6: computer opponent', 7: 'Multiplayer hooks' };
    // extra checks for the multiplayer hooks (move strings and position keys)
    const g = Rules.newGame();
    const hk = [];
    hk.push({ name: 'Start position key matches the documented format', pass: positionKey(g).startsWith('w|B@B4,B@B5,K@Q4,N@N4,N@N5,P@B3,') && positionKey(g).endsWith('|WB') });
    hk.push({ name: 'Every legal first move round-trips through its move string', pass: Rules.legalMoves(g).every((m) => { const back = Rules.moveFromString(g, Rules.moveToString(m)); return back && back.from === m.from && back.to === m.to; }) });
    hk.push({ name: 'Illegal move strings are rejected', pass: Rules.moveFromString(g, 'Q4-Q9') === null && Rules.moveFromString(g, 'nonsense') === null });
    const body = $('tests-body');
    let html = '';
    for (const ph of [1, 2, 3, 4, 5]) {
      const rs = res.filter((r) => r.phase === ph), ok = rs.filter((r) => r.pass).length;
      html += `<section><h3>${phases[ph]} <span class="${ok === rs.length ? 'pass' : 'fail'}">${ok}/${rs.length} passed</span></h3><ul>` +
        rs.map((r) => `<li class="${r.pass ? 'pass' : 'fail'}"><b>${r.pass ? 'PASS' : 'FAIL'}</b> ${r.name}${r.detail && !r.pass ? `<small>${r.detail}</small>` : ''}</li>`).join('') + '</ul></section>';
    }
    const hok = hk.filter((r) => r.pass).length;
    html += `<section><h3>${phases[7]} <span class="${hok === hk.length ? 'pass' : 'fail'}">${hok}/${hk.length} passed</span></h3><ul>` +
      hk.map((r) => `<li class="${r.pass ? 'pass' : 'fail'}"><b>${r.pass ? 'PASS' : 'FAIL'}</b> ${r.name}</li>`).join('') + '</ul></section>';
    html += `<section><h3>${phases[6]}</h3><ul><li id="t6" class="pending"><b>RUNNING</b> 20 computer-vs-computer games at depth 1 <small id="t6p">0/20</small></li></ul></section>`;
    body.innerHTML = html;
    const total = res.length + hk.length, passed = res.filter((r) => r.pass).length + hok;
    $('tests-summary').textContent = `${passed} of ${total} checks passed. Running self-play\u2026`;
    Tests.selfPlay(20, 1, (n) => ($('t6p').textContent = `${n}/20`), (bad, results) => {
      const ok = bad === 0;
      const li = $('t6'); li.className = ok ? 'pass' : 'fail';
      li.innerHTML = `<b>${ok ? 'PASS' : 'FAIL'}</b> 20 games at depth 1 with no illegal move, crash, or captured king <small>${Object.entries(results).map(([k, v]) => `${v} ${k}`).join(', ')}</small>`;
      $('tests-summary').textContent = `${passed + (ok ? 1 : 0)} of ${total + 1} checks passed.`;
    });
  }
  function onHash() { if (location.hash === '#test') run(); else $('tests').hidden = true; }
  function init() {
    $('tests-close').addEventListener('click', () => { history.replaceState(null, '', location.pathname + location.search); $('tests').hidden = true; });
    window.addEventListener('hashchange', onHash);
    onHash();
  }
  return { init };
})();
