import { useEffect, useRef, useCallback } from "react";
import { TUNING } from "../engine/tuning.js";
import { mulberry } from "../engine/rng.js";

/* if the worker cannot start we fall back to running inline */
function makeWorker() {
  try {
    return new Worker(new URL("../engine/worker.js", import.meta.url), { type: "module" });
  } catch (err) {
    console.warn("worker unavailable, generating inline", err);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   usePuzzleSource — asks the worker for a puzzle, falls back to the
   main thread. Knows nothing about rendering.
   ═══════════════════════════════════════════════════════════════ */
export function usePuzzleSource(engineRef) {
  const workerRef = useRef(null);
  const jobRef = useRef(0);
  useEffect(() => () => { workerRef.current?.terminate(); workerRef.current = null; }, []);

  return useCallback(({ size, mode, opts, onDone, onFail }) => {
    const base = (Math.random() * 1e9) | 0;
    const w = workerRef.current || (workerRef.current = makeWorker());
    if (w) {
      const id = ++jobRef.current;
      w.onmessage = (e) => {
        if (e.data.id !== id) return;
        if (!e.data.ok) { onFail(e.data.tally); return; }
        onDone({
          board: Int16Array.from(e.data.board), blk: Uint8Array.from(e.data.blk),
          colorOf: e.data.colorOf, dir: e.data.dir, solution: e.data.solution,
          decoys: e.data.decoys, special: e.data.special, blockers: e.data.blockers,
        }, e.data.seed, e.data.tries);
      };
      w.onerror = () => { workerRef.current = null; onFail(null); };
      w.postMessage({ size, mode, opts, base, budget: TUNING.seedBudget, id });
      return;
    }
    const { gen } = engineRef.current;
    let k = 0;
    const attempt = () => {
      const t1 = performance.now();
      while (performance.now() - t1 < 50) {
        const seed = (base + k * TUNING.seedStride) | 0;
        const { puzzle } = gen.generate(opts, mulberry(seed));
        k++;
        if (puzzle) { onDone(puzzle, seed, k); return; }
        if (k > TUNING.seedBudget) { onFail(null); return; }
      }
      requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  }, [engineRef]);
}
