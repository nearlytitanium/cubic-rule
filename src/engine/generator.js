import { TUNING } from "./tuning.js";
import { shuffle, mulberry } from "./rng.js";
import { EMPTY, DIRS, flipOf } from "./rules.js";
import { REASON, certify } from "./certify.js";

/* ═══════════════════════════════════════════════════════════════
   GENERATOR — a proposer. Nothing it produces is trusted until
   `certify` agrees. Each backward step is one named operation.
   ═══════════════════════════════════════════════════════════════ */
export const STEP = { REARRANGE: 0, CLEAR: 1, TWIN: 2, CHAIN: 3 };

export function createGenerator(R, solver, tuning = TUNING) {
  /* put one group back, lifting whatever was sitting on top of it */
  function unclear({ board, blk, state, d, colour, rng }) {
    const { ax, sg } = DIRS[d];
    const shape = R.shapes[(rng() * R.shapes.length) | 0];
    const ox = (rng() * (R.N - 1)) | 0, oy = (rng() * (R.N - 1)) | 0, oz = (rng() * (R.N - 1)) | 0;
    const cells = shape.map(([a, b, c]) => [ox + a, oy + b, oz + c]);
    if (cells.some(([x, y, z]) => x >= R.N || y >= R.N || z >= R.N)) return null;
    const gcells = cells.map(([x, y, z]) => R.id(x, y, z));
    if (gcells.some((i) => blk[i])) return null;
    const gset = new Set(gcells);

    const out = R.empty();
    const ids = [];
    for (const i of gcells) { const bid = state.nextId++; out[i] = bid; state.colorOf[bid] = colour; ids.push(bid); }

    for (let a = 0; a < R.N; a++) for (let c = 0; c < R.N; c++) {
      let cnt = 0, anchor = -1;
      for (let p = 0; p < R.N; p++) if (gset.has(R.cellOn(ax, a, c, p))) {
        cnt++;
        anchor = anchor < 0 ? p : (sg < 0 ? Math.min(anchor, p) : Math.max(anchor, p));
      }
      for (let p = 0; p < R.N; p++) {
        const i = R.cellOn(ax, a, c, p), v = board[i];
        if (v < 0) continue;
        let np = p;
        if (cnt && (sg < 0 ? p >= anchor : p <= anchor)) np = sg < 0 ? p + cnt : p - cnt;
        if (np < 0 || np >= R.N) return null;
        for (let q = Math.min(p, np); q <= Math.max(p, np); q++) if (blk[R.cellOn(ax, a, c, q)]) return null;
        const j = R.cellOn(ax, a, c, np);
        if (out[j] >= 0) return null;
        out[j] = v;
      }
    }
    return { board: out, ids };
  }

  /* A. the board as it looked at the instant this move resolved */
  function proposeResolved(st, kind, colours, blk, rng) {
    if (kind === STEP.REARRANGE) {
      const board = R.clone(st.board);
      const targets = [];
      for (let i = 0; i < R.S; i++) if (board[i] >= 0) targets.push(board[i]);
      return targets.length ? { board, targets } : null;
    }
    const first = unclear({ board: st.board, blk, state: st, d: st.d, colour: colours[0], rng });
    if (!first) return null;
    if (kind === STEP.CLEAR) return { board: first.board, targets: first.ids };
    const second = unclear({ board: first.board, blk, state: st, d: st.d, colour: colours[1], rng });
    if (!second) return null;
    return { board: second.board, targets: first.ids.concat(second.ids) };
  }

  /* B. prop up anything left floating; mutates blk, returns how many added */
  function addSupports(board, blk, d, budget) {
    const off = R.offset(d);
    let added = 0;
    for (let i = 0; i < R.S; i++) {
      if (board[i] < 0) continue;
      const below = R.neighbour(i, off);
      if (below < 0 || board[below] >= 0 || blk[below]) continue;
      if (added >= budget) return -1;
      blk[below] = 1; added++;
    }
    return added;
  }

  /* C. incoming directions, cheapest in new supports first */
  function rankIncoming(board, blk, d, rng) {
    const cand = [];
    for (let e = 0; e < 6; e++) {
      if (e === d) continue;
      const off = R.offset(e);
      let need = 0;
      for (let i = 0; i < R.S; i++) {
        if (board[i] < 0) continue;
        const u = R.neighbour(i, off);
        if (u >= 0 && board[u] < 0 && !blk[u]) need++;
      }
      cand.push([e, need + rng()]);
    }
    cand.sort((p, q) => p[1] - q[1]);
    return cand.map(([e]) => e);
  }

  /* D. lift a few blocks so the previous state differs, then make it
        stable under e. Landing spots that already have support are
        preferred, since they need no new blocker. */
  function proposePrevious(board, blk, targets, d, e, kind, rng, budget) {
    const prev = R.clone(board);
    const up = R.offset(flipOf(d));
    const supportOff = R.offset(e);
    const pool = shuffle(targets.slice(), rng);
    const liftBudget = 1 + ((rng() * (kind === STEP.REARRANGE ? tuning.liftBudget.rearrange : tuning.liftBudget.clear)) | 0);
    const posOf = new Map();
    for (let i = 0; i < R.S; i++) if (prev[i] >= 0) posOf.set(prev[i], i);

    let lifted = 0;
    for (const bid of pool) {
      if (lifted >= liftBudget) break;
      if (rng() < tuning.liftChance) continue;
      const from = posOf.get(bid);
      const stops = [];
      let cur = from;
      for (let t = 0; t < 2; t++) {
        const nxt = R.neighbour(cur, up);
        if (nxt < 0 || blk[nxt] || prev[nxt] >= 0) break;
        stops.push(nxt); cur = nxt;
      }
      if (!stops.length) continue;
      let pick = stops[0], best = -1;
      for (const s of stops) {
        const u = R.neighbour(s, supportOff);
        const score = (u < 0 || blk[u] || prev[u] >= 0) ? 1 : 0;
        if (score > best) { best = score; pick = s; }
      }
      prev[pick] = prev[from]; prev[from] = EMPTY;
      lifted++;
    }
    if (!lifted) return null;
    const added = addSupports(prev, blk, e, budget);
    if (added < 0) return null;
    return { board: prev, added };
  }

  /* one backward step: propose, then prove it forwards */
  function backwardStep(st, kind, colours, rng, maxBlockers) {
    for (let attempt = 0; attempt < tuning.stepTries; attempt++) {
      const blk = Uint8Array.from(st.blk);
      const resolved = proposeResolved(st, kind, colours, blk, rng);
      if (!resolved) continue;

      let budget = maxBlockers - st.blockerCount;
      const addedD = kind === STEP.REARRANGE ? 0 : addSupports(resolved.board, blk, st.d, budget);
      if (addedD < 0 || !R.isStable(resolved.board, blk, st.d)) continue;
      budget -= addedD;

      /* the move must resolve to exactly the state we came from */
      const check = R.clone(resolved.board);
      const rounds = R.settle(check, blk, st.colorOf, st.d);
      if (!R.equal(check, st.board)) continue;
      if (kind === STEP.TWIN && rounds !== 1) continue;    /* both at once */
      if (kind === STEP.CHAIN && rounds < 2) continue;     /* one sets the other off */

      for (const e of rankIncoming(resolved.board, blk, st.d, rng)) {
        const blk2 = Uint8Array.from(blk);
        const prev = proposePrevious(resolved.board, blk2, resolved.targets, st.d, e, kind, rng, budget);
        if (!prev) continue;
        if (R.hasMatch(prev.board, st.colorOf) || !R.isStable(prev.board, blk2, e)) continue;

        /* this step alone: falling and clearing must land back on the
           state this step was built from */
        const fwd = R.clone(prev.board);
        R.settle(fwd, blk2, st.colorOf, st.d);
        if (!R.equal(fwd, st.board)) continue;

        /* and the whole path so far — blockers added now can invalidate
           steps verified earlier, so it is re-checked every time */
        if (!solver.verifyPath(prev.board, blk2, st.colorOf, e, [st.d, ...st.solution])) continue;

        st.board = prev.board;
        st.blk = blk2;
        st.blockerCount += addedD + prev.added;
        st.solution.unshift(st.d);
        st.d = e;
        return true;
      }
    }
    return false;
  }

  /* which kinds of move this puzzle is built from, in backward order */
  function makePlan(nGroups, want, canPair, rng) {
    const roll = rng();
    const special = canPair
      ? (roll < tuning.specialOdds.twin ? STEP.TWIN : roll < tuning.specialOdds.chain ? STEP.CHAIN : 0)
      : 0;
    const clearMoves = nGroups - (special ? 1 : 0);
    const total = Math.max(clearMoves, want);
    const plan = [];
    if (special) plan.push(special);
    for (let i = 0; i < clearMoves - (special ? 1 : 0); i++) plan.push(STEP.CLEAR);
    for (let i = 0; i < total - clearMoves; i++) plan.push(STEP.REARRANGE);
    shuffle(plan, rng);
    /* step 0 is the final forward move, so it has to clear something */
    if (plan[0] === STEP.REARRANGE) {
      const k = plan.findIndex((v) => v !== STEP.REARRANGE);
      [plan[0], plan[k]] = [plan[k], plan[0]];
    }
    return { plan, special, total };
  }

  /* the flip is an involution, so its predecessor always exists and costs
     no blockers. Only the outermost step can use it: anywhere further in,
     later blockers invalidate it, and two in a row cancel out. */
  function tryFreeFlip(cand, minMoves, nodeCap) {
    const { board, blk, colorOf, dir, path } = cand;
    const fd = flipOf(dir);
    const flipped = R.clone(board);
    R.fall(flipped, blk, fd);
    if (R.equal(flipped, board) || R.hasMatch(flipped, colorOf)) return cand;
    const longer = [dir, ...path];
    if (!solver.verifyPath(flipped, blk, colorOf, fd, longer)) return cand;
    const best = solver.minPath(flipped, blk, colorOf, fd, longer.length, nodeCap);
    if (!best || best.length < minMoves) return cand;
    return { board: flipped, blk, colorOf, dir: fd, path: best };
  }

  /* deterministic: same seed and options → same puzzle.
     Returns { puzzle, reason } — every rejection is named. */
  function generate(opts, rng) {
    const { colors, moves, maxBlockers, nodeCap = tuning.nodeCap } = opts;
    const groupsPerColor = 8 / R.GROUP_SIZE;
    const bag = [];
    for (let c = 1; c <= colors; c++) for (let k = 0; k < groupsPerColor; k++) bag.push(c);
    shuffle(bag, rng);
    const nGroups = bag.length;

    const { plan, special, total } = makePlan(nGroups, moves, colors >= 2 && nGroups >= 2, rng);
    const needDecoy = rng() < tuning.decoyOdds;

    const st = {
      board: R.empty(), blk: new Uint8Array(R.S), colorOf: [], nextId: 0,
      blockerCount: 0, d: (rng() * 6) | 0, solution: [],
    };
    const take = (n) => {
      if (!bag.length) return null;
      const i = (rng() * bag.length) | 0, first = bag[i];
      if (n === 1) { bag.splice(i, 1); return [first]; }
      const j = bag.findIndex((c, q) => q !== i && c !== first);
      if (j < 0) return null;
      const second = bag[j];
      bag.splice(Math.max(i, j), 1); bag.splice(Math.min(i, j), 1);
      return [first, second];
    };

    for (const kind of plan) {
      const needsColour = kind !== STEP.REARRANGE;
      const cols = needsColour ? take(kind >= STEP.TWIN ? 2 : 1) : [];
      if (needsColour && !cols) return { reason: REASON.NO_COLOURS };
      if (!backwardStep(st, kind, cols, rng, maxBlockers)) return { reason: REASON.CONSTRUCTION };
    }

    let cand = { board: st.board, blk: st.blk, colorOf: st.colorOf, dir: st.d, path: st.solution };
    cand = tryFreeFlip(cand, total, nodeCap);
    const verdict = certify(R, solver, cand, { minMoves: total, needDecoy, nodeCap });
    if (verdict.reason !== REASON.OK) return { reason: verdict.reason };

    return {
      reason: REASON.OK,
      puzzle: {
        board: cand.board, blk: cand.blk, colorOf: cand.colorOf, dir: cand.dir,
        solution: verdict.solution, decoys: verdict.decoys, special,
        blockers: st.blockerCount, moves: verdict.solution.length,
      },
    };
  }

  /* try seeds until one produces a puzzle; returns the tally of reasons */
  function search({ opts, base, budget, stride = tuning.seedStride }) {
    const tally = {};
    for (let k = 0; k < budget; k++) {
      const seed = (base + k * stride) | 0;
      const { puzzle, reason } = generate(opts, mulberry(seed));
      tally[reason] = (tally[reason] || 0) + 1;
      if (puzzle) return { puzzle, seed, tries: k + 1, tally };
    }
    return { puzzle: null, tries: budget, tally };
  }

  return { generate, search };
}
