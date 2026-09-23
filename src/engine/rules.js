/* ═══════════════════════════════════════════════════════════════
   CORE RULES
   One board representation: Int16Array of block ids, EMPTY = -1.
   Blocked cells live in a separate immutable mask and never appear
   in the board, so no sentinel can leak into a colour lookup.
   ═══════════════════════════════════════════════════════════════ */
export const EMPTY = -1;
export const DIRS = [
  { ax: 1, sg: -1, label: "Y−" }, { ax: 1, sg: 1, label: "Y+" },
  { ax: 0, sg: -1, label: "X−" }, { ax: 0, sg: 1, label: "X+" },
  { ax: 2, sg: -1, label: "Z−" }, { ax: 2, sg: 1, label: "Z+" },
];
export const flipOf = (d) => DIRS.findIndex((x) => x.ax === DIRS[d].ax && x.sg === -DIRS[d].sg);

export function createRules(N, mode) {
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
