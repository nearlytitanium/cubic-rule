/* Generation runs off the main thread. The bundler builds this as its
   own module, so it shares the engine source with the page. */
import { createRules } from "./rules.js";
import { createSolver } from "./solver.js";
import { createGenerator } from "./generator.js";

self.onmessage = (e) => {
  const { size, mode, opts, base, budget, id } = e.data;
  const R = createRules(size, mode);
  const solver = createSolver(R);
  const gen = createGenerator(R, solver);
  const r = gen.search({ opts, base, budget });
  if (!r.puzzle) { self.postMessage({ id, ok: false, tally: r.tally, tries: r.tries }); return; }
  const p = r.puzzle;
  self.postMessage({ id, ok: true, seed: r.seed, tries: r.tries, tally: r.tally,
    board: p.board, blk: p.blk, colorOf: p.colorOf, dir: p.dir,
    solution: p.solution, decoys: p.decoys, special: p.special, blockers: p.blockers });
};
