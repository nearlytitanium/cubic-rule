import { TUNING } from "./tuning.js";
import { mulberry } from "./rng.js";
import { createRules, flipOf } from "./rules.js";
import { createSolver } from "./solver.js";
import { REASON } from "./certify.js";
import { createGenerator } from "./generator.js";

/* ═══════════════════════════════════════════════════════════════
   PROPERTY TESTS — cheap invariants, run once at start-up
   ═══════════════════════════════════════════════════════════════ */
export function runSelfTest() {
  const fails = [];
  const check = (name, ok) => { if (!ok) fails.push(name); };

  for (const [N, mode] of [[4, "222"], [5, "222"], [4, "221"]]) {
    const R = createRules(N, mode);
    const solver = createSolver(R);
    const gen = createGenerator(R, solver);
    const rng = mulberry(12345 + N);

    const blk = new Uint8Array(R.S);
    for (let t = 0; t < 6; t++) if (rng() < 0.8) blk[(rng() * R.S) | 0] = 1;
    const colorOf = [];
    const b = R.empty();
    let nid = 0;
    for (let i = 0; i < R.S; i++) if (!blk[i] && rng() < 0.18) { b[i] = nid; colorOf[nid++] = 1 + ((rng() * 4) | 0); }
    const before = R.clone(b);
    const blkBefore = Uint8Array.from(blk);

    const f1 = R.clone(b); R.fall(f1, blk, 0);
    const f2 = R.clone(f1); R.fall(f2, blk, 0);
    check("fall idempotent", R.equal(f1, f2));

    const s1 = R.clone(b); R.settle(s1, blk, colorOf, 0);
    const s2 = R.clone(s1); const extra = R.settle(s2, blk, colorOf, 0);
    check("settle idempotent", R.equal(s1, s2) && extra === 0);

    const inv = R.clone(s1);
    const r1 = R.settle(inv, blk, colorOf, flipOf(0));
    const r2 = R.settle(inv, blk, colorOf, 0);
    check("flip is an involution", r1 > 0 || r2 > 0 || R.equal(inv, s1));

    check("blocks do not increase", R.count(s1) <= R.count(before));
    check("blockers immutable", blk.every((v, i) => v === blkBefore[i]));

    for (let t = 0; t < 6; t++) {
      const d0 = (rng() * 6) | 0;
      const a = solver.minPathBFS(s1, blk, colorOf, d0, 3, 40000);
      const c = solver.minPathIDA(s1, blk, colorOf, d0, 3, 40000);
      check("fast search matches reference", (a ? a.length : -1) === (c ? c.length : -1));
    }

    const opts = { colors: 2, moves: 3, maxBlockers: Math.round(R.S * TUNING.blockerRatio), nodeCap: 60000 };
    const found = gen.search({ opts, base: 999 + N, budget: 400 });
    check("generator produces puzzles", !!found.puzzle);
    check("every rejection has a reason", Object.keys(found.tally).every((r) => Object.values(REASON).includes(r)));
    if (found.puzzle) {
      const p = found.puzzle;
      check("solution verifies", solver.verifyPath(p.board, p.blk, p.colorOf, p.dir, p.solution));
      check("no shorter solution", !solver.minPath(p.board, p.blk, p.colorOf, p.dir, p.solution.length - 1, 60000));
      const ref = solver.minPathBFS(p.board, p.blk, p.colorOf, p.dir, p.solution.length, 200000);
      check("reference agrees on length", !!ref && ref.length === p.solution.length);
      /* same seed, same puzzle */
      const again = gen.generate(opts, mulberry(found.seed));
      check("generation is deterministic",
        !!again.puzzle && R.equal(again.puzzle.board, p.board)
        && again.puzzle.solution.join() === p.solution.join());
    }
  }

  return fails;
}
