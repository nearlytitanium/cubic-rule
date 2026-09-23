import { useEffect, useRef, useState, useCallback } from "react";
import { TUNING } from "./engine/tuning.js";
import { DIRS, createRules } from "./engine/rules.js";
import { createSolver } from "./engine/solver.js";
import { createGenerator } from "./engine/generator.js";
import { runSelfTest } from "./engine/selftest.js";
import { useCubeScene } from "./hooks/useCubeScene.js";
import { usePuzzleSource } from "./hooks/usePuzzleSource.js";
import { PAPER, CARD, INK, MUTE, RULE, ACCENT, mono } from "./ui/theme.js";
import { Btn, Pick, Sheet } from "./ui/controls.jsx";
import { Hud } from "./ui/Hud.jsx";
import { SolutionPanel } from "./ui/SolutionPanel.jsx";

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
