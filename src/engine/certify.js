/* ═══════════════════════════════════════════════════════════════
   THE CONTRACT — the single place that decides whether a candidate
   is a puzzle. Every rejection carries a reason.
   ═══════════════════════════════════════════════════════════════ */
export const REASON = {
  OK: "ok",
  NO_COLOURS: "colours-exhausted",
  CONSTRUCTION: "construction-failed",
  UNVERIFIED: "path-does-not-clear",
  TOO_SHORT: "solvable-in-fewer-moves",
  NO_DECOY: "no-decoy-present",
};

export function certify(R, solver, cand, { minMoves, needDecoy, nodeCap }) {
  const { board, blk, colorOf, dir, path } = cand;
  if (!solver.verifyPath(board, blk, colorOf, dir, path)) return { reason: REASON.UNVERIFIED };
  /* the constructed length is only an upper bound */
  const best = solver.minPath(board, blk, colorOf, dir, path.length, nodeCap);
  if (!best) return { reason: REASON.UNVERIFIED };
  if (best.length < minMoves) return { reason: REASON.TOO_SHORT, best: best.length };
  const decoys = solver.decoyCount(board, blk, colorOf, dir, best.length, nodeCap);
  if (needDecoy && decoys === 0) return { reason: REASON.NO_DECOY };
  return { reason: REASON.OK, solution: best, decoys };
}
