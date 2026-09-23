import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════
   TUNING — every number that was found by experiment lives here.
   ═══════════════════════════════════════════════════════════════ */
const TUNING = {
  blockerRatio: 0.32,     /* share of cells that may become blocked */
  nodeCap: 200000,        /* search nodes before giving up on a position */
  stepTries: 400,         /* attempts per backward step */
  liftChance: 0.4,        /* chance of skipping a candidate block when lifting */
  liftBudget: { clear: 3, rearrange: 2 },
  specialOdds: { twin: 0.3, chain: 0.6 },   /* cumulative thresholds */
  decoyOdds: 0.5,         /* chance a puzzle is required to contain a decoy */
  seedStride: 7919,
  seedBudget: 4000,       /* seeds tried per puzzle request */
};

/* ═══════════════════════════════════════════════════════════════
   CORE RULES
   One board representation: Int16Array of block ids, EMPTY = -1.
   Blocked cells live in a separate immutable mask and never appear
   in the board, so no sentinel can leak into a colour lookup.
   ═══════════════════════════════════════════════════════════════ */
const EMPTY = -1;
const DIRS = [
  { ax: 1, sg: -1, label: "Y−" }, { ax: 1, sg: 1, label: "Y+" },
  { ax: 0, sg: -1, label: "X−" }, { ax: 0, sg: 1, label: "X+" },
  { ax: 2, sg: -1, label: "Z−" }, { ax: 2, sg: 1, label: "Z+" },
];
const flipOf = (d) => DIRS.findIndex((x) => x.ax === DIRS[d].ax && x.sg === -DIRS[d].sg);

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function mulberry(seed) {
  let a = seed | 0;
  return function () {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function createRules(N, mode) {
  const S = N * N * N;
  const id = (x, y, z) => x + y * N + z * N * N;
  const coord = (i) => [i % N, ((i / N) | 0) % N, (i / (N * N)) | 0];
  const cellOn = (ax, a, c, p) => (ax === 0 ? id(p, a, c) : ax === 1 ? id(a, p, c) : id(a, c, p));
  const offset = (d) => { const o = [0, 0, 0]; o[DIRS[d].ax] = DIRS[d].sg; return o; };
  const neighbour = (i, o) => {
    const [x, y, z] = coord(i);
    const nx = x + o[0], ny = y + o[1], nz = z + o[2];
    if (nx < 0 || ny < 0 || nz < 0 || nx >= N || ny >= N || nz >= N) return -1;
    return id(nx, ny, nz);
  };

  const groups = [];
  if (mode === "222") {
    for (let x = 0; x < N - 1; x++) for (let y = 0; y < N - 1; y++) for (let z = 0; z < N - 1; z++) {
      const g = [];
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) g.push(id(x + a, y + b, z + c));
      groups.push(g);
    }
  } else {
    for (let x = 0; x < N - 1; x++) for (let y = 0; y < N - 1; y++) for (let z = 0; z < N; z++)
      groups.push([id(x, y, z), id(x + 1, y, z), id(x, y + 1, z), id(x + 1, y + 1, z)]);
    for (let x = 0; x < N - 1; x++) for (let y = 0; y < N; y++) for (let z = 0; z < N - 1; z++)
      groups.push([id(x, y, z), id(x + 1, y, z), id(x, y, z + 1), id(x + 1, y, z + 1)]);
    for (let x = 0; x < N; x++) for (let y = 0; y < N - 1; y++) for (let z = 0; z < N - 1; z++)
      groups.push([id(x, y, z), id(x, y + 1, z), id(x, y, z + 1), id(x, y + 1, z + 1)]);
  }
  const GROUP_SIZE = mode === "222" ? 8 : 4;
  const shapes = mode === "222"
    ? [(() => { const s = []; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) s.push([a, b, c]); return s; })()]
    : [[[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]],
       [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]],
       [[0, 0, 0], [0, 1, 0], [0, 0, 1], [0, 1, 1]]];

  const empty = () => new Int16Array(S).fill(EMPTY);
  const clone = (b) => Int16Array.from(b);
  const equal = (a, b) => { for (let i = 0; i < S; i++) if (a[i] !== b[i]) return false; return true; };
  const isCleared = (b) => { for (let i = 0; i < S; i++) if (b[i] >= 0) return false; return true; };
  const count = (b) => { let n = 0; for (let i = 0; i < S; i++) if (b[i] >= 0) n++; return n; };

  /* cell order along each axis, precomputed: lineIdx[ax][line * N + p] */
  const lineIdx = [0, 1, 2].map((ax) => {
    const arr = new Int16Array(S);
    let k = 0;
    for (let a = 0; a < N; a++) for (let c = 0; c < N; c++) for (let p = 0; p < N; p++) arr[k++] = cellOn(ax, a, c, p);
    return arr;
  });
  const lineBuf = new Int16Array(N), segBuf = new Int16Array(N);

  /* blocks slide to the wall; blocked cells cut each line into segments */
  function fall(b, blk, d) {
    const ax = DIRS[d].ax, sg = DIRS[d].sg;
    const idx = lineIdx[ax];
    for (let l = 0, base = 0; l < N * N; l++, base += N) {
      let len = 0;
      for (let p = 0; p <= N; p++) {
        const i = p < N ? idx[base + p] : -1;
        if (p === N || blk[i]) {
          if (len) {
            let k = 0;
            for (let q = 0; q < len; q++) { const v = b[segBuf[q]]; if (v >= 0) lineBuf[k++] = v; }
            for (let q = 0; q < len; q++) b[segBuf[q]] = EMPTY;
            for (let q = 0; q < k; q++) b[sg < 0 ? segBuf[q] : segBuf[len - k + q]] = lineBuf[q];
          }
          len = 0;
        } else segBuf[len++] = i;
      }
    }
  }

  /* shared scratch — the mask is valid only until the next call. Most
     positions match nothing, so it is only cleared once one is found. */
  const scratch = new Uint8Array(S);
  const matches = (b, colorOf, g) => {
    const first = b[g[0]]; if (first < 0) return false;
    const col = colorOf[first];
    for (let i = 1; i < g.length; i++) { const v = b[g[i]]; if (v < 0 || colorOf[v] !== col) return false; }
    return true;
  };
  function matchMask(b, colorOf) {
    let from = -1;
    for (let gi = 0; gi < groups.length; gi++) if (matches(b, colorOf, groups[gi])) { from = gi; break; }
    if (from < 0) return null;
    const m = scratch; m.fill(0);
    for (let gi = from; gi < groups.length; gi++) {
      const g = groups[gi];
      if (gi === from || matches(b, colorOf, g)) for (const i of g) m[i] = 1;
    }
    return m;
  }
  const hasMatch = (b, colorOf) => !!matchMask(b, colorOf);

  /* one move: fall, then clear and fall until nothing matches.
     `frames` (optional) records every intermediate board for animation. */
  function settle(b, blk, colorOf, d, frames) {
    fall(b, blk, d);
    if (frames) frames.push({ board: clone(b), cleared: null });
    let rounds = 0;
    for (let guard = 0; guard < S; guard++) {
      const m = matchMask(b, colorOf); if (!m) break;
      rounds++;
      const cleared = [];
      for (let i = 0; i < S; i++) if (m[i] && b[i] >= 0) { cleared.push(b[i]); b[i] = EMPTY; }
      if (frames) frames.push({ board: clone(b), cleared });
      fall(b, blk, d);
      if (frames) frames.push({ board: clone(b), cleared: null });
    }
    return rounds;
  }
  const isStable = (b, blk, d) => { const t = clone(b); fall(t, blk, d); return equal(t, b); };

  /* search identity: colours and gravity, not block identity.
     keyOf is the readable reference; hashOf is the same identity as a
     53-bit number, so collisions are negligible at our node counts. */
  function keyOf(b, colorOf, d) {
    let s = String.fromCharCode(d + 1);
    for (let i = 0; i < S; i++) s += String.fromCharCode(b[i] < 0 ? 0 : colorOf[b[i]]);
    return s;
  }
  function hashOf(b, colorOf, d) {
    let h1 = 2166136261 ^ (d + 1), h2 = 5381 + d;
    for (let i = 0; i < S; i++) {
      const c = b[i] < 0 ? 0 : colorOf[b[i]];
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = (Math.imul(h2, 33) + c) | 0;
    }
    return (h1 >>> 0) * 2097152 + (h2 >>> 11);
  }

  return {
    N, S, mode, id, coord, cellOn, offset, neighbour, groups, GROUP_SIZE, shapes,
    empty, clone, equal, isCleared, count, fall, matchMask, hasMatch, settle, isStable, keyOf, hashOf,
  };
}

/* ═══════════════════════════════════════════════════════════════
   SEARCH — the only thing that certifies a puzzle
   ═══════════════════════════════════════════════════════════════ */
function createSolver(R, search = "ida") {
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

/* ═══════════════════════════════════════════════════════════════
   THE CONTRACT — the single place that decides whether a candidate
   is a puzzle. Every rejection carries a reason.
   ═══════════════════════════════════════════════════════════════ */
const REASON = {
  OK: "ok",
  NO_COLOURS: "colours-exhausted",
  CONSTRUCTION: "construction-failed",
  UNVERIFIED: "path-does-not-clear",
  TOO_SHORT: "solvable-in-fewer-moves",
  NO_DECOY: "no-decoy-present",
};

function certify(R, solver, cand, { minMoves, needDecoy, nodeCap }) {
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

/* ═══════════════════════════════════════════════════════════════
   GENERATOR — a proposer. Nothing it produces is trusted until
   `certify` agrees. Each backward step is one named operation.
   ═══════════════════════════════════════════════════════════════ */
const STEP = { REARRANGE: 0, CLEAR: 1, TWIN: 2, CHAIN: 3 };

function createGenerator(R, solver, tuning = TUNING) {
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

/* ═══════════════════════════════════════════════════════════════
   PROPERTY TESTS — cheap invariants, run once at start-up
   ═══════════════════════════════════════════════════════════════ */
function runSelfTest() {
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

  /* the worker script must stand on its own */
  try {
    const src = buildWorkerSource().replace(/self\.onmessage[\s\S]*$/, "return { createRules, createSolver, createGenerator, mulberry };");
    // eslint-disable-next-line no-new-func
    const api = new Function(src)();
    const R = api.createRules(4, "222");
    const solver = api.createSolver(R);
    const g = api.createGenerator(R, solver);
    const r = g.search({ opts: { colors: 1, moves: 2, maxBlockers: 16, nodeCap: 40000 }, base: 7, budget: 200 });
    check("worker source is self-contained", !!r.puzzle);
  } catch (err) {
    fails.push("worker source is self-contained");
  }

  return fails;
}

/* ═══════════════════════════════════════════════════════════════
   WORKER — the engine functions are self-contained, so the worker
   script is assembled from their source. Generation runs off the main
   thread; if the worker cannot start we fall back to running inline.
   ═══════════════════════════════════════════════════════════════ */
function buildWorkerSource() {
  return [
    "const EMPTY = " + EMPTY + ";",
    "const DIRS = " + JSON.stringify(DIRS) + ";",
    "const TUNING = " + JSON.stringify(TUNING) + ";",
    "const STEP = " + JSON.stringify(STEP) + ";",
    "const REASON = " + JSON.stringify(REASON) + ";",
    "const flipOf = " + flipOf.toString() + ";",
    shuffle.toString(),
    mulberry.toString(),
    createRules.toString(),
    createSolver.toString(),
    certify.toString(),
    createGenerator.toString(),
    `self.onmessage = (e) => {
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
    };`,
  ].join("\n");
}

let workerURL = null;
function makeWorker() {
  try {
    if (!workerURL) workerURL = URL.createObjectURL(new Blob([buildWorkerSource()], { type: "text/javascript" }));
    return new Worker(workerURL);
  } catch (err) {
    console.warn("worker unavailable, generating inline", err);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   VIEW — presentation constants
   ═══════════════════════════════════════════════════════════════ */
const PAPER = "#E7ECEF", CARD = "#F5F8FA", INK = "#132133", MUTE = "#6B7B8C", RULE = "#B9C4CC", ACCENT = "#C8102E";
const HEX = [0xC8102E, 0x0E7C8C, 0xE0A02E, 0x5B4B8A];
const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const SP = 1.06;
/* gesture feel: the cube follows the finger, resists past a quarter turn,
   and either completes or springs back on release */
const GESTURE = {
  deadzone: 8,      /* px before an axis is chosen */
  quarter: 96,      /* px of drag that equals a 90° turn */
  commit: 42,       /* px past which the turn completes on release */
  resist: 0.22,     /* how much of the drag still registers past 90° */
  overshoot: 1.12,  /* hard stop for the preview, in quarter turns */
};

/* ── small presentational pieces (defined once, not per render) ── */
function Btn({ children, onClick, primary, disabled, glow, tall }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`text-xs ${tall ? "py-3" : "py-2"} px-2`}
      style={{
        ...mono,
        border: `1px solid ${glow || primary ? ACCENT : RULE}`,
        background: glow ? "rgba(200,16,46,0.12)" : primary ? ACCENT : "transparent",
        color: primary ? "#fff" : glow ? ACCENT : disabled ? RULE : INK,
        boxShadow: glow ? "0 0 0 2px rgba(200,16,46,0.25)" : "none",
      }}>{children}</button>
  );
}

function Pick({ label, value, options, onChange }) {
  return (
    <div>
      <div className="mb-1 text-[10px] tracking-[0.18em]" style={{ ...mono, color: MUTE }}>{label}</div>
      <div className="flex" style={{ border: `1px solid ${RULE}` }}>
        {options.map((o) => (
          <button key={String(o.v)} onClick={() => onChange(o.v)} className="flex-1 py-1 text-xs"
            style={{ ...mono, background: value === o.v ? INK : "transparent", color: value === o.v ? PAPER : MUTE }}>
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

/* everything the player needs sits on top of the cube: the counters read
   as labels, the two buttons are the only things that take pointer events
   so dragging still works everywhere else. */
function Hud({ portrait, minMoves, used, cleared, status, canDrop, hint, onDrop, onUndo, canUndo }) {
  const undoBtn = (
    <button onClick={onUndo} disabled={!canUndo} className="py-3 px-3 text-xs"
      style={{
        ...mono,
        border: `1px solid ${canUndo ? RULE : "rgba(185,196,204,0.5)"}`,
        background: canUndo ? "rgba(245,248,250,0.82)" : "transparent",
        color: canUndo ? INK : RULE,
        backdropFilter: "blur(2px)",
      }}>1手戻す</button>
  );
  const dropBtn = (
    <button onClick={onDrop} disabled={!canDrop} className="py-3 text-sm tracking-[0.3em]"
      style={{
        ...mono,
        border: `1px solid ${canDrop ? ACCENT : "rgba(185,196,204,0.5)"}`,
        background: canDrop ? (hint ? "rgba(200,16,46,0.14)" : ACCENT) : "rgba(245,248,250,0.5)",
        color: canDrop ? (hint ? ACCENT : "#fff") : RULE,
        boxShadow: hint && canDrop ? "0 0 0 3px rgba(200,16,46,0.25)" : "none",
        backdropFilter: "blur(2px)",
      }}>落とす</button>
  );
  const counters = (
    <div className={portrait ? "flex items-start justify-between" : ""}>
      <div>
        <div className="text-[9px] tracking-[0.3em]" style={{ ...mono, color: MUTE }}>CUBIC RULE</div>
        <div className="mt-1 text-[11px]" style={{ ...mono, color: MUTE }}>最短 {minMoves ?? "–"} 手</div>
      </div>
      <div className={portrait ? "text-right" : "mt-4"}>
        <div className="text-3xl leading-none" style={{ ...mono, color: cleared ? ACCENT : INK }}>{used}</div>
        <div className="text-[9px] tracking-[0.24em]" style={{ ...mono, color: MUTE }}>MOVES</div>
      </div>
    </div>
  );

  if (!portrait) {
    return (
      <div className="absolute inset-0 flex justify-between p-3" style={{ pointerEvents: "none" }}>
        <div style={{ width: 96 }}>{counters}</div>
        <div className="flex flex-col justify-end gap-2" style={{ width: 96, pointerEvents: "auto" }}>
          <div className="mb-1 text-center text-[10px] leading-tight" style={{ ...mono, color: cleared ? ACCENT : MUTE, pointerEvents: "none" }}>{status}</div>
          {undoBtn}{dropBtn}
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex flex-col justify-between p-3" style={{ pointerEvents: "none" }}>
      {counters}
      <div>
        <div className="mb-2 text-center text-[11px]" style={{ ...mono, color: cleared ? ACCENT : MUTE }}>{status}</div>
        <div className="flex gap-2" style={{ pointerEvents: "auto" }}>
          <div style={{ width: 92 }} className="flex flex-col">{undoBtn}</div>
          <div className="flex-1 flex flex-col">{dropBtn}</div>
        </div>
      </div>
    </div>
  );
}

/* options live behind a sheet so the play screen stays bare */
function Sheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(19,33,51,0.32)" }}
      onClick={onClose}>
      <div className="w-full max-w-md p-4" style={{ background: PAPER, borderTop: `2px solid ${INK}` }}
        onClick={(e) => e.stopPropagation()}>
        {children}
        <button onClick={onClose} className="mt-4 w-full py-3 text-xs tracking-[0.2em]"
          style={{ ...mono, border: `1px solid ${INK}`, background: INK, color: PAPER }}>閉じる</button>
      </div>
    </div>
  );
}

const KIND_LABEL = { reversible: "戻せる", clear: "消える", noop: "動かない", lossy: "戻せない" };

function SolutionPanel({ solution, used, classes, seed, downDir, onAutoPlay, canAutoPlay }) {
  const next = used < solution.length ? solution[used] : null;
  return (
    <div className="mt-3 p-3" style={{ background: CARD, border: `1px solid ${RULE}` }}>
      <div className="flex flex-wrap gap-1">
        {solution.map((d, i) => (
          <span key={i} className="px-2 py-1 text-[11px]"
            style={{ ...mono, border: `1px solid ${i < used ? RULE : INK}`, color: i < used ? RULE : INK }}>
            {i + 1}. {DIRS[d].label}
          </span>
        ))}
      </div>
      <div className="mt-2 text-[11px]" style={{ ...mono, color: MUTE }}>
        いま底面は <span style={{ color: INK }}>{downDir != null ? DIRS[downDir].label : "–"}</span>
        {next != null && <> ／ 次に落とす向きは <span style={{ color: ACCENT }}>{DIRS[next].label}</span></>}
      </div>
      <div className="mt-3 text-[10px] tracking-[0.18em]" style={{ ...mono, color: MUTE }}>この局面の5手</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {classes.map((c) => (
          <span key={c.dir} className="px-2 py-1 text-[11px]" style={{
            ...mono,
            border: `1px solid ${c.kind === "reversible" ? INK : RULE}`,
            color: c.kind === "clear" ? ACCENT : c.kind === "noop" ? RULE : INK,
          }}>
            {DIRS[c.dir].label} {KIND_LABEL[c.kind]}
          </span>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Btn onClick={onAutoPlay} disabled={!canAutoPlay}>自動で解く</Btn>
        <span className="text-[10px]" style={{ ...mono, color: MUTE }}>seed {seed ?? "–"}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   useCubeScene — everything three.js.
   The camera is fixed; the cube itself turns, so gravity is always
   world-down and "which face is at the bottom" is the player's choice.
   ═══════════════════════════════════════════════════════════════ */
function useCubeScene({ mountRef, engineRef, gameRef, sizeRef, onCleared, onDownDir }) {
  const api = useRef({});
  const gp = useCallback((i) => (i - (sizeRef.current - 1) / 2) * SP, [sizeRef]);

  useEffect(() => {
    const el = mountRef.current; if (!el) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xE7ECEF);
    const cam = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.1, 100);
    const rend = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    rend.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    rend.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(rend.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const l1 = new THREE.DirectionalLight(0xffffff, 0.7); l1.position.set(4, 9, 7); scene.add(l1);
    const l2 = new THREE.DirectionalLight(0xBFD4E0, 0.3); l2.position.set(-6, -2, -5); scene.add(l2);

    const blockGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const blockerGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    const matByColor = HEX.map((h) => new THREE.MeshLambertMaterial({ color: h }));
    const blockerMat = new THREE.MeshLambertMaterial({ color: 0x93A1AD, transparent: true, opacity: 0.26, depthWrite: false });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x132133, transparent: true, opacity: 0.4 });
    const cubeEdges = new THREE.EdgesGeometry(blockerGeo);

    let dirty = true;
    let drag = null;                     /* the loop checks this, so declare it early */
    const invalidate = () => { dirty = true; };

    /* the cube turns; the camera does not */
    const cube = new THREE.Group(); scene.add(cube);
    const group = new THREE.Group(); cube.add(group);
    let cage = null, blockerMesh = null, blockerLines = null;

    /* the HUD reserves bands on the canvas; the camera frames the cube
       inside whatever is left, so nothing ever sits under a button */
    let insets = { top: 50, bottom: 96, left: 12, right: 12 };
    const VFOV = 38 * Math.PI / 180;
    const PITCH = 0.24;
    const FILL = 0.98;
    /* the cube only ever sits at 90° multiples, so its eight corners are
       fixed. Fitting their actual projection is much tighter than fitting
       the circumscribed sphere, which leaves the cube looking small. */
    const corners = [];
    const rebuildCorners = (n) => {
      corners.length = 0;
      const h = n * SP / 2;
      for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) corners.push(new THREE.Vector3(x, y, z));
    };
    rebuildCorners(sizeRef.current);
    const origin = new THREE.Vector3();
    const frame = () => {
      const W = el.clientWidth || 1, H = el.clientHeight || 1;
      const n = sizeRef.current;
      rebuildCorners(n);
      const freeW = Math.max(40, W - insets.left - insets.right);
      const freeH = Math.max(40, H - insets.top - insets.bottom);
      const cyFree = insets.top + freeH / 2;
      const tan = Math.tan(VFOV / 2);
      cam.aspect = W / H;
      let dist = n * SP * 2.2;
      for (let iter = 0; iter < 8; iter++) {
        const ty = (cyFree - H / 2) * (2 * dist * tan) / H;
        cam.position.set(0, ty + dist * Math.sin(PITCH), dist * Math.cos(PITCH));
        cam.lookAt(0, ty, 0);
        cam.updateMatrixWorld(true);
        cam.updateProjectionMatrix();
        const o = origin.clone().project(cam);
        let mx = 0, my = 0;
        for (const c of corners) {
          const p = c.clone().project(cam);
          mx = Math.max(mx, Math.abs(p.x - o.x) * W / 2);
          my = Math.max(my, Math.abs(p.y - o.y) * H / 2);
        }
        const over = Math.max(mx / (freeW / 2 * FILL), my / (freeH / 2 * FILL));
        if (Math.abs(over - 1) < 0.004) break;
        dist *= over;
      }
      invalidate();
    };

    const setInsets = (next) => { insets = { ...insets, ...next }; frame(); };

    const setCage = (n) => {
      if (cage) { cube.remove(cage); cage.geometry.dispose(); }
      cage = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(n * SP, n * SP, n * SP)),
        new THREE.LineBasicMaterial({ color: 0x132133, transparent: true, opacity: 0.32 }));
      cube.add(cage);
      frame();
    };
    setCage(sizeRef.current);

    /* ── orientation: snapped to 90° steps, animated ── */
    const orient = new THREE.Quaternion();
    const target = new THREE.Quaternion();
    const WORLD_DOWN = new THREE.Vector3(0, -1, 0);
    const AX_X = new THREE.Vector3(1, 0, 0), AX_Y = new THREE.Vector3(0, 1, 0);
    let lastDown = -1;

    /* which cube-space direction is pointing down for a given pose */
    const downOfPose = (q) => {
      const v = WORLD_DOWN.clone().applyQuaternion(q.clone().invert());
      const c = [v.x, v.y, v.z];
      let ax = 0; for (let i = 1; i < 3; i++) if (Math.abs(c[i]) > Math.abs(c[ax])) ax = i;
      return DIRS.findIndex((d) => d.ax === ax && d.sg === (c[ax] >= 0 ? 1 : -1));
    };
    const downDir = () => downOfPose(target);

    /* the 24 poses the cube can rest in */
    const AX_Z = new THREE.Vector3(0, 0, 1);
    const ORIENTS = (() => {
      const keyOfPose = (q) => new THREE.Matrix4().makeRotationFromQuaternion(q).elements.map((v) => Math.round(v)).join();
      const seen = new Set(), out = [];
      let frontier = [new THREE.Quaternion()];
      seen.add(keyOfPose(frontier[0])); out.push(frontier[0]);
      const steps = [[AX_X, 1], [AX_X, -1], [AX_Y, 1], [AX_Y, -1], [AX_Z, 1], [AX_Z, -1]];
      while (frontier.length) {
        const next = [];
        for (const q of frontier) for (const [ax, sg] of steps) {
          const t = new THREE.Quaternion().setFromAxisAngle(ax, sg * Math.PI / 2).multiply(q);
          const k = keyOfPose(t);
          if (seen.has(k)) continue;
          seen.add(k); out.push(t); next.push(t);
        }
        frontier = next;
      }
      return out;
    })();

    /* the pose that puts `dir` at the bottom with the least turning from `near` */
    const poseFor = (dir, near) => {
      let best = near, bestAngle = Infinity;
      for (const q of ORIENTS) {
        if (downOfPose(q) !== dir) continue;
        const a = q.angleTo(near);
        if (a < bestAngle) { bestAngle = a; best = q; }
      }
      return best;
    };

    const announceDown = () => {
      const d = downDir();
      if (d !== lastDown) { lastDown = d; onDownDir(d); }
    };
    announceDown();

    const rotate = (which) => {
      if (gameRef.current.anim) return;
      const q = new THREE.Quaternion();
      if (which === "up") q.setFromAxisAngle(AX_X, -Math.PI / 2);
      else if (which === "down") q.setFromAxisAngle(AX_X, Math.PI / 2);
      else if (which === "left") q.setFromAxisAngle(AX_Y, -Math.PI / 2);
      else q.setFromAxisAngle(AX_Y, Math.PI / 2);
      target.premultiply(q);
      announceDown();
      invalidate();
    };

    /* ── contents ── */
    const setBlockers = (list) => {
      if (blockerMesh) { cube.remove(blockerMesh); blockerMesh.dispose?.(); blockerMesh = null; }
      if (blockerLines) { cube.remove(blockerLines); blockerLines.geometry.dispose(); blockerLines = null; }
      if (!list.length) { invalidate(); return; }
      blockerMesh = new THREE.InstancedMesh(blockerGeo, blockerMat, list.length);
      const m4 = new THREE.Matrix4();
      list.forEach((p, i) => { m4.makeTranslation(p[0], p[1], p[2]); blockerMesh.setMatrixAt(i, m4); });
      blockerMesh.instanceMatrix.needsUpdate = true;
      blockerMesh.renderOrder = 1;
      cube.add(blockerMesh);
      const src = cubeEdges.getAttribute("position").array;
      const arr = new Float32Array(src.length * list.length);
      list.forEach((p, i) => {
        const o = i * src.length;
        for (let k = 0; k < src.length; k += 3) {
          arr[o + k] = src[k] + p[0]; arr[o + k + 1] = src[k + 1] + p[1]; arr[o + k + 2] = src[k + 2] + p[2];
        }
      });
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      blockerLines = new THREE.LineSegments(g2, edgeMat);
      cube.add(blockerLines); invalidate();
    };

    const build = (board, blk, colorOf, dir, opts = {}) => {
      const g = gameRef.current;
      for (const [, m] of g.meshes) { group.remove(m); if (m.userData.tmp) m.material.dispose(); }
      g.meshes = new Map();
      const R = engineRef.current.R, n = sizeRef.current;
      const blockerPos = [];
      for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
        const i = R.id(x, y, z);
        if (blk[i]) { blockerPos.push([gp(x), gp(y), gp(z)]); continue; }
        const bid = board[i]; if (bid < 0) continue;
        const ci = (colorOf[bid] - 1) % matByColor.length;
        const m = new THREE.Mesh(blockGeo, matByColor[ci]);
        m.userData.ci = ci;
        m.position.set(gp(x), gp(y), gp(z));
        group.add(m); g.meshes.set(bid, m);
      }
      setBlockers(blockerPos);
      g.board = R.clone(board); g.blk = blk; g.colorOf = colorOf; g.dir = dir;
      g.anim = null; g.used = 0;
      /* pose: snap to the gravity direction (new puzzle, reset), or turn
         towards a given face while the blocks rewind underneath */
      if (opts.poseDir != null) {
        target.copy(poseFor(opts.poseDir, target));
      } else if (!opts.keepOrientation) {
        target.copy(poseFor(dir, target));
        orient.copy(target);
        cube.quaternion.copy(target);
      }
      announceDown();
      invalidate();
    };

    const snap = () => {
      const g = gameRef.current; if (!g.board) return;
      const R = engineRef.current.R, n = sizeRef.current, seen = new Set();
      for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
        const bid = g.board[R.id(x, y, z)]; if (bid < 0) continue;
        const m = g.meshes.get(bid); if (!m) continue;
        m.position.set(gp(x), gp(y), gp(z));
        m.scale.set(1, 1, 1);
        m.visible = true;
        if (m.userData.tmp) { m.material.dispose(); m.material = matByColor[m.userData.ci]; m.userData.tmp = false; }
        seen.add(bid);
      }
      for (const [bid, m] of [...g.meshes]) {
        if (seen.has(bid)) continue;
        group.remove(m); if (m.userData.tmp) m.material.dispose(); g.meshes.delete(bid);
      }
      invalidate();
    };

    const capturePositions = () => {
      const map = new Map();
      for (const [bid, m] of gameRef.current.meshes) map.set(bid, [m.position.x, m.position.y, m.position.z]);
      return map;
    };

    /* blocks slide back to where they were; the ones that had been cleared
       fade back in. The cube itself does not move. */
    const rewind = (fromMap, dur = 360) => {
      const g = gameRef.current;
      const movers = [], reborn = [];
      for (const [bid, m] of g.meshes) {
        const to = [m.position.x, m.position.y, m.position.z];
        const from = fromMap && fromMap.get(bid);
        if (from) { m.position.set(from[0], from[1], from[2]); movers.push({ id: bid, f: from, t: to }); }
        else { m.visible = false; reborn.push(bid); }   /* hidden until their turn */
      }
      const segs = [];
      if (movers.length) segs.push({ type: "rewind", map: movers, dur });
      if (reborn.length) segs.push({ type: "respawn", ids: reborn, dur: 300 });
      if (!segs.length) { invalidate(); return; }
      /* held until the cube has finished turning */
      g.anim = { segs, i: 0, t0: performance.now(), waitPose: true };
      invalidate();
    };

    /* ── animation ──
       Blocks accelerate like they are falling, land at different times
       depending on how far they drop, and squash briefly on impact. */
    const FALL_BASE = 130, FALL_PER_UNIT = 95, SQUASH = 130;
    const advance = () => {
      const g = gameRef.current, a = g.anim; if (!a) return;
      const seg = a.segs[a.i];
      if (!seg) { g.anim = null; snap(); return; }
      /* rewinds run in two beats: the cube turns back, then the blocks slide */
      if (a.waitPose) {
        if (!cube.quaternion.equals(target)) return;
        a.waitPose = false;
        a.t0 = performance.now() + 90;
      }
      const now = performance.now();
      const elapsed = now - a.t0;
      if (elapsed < 0) { invalidate(); return; }
      if (seg.type === "move") {
        for (const it of seg.map) {
          const m = g.meshes.get(it.id); if (!m) continue;
          const u = Math.min(1, elapsed / it.dur);
          const e = u * u;                       /* constant acceleration */
          m.position.set(
            it.f[0] + (it.t[0] - it.f[0]) * e,
            it.f[1] + (it.t[1] - it.f[1]) * e,
            it.f[2] + (it.t[2] - it.f[2]) * e);
          /* squash on landing, along the axis it fell */
          const after = elapsed - it.dur;
          if (it.dist > 0.01 && after >= 0 && after < SQUASH) {
            const k = 1 - Math.abs(after / SQUASH - 0.5) * 2;   /* 0→1→0 */
            const amt = Math.min(0.32, 0.1 + it.dist * 0.05) * k;
            m.scale.set(1, 1, 1);
            m.scale.setComponent(it.axis, 1 - amt);
            const other = [0, 1, 2].filter((q) => q !== it.axis);
            for (const q of other) m.scale.setComponent(q, 1 + amt * 0.45);
          } else if (u >= 1) m.scale.set(1, 1, 1);
        }
      } else if (seg.type === "rewind") {
        const u = Math.min(1, elapsed / seg.dur);
        const e = 1 - Math.pow(1 - u, 3);
        for (const it of seg.map) {
          const m = g.meshes.get(it.id); if (!m) continue;
          m.position.set(
            it.f[0] + (it.t[0] - it.f[0]) * e,
            it.f[1] + (it.t[1] - it.f[1]) * e,
            it.f[2] + (it.t[2] - it.f[2]) * e);
        }
      } else if (seg.type === "respawn") {
        const u = Math.min(1, elapsed / seg.dur);
        const e = 1 - Math.pow(1 - u, 3);
        for (const bid of seg.ids) {
          const m = g.meshes.get(bid); if (!m) continue;
          m.visible = true;
          if (!m.userData.tmp) { m.material = matByColor[m.userData.ci].clone(); m.material.transparent = true; m.userData.tmp = true; }
          const sc = 0.25 + 0.75 * e;
          m.scale.set(sc, sc, sc);
          m.material.opacity = e;
        }
      } else {
        const u = Math.min(1, elapsed / seg.dur);
        for (const bid of seg.ids) {
          const m = g.meshes.get(bid); if (!m) continue;
          if (!m.userData.tmp) { m.material = matByColor[m.userData.ci].clone(); m.material.transparent = true; m.userData.tmp = true; }
          const s = 1 + u * 0.6;
          m.scale.set(s, s, s);
          m.material.opacity = Math.max(0, 1 - u * u);
        }
      }
      if (elapsed >= seg.dur) {
        if (seg.type === "clear") {
          for (const bid of seg.ids) {
            const m = g.meshes.get(bid); if (!m) continue;
            group.remove(m); if (m.userData.tmp) m.material.dispose(); g.meshes.delete(bid);
          }
        }
        a.i++; a.t0 = now;
        if (a.i >= a.segs.length) { g.anim = null; snap(); if (g.meshes.size === 0) onCleared(); }
      }
      invalidate();
    };

    /* ── loop ── */
    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!drag && !cube.quaternion.equals(target)) {
        orient.slerp(target, 0.28);
        if (orient.angleTo(target) < 0.01) orient.copy(target);
        cube.quaternion.copy(orient);
        invalidate();
      }
      try { advance(); } catch (err) { console.error(err); gameRef.current.anim = null; snap(); }
      if (dirty) { rend.render(scene, cam); dirty = false; }
    };
    tick();

    /* ── input: drag the cube; it follows, then snaps or springs back ── */
    const dom = rend.domElement;
    dom.style.touchAction = "none";
    const AXES = { yaw: AX_Y, pitch: AX_X };
    const preview = new THREE.Quaternion();

    const applyPreview = (axis, px) => {
      const t = px / GESTURE.quarter;
      const mag = Math.min(Math.abs(t) <= 1 ? Math.abs(t) : 1 + (Math.abs(t) - 1) * GESTURE.resist, GESTURE.overshoot);
      preview.setFromAxisAngle(AXES[axis], Math.sign(t) * mag * (Math.PI / 2));
      orient.copy(target).premultiply(preview);
      cube.quaternion.copy(orient);
      invalidate();
    };

    const onDown = (e) => {
      if (gameRef.current.anim) return;
      drag = { x: e.clientX, y: e.clientY, axis: null };
      dom.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.axis) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < GESTURE.deadzone) return;
        drag.axis = Math.abs(dx) > Math.abs(dy) ? "yaw" : "pitch";
      }
      applyPreview(drag.axis, drag.axis === "yaw" ? dx : dy);
    };
    const onUp = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      const axis = drag.axis;
      drag = null;
      if (!axis) return;
      const px = axis === "yaw" ? dx : dy;
      if (Math.abs(px) >= GESTURE.commit) {
        const q = new THREE.Quaternion().setFromAxisAngle(AXES[axis], Math.sign(px) * (Math.PI / 2));
        target.premultiply(q);
        announceDown();
      }
      /* either way the slerp in the loop takes over from where the finger left it */
      invalidate();
    };
    const onCancel = () => { drag = null; invalidate(); };
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onCancel);

    const onResize = () => {
      if (!el.clientWidth) return;
      cam.aspect = el.clientWidth / el.clientHeight; cam.updateProjectionMatrix();
      rend.setSize(el.clientWidth, el.clientHeight); frame();
    };
    window.addEventListener("resize", onResize);

    api.current = { build, snap, setCage, setInsets, invalidate, gp, rotate, downDir, capturePositions, rewind, FALL_BASE, FALL_PER_UNIT, SQUASH };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onCancel);
      blockGeo.dispose(); blockerGeo.dispose(); cubeEdges.dispose();
      matByColor.forEach((m) => m.dispose());
      blockerMat.dispose(); edgeMat.dispose();
      rend.dispose();
      if (dom.parentNode) dom.parentNode.removeChild(dom);
      gameRef.current.meshes = new Map();
      api.current = {};
    };
  }, [mountRef, engineRef, gameRef, sizeRef, onCleared, onDownDir, gp]);

  return api;
}

/* ═══════════════════════════════════════════════════════════════
   usePuzzleSource — asks the worker for a puzzle, falls back to the
   main thread. Knows nothing about rendering.
   ═══════════════════════════════════════════════════════════════ */
function usePuzzleSource(engineRef) {
  const workerRef = useRef(null);
  const jobRef = useRef(0);
  useEffect(() => () => { workerRef.current?.terminate(); }, []);

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

/* ═══════════════════════════════════════════════════════════════
   App
   ═══════════════════════════════════════════════════════════════ */
export default function App() {
  const [size, setSize] = useState(5);
  const [mode, setMode] = useState("222");
  const [colors, setColors] = useState(2);
  const [moves, setMoves] = useState(3);

  const [seed, setSeed] = useState(null);
  const [minMoves, setMinMoves] = useState(null);
  const [genMs, setGenMs] = useState(null);
  const [info, setInfo] = useState({ blockers: 0, decoys: 0, special: 0, tries: 0 });
  const [used, setUsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [chainNote, setChainNote] = useState(0);
  const [showSol, setShowSol] = useState(false);
  const [solution, setSolution] = useState([]);
  const [classes, setClasses] = useState([]);
  const [downDir, setDownDir] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [selfTest, setSelfTest] = useState(null);
  const [portrait, setPortrait] = useState(true);
  const [sheet, setSheet] = useState(false);

  const mountRef = useRef(null);
  const gameRef = useRef({ meshes: new Map(), history: [] });
  const sizeRef = useRef(size);
  const engineRef = useRef(null);
  const engineKey = useRef("");

  if (engineKey.current !== `${mode}-${size}`) {
    const R = createRules(size, mode);
    const solver = createSolver(R);
    engineRef.current = { R, solver, gen: createGenerator(R, solver) };
    engineKey.current = `${mode}-${size}`;
  }

  const onCleared = useCallback(() => setCleared(true), []);
  const onDownDir = useCallback((d) => setDownDir(d), []);
  const scene = useCubeScene({ mountRef, engineRef, gameRef, sizeRef, onCleared, onDownDir });
  const requestPuzzle = usePuzzleSource(engineRef);

  useEffect(() => { setSelfTest(runSelfTest()); }, []);
  useEffect(() => {
    const read = () => setPortrait(window.innerHeight >= window.innerWidth);
    read();
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    return () => { window.removeEventListener("resize", read); window.removeEventListener("orientationchange", read); };
  }, []);
  useEffect(() => {
    scene.current.setInsets?.(portrait
      ? { top: 50, bottom: 96, left: 12, right: 12 }
      : { top: 12, bottom: 12, left: 106, right: 106 });
  }, [portrait, scene]);
  useEffect(() => { sizeRef.current = size; scene.current.setCage?.(size); }, [size, scene]);

  const refreshClasses = useCallback(() => {
    const g = gameRef.current, { solver } = engineRef.current;
    if (!g.board) { setClasses([]); return; }
    setClasses(solver.classify(g.board, g.blk, g.colorOf, g.dir));
  }, []);

  const install = useCallback((p, keepStart, opts) => {
    const { R } = engineRef.current;
    scene.current.build?.(p.board, p.blk, p.colorOf, p.dir, opts);
    gameRef.current.history = [];
    gameRef.current.start = keepStart || { board: R.clone(p.board), dir: p.dir };
    refreshClasses();
  }, [refreshClasses, scene]);

  const newPuzzle = useCallback(() => {
    setBusy(true); setFail(false); setCleared(false); setUsed(0);
    setMinMoves(null); setChainNote(0); setSolution([]); setPlaying(false);
    const { R } = engineRef.current;
    const opts = { colors, moves, maxBlockers: Math.round(R.S * TUNING.blockerRatio), nodeCap: TUNING.nodeCap };
    const t0 = performance.now();
    requestPuzzle({
      size, mode, opts,
      onDone: (p, s, tries) => {
        install(p);
        setSolution(p.solution);
        setMinMoves(p.solution.length);
        setInfo({ blockers: p.blockers, decoys: p.decoys, special: p.special, tries });
        setSeed(s); setGenMs(Math.round(performance.now() - t0));
        setBusy(false);
      },
      onFail: (tally) => { if (tally) console.warn("generation gave up", tally); setBusy(false); setFail(true); },
    });
  }, [colors, moves, size, mode, install, requestPuzzle]);

  useEffect(() => { const t = setTimeout(newPuzzle, 0); return () => clearTimeout(t); }, [newPuzzle]);

  /* build the fall animation: each block gets its own duration by distance */
  const drop = useCallback((nd) => {
    const g = gameRef.current, { R } = engineRef.current;
    if (!g.board || g.anim || nd == null || nd < 0 || nd === g.dir) return;
    const gp = scene.current.gp;
    const { FALL_BASE, FALL_PER_UNIT, SQUASH } = scene.current;
    const n = sizeRef.current;
    const posMap = (board) => {
      const map = new Map();
      for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
        const bid = board[R.id(x, y, z)];
        if (bid >= 0) map.set(bid, [gp(x), gp(y), gp(z)]);
      }
      return map;
    };

    const frames = [];
    const next = R.clone(g.board);
    R.settle(next, g.blk, g.colorOf, nd, frames);
    g.history = [...(g.history || []), { board: R.clone(g.board), dir: g.dir }];

    const axis = DIRS[nd].ax;
    let prev = posMap(g.board);
    const segs = []; let chains = 0;
    for (const f of frames) {
      if (f.cleared) { segs.push({ type: "clear", ids: f.cleared, dur: 260 }); chains++; }
      else {
        const cur = posMap(f.board), map = [];
        let longest = 0;
        for (const [bid, tp] of cur) {
          const fp = prev.get(bid) || tp;
          const dist = Math.abs(tp[axis] - fp[axis]) / SP;
          const dur = dist < 0.01 ? 1 : FALL_BASE + FALL_PER_UNIT * Math.sqrt(dist);
          longest = Math.max(longest, dur);
          map.push({ id: bid, f: fp, t: tp, dist, dur, axis });
        }
        segs.push({ type: "move", map, dur: longest + SQUASH });
        prev = cur;
      }
    }
    g.board = next; g.dir = nd; g.used = (g.used ?? 0) + 1;
    g.anim = { segs, i: 0, t0: performance.now() };
    setUsed(g.used); setChainNote(chains); refreshClasses();
    scene.current.invalidate?.();
  }, [refreshClasses, scene]);

  const onRotate = useCallback((which) => {
    if (busy || cleared || playing) return;
    scene.current.rotate?.(which);
  }, [busy, cleared, playing, scene]);

  const onDrop = useCallback(() => {
    if (busy || cleared || playing) return;
    const d = scene.current.downDir?.();
    if (d == null) return;
    drop(d);
  }, [busy, cleared, playing, drop, scene]);

  /* keyboard: arrows turn the cube, space drops it */
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const map = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right",
      };
      if (map[k]) { e.preventDefault(); onRotate(map[k]); }
      else if (k === " " || k === "Enter") { e.preventDefault(); onDrop(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRotate, onDrop]);

  const undo = useCallback(() => {
    const g = gameRef.current;
    if (!g.history?.length || g.anim || busy || playing) return;
    const last = g.history[g.history.length - 1];
    const rest = g.history.slice(0, -1);
    const from = scene.current.capturePositions?.();
    /* the move about to be replayed is the one we are undoing, so the cube
       turns back to the face that move dropped towards */
    const replayDir = g.dir;
    install({ board: last.board, blk: g.blk, colorOf: g.colorOf, dir: last.dir }, g.start, { poseDir: replayDir });
    scene.current.rewind?.(from);
    gameRef.current.history = rest;
    gameRef.current.used = rest.length;
    setUsed(rest.length); setCleared(false); setChainNote(0);
  }, [busy, playing, install, scene]);

  const reset = useCallback(() => {
    const g = gameRef.current; if (!g.start || busy) return;
    install({ board: g.start.board, blk: g.blk, colorOf: g.colorOf, dir: g.start.dir }, g.start);
    setUsed(0); setCleared(false); setChainNote(0);
  }, [busy, install]);

  const autoPlay = useCallback(() => {
    if (busy || playing || !solution.length) return;
    reset(); setPlaying(true);
    let i = 0;
    const run = () => {
      if (i >= solution.length) { setPlaying(false); return; }
      if (gameRef.current.anim) { setTimeout(run, 120); return; }
      drop(solution[i]); i++;
      setTimeout(run, 320);
    };
    setTimeout(run, 360);
  }, [busy, playing, solution, reset, drop]);

  const canDrop = !busy && !cleared && !playing && downDir != null && gameRef.current.dir !== downDir;
  const nextHint = showSol && used < solution.length && downDir === solution[used];

  const tags = [
    info.special === 2 ? "色をまたぐ手" : info.special === 3 ? "連鎖あり" : null,
    info.decoys > 0 ? "囮あり" : null,
  ].filter(Boolean);

  const status = busy ? "生成中"
    : fail ? "この条件では作れません"
    : playing ? "自動再生中"
    : cleared ? `全消し — ${used}手`
    : chainNote > 1 ? `${chainNote}連鎖`
    : tags.length ? tags.join(" / ")
    : "灰色は動かせないマス";

  return (
    <div className="min-h-screen w-full" style={{ background: PAPER, color: INK }}>
      <div className="mx-auto max-w-md px-4 py-5">
        <div className="relative"
          style={{ height: portrait ? "min(66vh, 560px)" : "min(82vh, 460px)", background: CARD, border: `1px solid ${RULE}` }}>
          <div ref={mountRef} className="absolute inset-0" />
          <Hud portrait={portrait} minMoves={minMoves} used={used} cleared={cleared} status={status}
            canDrop={canDrop} hint={nextHint} onDrop={onDrop}
            onUndo={undo} canUndo={!!used && !busy && !playing} />
        </div>

        <div className="mt-2 text-center text-[10px]" style={{ ...mono, color: MUTE }}>
          上下で底面を入れ替え、左右で見回し
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Btn onClick={reset}>最初から</Btn>
          <Btn onClick={() => setSheet(true)}>設定</Btn>
          <Btn onClick={newPuzzle} primary>次の問題</Btn>
        </div>

        {showSol && (
          <SolutionPanel solution={solution} used={used} classes={classes} seed={seed} downDir={downDir}
            onAutoPlay={autoPlay} canAutoPlay={!!solution.length && !playing} />
        )}

        <Sheet open={sheet} onClose={() => setSheet(false)}>
          <div className="mb-3 text-[10px] tracking-[0.3em]" style={{ ...mono, color: MUTE }}>OPTIONS</div>
          <div className="grid grid-cols-3 gap-3">
            <Pick label="盤サイズ" value={size} onChange={setSize} options={[{ v: 4, l: "4³" }, { v: 5, l: "5³" }]} />
            <Pick label="消滅条件" value={mode} onChange={setMode} options={[{ v: "222", l: "2×2×2" }, { v: "221", l: "2×2×1" }]} />
            <Pick label="色数" value={colors} onChange={setColors} options={[1, 2, 3].map((v) => ({ v, l: `${v}` }))} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Pick label="手数の下限" value={moves} onChange={setMoves} options={[3, 4, 5, 6, 7, 8].map((v) => ({ v, l: `${v}` }))} />
            <Pick label="解答（開発用）" value={showSol} onChange={setShowSol}
              options={[{ v: false, l: "隠す" }, { v: true, l: "表示" }]} />
          </div>
          <div className="mt-4 text-[10px] leading-relaxed" style={{ ...mono, color: MUTE }}>
            障害{info.blockers} ／ {info.tries}試行 ／ {genMs ?? "–"}ms ／ seed {seed ?? "–"}
          </div>
          <div className="mt-2 px-3 py-2 text-[11px]"
            style={{ ...mono, border: `1px solid ${selfTest && selfTest.length ? ACCENT : RULE}`, color: selfTest && selfTest.length ? ACCENT : MUTE }}>
            {selfTest === null ? "自己診断 実行中"
              : selfTest.length === 0 ? "自己診断 全項目パス"
              : `自己診断 失敗: ${selfTest.join(", ")}`}
          </div>
        </Sheet>
      </div>
    </div>
  );
}
