/* ═══════════════════════════════════════════════════════════════
   SEARCH — the only thing that certifies a puzzle
   ═══════════════════════════════════════════════════════════════ */
export function createSolver(R, search = "ida") {
  /* reference: breadth-first, string keys, explicit frontier.
     Kept readable on purpose — the fast search is checked against it. */
  function minPathBFS(board, blk, colorOf, d0, maxDepth, nodeCap) {
    if (R.isCleared(board)) return [];
    if (maxDepth < 1) return null;
    const seen = new Set([R.keyOf(board, colorOf, d0)]);
    let frontier = [{ b: board, d: d0, prev: null, mv: -1 }], nodes = 1;
    for (let depth = 1; depth <= maxDepth; depth++) {
      const next = [];
      for (const node of frontier) for (let nd = 0; nd < 6; nd++) {
        if (nd === node.d) continue;
        const nb = R.clone(node.b);
        R.settle(nb, blk, colorOf, nd);
        if (R.isCleared(nb)) {
          const path = [nd]; let p = node;
          while (p && p.mv >= 0) { path.unshift(p.mv); p = p.prev; }
          return path;
        }
        const k = R.keyOf(nb, colorOf, nd); if (seen.has(k)) continue; seen.add(k);
        if (++nodes > nodeCap) return null;
        next.push({ b: nb, d: nd, prev: node, mv: nd });
      }
      frontier = next; if (!frontier.length) break;
    }
    return null;
  }

  /* iterative deepening: same answer, O(depth) memory, no allocation */
  function minPathIDA(board, blk, colorOf, d0, maxDepth, nodeCap) {
    if (R.isCleared(board)) return [];
    if (maxDepth < 1) return null;
    const tt = new Map();
    const path = [];
    const pool = [];
    for (let i = 0; i <= maxDepth + 1; i++) pool.push(R.empty());
    let nodes = 0, capped = false;
    function dfs(b, d, left, depth) {
      if (left === 0) return false;
      const k = R.hashOf(b, colorOf, d);
      const seen = tt.get(k);
      if (seen !== undefined && seen >= left) return false;
      tt.set(k, left);
      const nb = pool[depth + 1];
      for (let nd = 0; nd < 6; nd++) {
        if (nd === d) continue;
        if (++nodes > nodeCap) { capped = true; return false; }
        nb.set(b);
        R.settle(nb, blk, colorOf, nd);
        path.push(nd);
        if (R.isCleared(nb) || dfs(nb, nd, left - 1, depth + 1)) return true;
        path.pop();
      }
      return false;
    }
    for (let lim = 1; lim <= maxDepth; lim++) {
      tt.clear(); path.length = 0; nodes = 0; capped = false;
      if (dfs(board, d0, lim, 0)) return path.slice();
      if (capped) return null;
    }
    return null;
  }

  const minPath = search === "bfs" ? minPathBFS : minPathIDA;

  /* replay a path on the finished board — the existence proof */
  function verifyPath(board, blk, colorOf, d0, path) {
    if (!path.length) return false;
    if (R.hasMatch(board, colorOf)) return false;
    const b = R.clone(board);
    let d = d0;
    for (const nd of path) {
      if (nd === d) return false;
      R.settle(b, blk, colorOf, nd);
      d = nd;
    }
    return R.isCleared(b);
  }

  const KIND = { CLEAR: "clear", NOOP: "noop", REVERSIBLE: "reversible", LOSSY: "lossy" };
  function classify(board, blk, colorOf, d0) {
    const out = [];
    for (let nd = 0; nd < 6; nd++) {
      if (nd === d0) continue;
      const b1 = R.clone(board);
      R.fall(b1, blk, nd);
      const moved = !R.equal(b1, board);
      const rounds = R.settle(b1, blk, colorOf, nd);
      let kind;
      if (rounds > 0) kind = KIND.CLEAR;
      else if (!moved) kind = KIND.NOOP;
      else {
        const b2 = R.clone(b1);
        kind = R.settle(b2, blk, colorOf, d0) === 0 && R.equal(b2, board) ? KIND.REVERSIBLE : KIND.LOSSY;
      }
      out.push({ dir: nd, kind });
    }
    return out;
  }

  /* clearing moves that are not on any optimal path */
  function decoyCount(board, blk, colorOf, d0, best, nodeCap) {
    let n = 0;
    for (let nd = 0; nd < 6; nd++) {
      if (nd === d0) continue;
      const nb = R.clone(board);
      if (R.settle(nb, blk, colorOf, nd) === 0) continue;
      if (R.isCleared(nb)) continue;
      if (!minPath(nb, blk, colorOf, nd, best - 1, nodeCap)) n++;
    }
    return n;
  }

  return { minPath, minPathBFS, minPathIDA, verifyPath, classify, decoyCount, KIND };
}
