import { useEffect, useRef, useState, useCallback } from "react";
import { TUNING } from "./engine/tuning.js";
import { DIRS, createRules } from "./engine/rules.js";
import { createSolver } from "./engine/solver.js";
import { createGenerator } from "./engine/generator.js";
import { useCubeScene } from "./hooks/useCubeScene.js";
import { usePuzzleSource } from "./hooks/usePuzzleSource.js";
import { PAPER, INK, SP, REPLAY } from "./ui/theme.js";
import { Hud } from "./ui/Hud.jsx";
import { ClearPopup } from "./ui/ClearPopup.jsx";
import { TitleScreen, PRESETS, presetLabel } from "./ui/TitleScreen.jsx";
import { I18nProvider, stringsFor, initialLang, saveLang } from "./i18n.jsx";

/* only the 2×2×2 rule is offered; the engine still knows "221" */
const MODE = "222";

/* the options are remembered in this browser between visits. Storage can
   be missing or throw (private windows, blocked site data); then the
   game simply starts on Normal. */
const CONFIG_KEY = "cubicrule.config";
const DEFAULT_CONFIG = (({ size, colors, moves }) => ({ size, colors, moves }))(PRESETS.find((p) => p.id === "normal"));
function loadConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(CONFIG_KEY));
    if ([4, 5].includes(c?.size) && [1, 2, 3].includes(c?.colors) && c?.moves >= 3 && c?.moves <= 8) {
      return { size: c.size, colors: c.colors, moves: c.moves };
    }
  } catch { /* fall through */ }
  return DEFAULT_CONFIG;
}
function saveConfig(c) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); } catch { /* not kept */ }
}

/* every layout fills the window with the HUD in its corners. "wide"
   (desktop, tablet) is "phone" at a larger size; "land" (phone held
   sideways) keeps the HUD at the sides, where height is scarce. The
   camera frames the cube inside the insets, so nothing sits under a
   button. */
const layoutFor = (w, h) => (h < 600 && w > h ? "land" : w >= 768 && h >= 600 ? "wide" : "phone");
const INSETS = {
  phone: { top: 64, bottom: 100, left: 12, right: 12 },
  wide: { top: 90, bottom: 112, left: 24, right: 24 },
  land: { top: 12, bottom: 12, left: 112, right: 112 },
};

/* ═══════════════════════════════════════════════════════════════
   App
   ═══════════════════════════════════════════════════════════════ */
export default function App() {
  /* chosen on the title screen; applies to every puzzle until the next start */
  const [screen, setScreen] = useState("title");
  const [lang, setLangState] = useState(initialLang);
  const setLang = useCallback((l) => { setLangState(l); saveLang(l); }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const t = stringsFor(lang);
  const [config, setConfig] = useState(loadConfig);
  const { size } = config;

  const [seed, setSeed] = useState(null);
  const [minMoves, setMinMoves] = useState(null);
  const [used, setUsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [showClear, setShowClear] = useState(false);
  const [clearedBy, setClearedBy] = useState("player");
  const [solution, setSolution] = useState([]);
  const [downDir, setDownDir] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [layout, setLayout] = useState(() => layoutFor(window.innerWidth, window.innerHeight));

  const mountRef = useRef(null);
  const gameRef = useRef({ meshes: new Map(), history: [] });
  const sizeRef = useRef(size);
  const engineRef = useRef(null);
  const engineKey = useRef("");
  /* the solution replay: bumping the token cancels a replay in flight;
     `replaying` tells the clear popup who emptied the board */
  const playToken = useRef(0);
  const replaying = useRef(false);
  /* bumped by every request and by leaving for the title, so a late
     answer from the worker is dropped */
  const genToken = useRef(0);

  if (engineKey.current !== `${MODE}-${size}`) {
    const R = createRules(size, MODE);
    const solver = createSolver(R);
    engineRef.current = { R, solver, gen: createGenerator(R, solver) };
    engineKey.current = `${MODE}-${size}`;
  }

  const onCleared = useCallback(() => {
    setCleared(true); setShowClear(true);
    setClearedBy(replaying.current ? "replay" : "player");
  }, []);
  const onDownDir = useCallback((d) => setDownDir(d), []);
  const scene = useCubeScene({ mountRef, engineRef, gameRef, sizeRef, onCleared, onDownDir });
  const requestPuzzle = usePuzzleSource();

  useEffect(() => {
    const read = () => setLayout(layoutFor(window.innerWidth, window.innerHeight));
    read();
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    return () => { window.removeEventListener("resize", read); window.removeEventListener("orientationchange", read); };
  }, []);
  useEffect(() => { scene.current.setInsets?.(INSETS[layout]); }, [layout, scene]);
  useEffect(() => { sizeRef.current = size; scene.current.setCage?.(size); }, [size, scene]);

  const install = useCallback((p, keepStart, opts) => {
    const { R } = engineRef.current;
    scene.current.build?.(p.board, p.blk, p.colorOf, p.dir, opts);
    gameRef.current.history = [];
    gameRef.current.start = keepStart || { board: R.clone(p.board), dir: p.dir };
  }, [scene]);

  /* the current blocks start leaving at once; the new ones are laid in
     when the worker answers. `cfg` defaults to the current options (the
     title screen passes the ones just chosen, before they are in state);
     `base` is a seed to start from, random when omitted. */
  const newPuzzle = useCallback((cfg = config, base) => {
    playToken.current++; replaying.current = false;
    const token = ++genToken.current;
    scene.current.clearOut?.();
    setBusy(true); setFail(false); setCleared(false); setShowClear(false); setUsed(0);
    setMinMoves(null); setSolution([]); setPlaying(false); setSeed(null);
    const opts = {
      colors: cfg.colors, moves: cfg.moves,
      maxBlockers: Math.round(cfg.size ** 3 * TUNING.blockerRatio), nodeCap: TUNING.nodeCap,
    };
    requestPuzzle({
      size: cfg.size, mode: MODE, opts, base,
      onDone: (p, s) => {
        if (token !== genToken.current) return;
        install(p, null, { restart: true, fresh: true });
        setSolution(p.solution);
        setMinMoves(p.solution.length);
        setSeed(s);
        setBusy(false);
      },
      onFail: (tally) => {
        if (token !== genToken.current) return;
        if (tally) console.warn("generation gave up", tally);
        setBusy(false); setFail(true);
      },
    });
  }, [config, install, requestPuzzle, scene]);

  const start = useCallback((cfg, base) => {
    setConfig(cfg); saveConfig(cfg);
    setScreen("play");
    newPuzzle(cfg, base ?? undefined);
  }, [newPuzzle]);

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
    const segs = [];
    for (const f of frames) {
      if (f.cleared) segs.push({ type: "clear", ids: f.cleared, dur: 260 });
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
    setUsed(g.used);
    scene.current.invalidate?.();
  }, [scene]);

  const onRotate = useCallback((which) => {
    if (busy || cleared || playing) return;
    scene.current.rotate?.(which);
  }, [busy, cleared, playing, scene]);

  /* once the board is cleared the same button (and key) moves on */
  const onDrop = useCallback(() => {
    if (busy || playing) return;
    if (cleared) { newPuzzle(); return; }
    const d = scene.current.downDir?.();
    if (d == null) return;
    drop(d);
  }, [busy, cleared, playing, drop, newPuzzle, scene]);

  /* keyboard: arrows turn the cube, space drops it — only while playing,
     and never while typing into a field */
  useEffect(() => {
    if (screen !== "play") return;
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement) return;
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
  }, [screen, onRotate, onDrop]);

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
    setUsed(rest.length); setCleared(false); setShowClear(false);
  }, [busy, playing, install, scene]);

  const reset = useCallback(() => {
    const g = gameRef.current; if (!g.start || busy) return;
    playToken.current++; replaying.current = false; setPlaying(false);
    install({ board: g.start.board, blk: g.blk, colorOf: g.colorOf, dir: g.start.dir }, g.start, { restart: true });
    setUsed(0); setCleared(false); setShowClear(false);
  }, [busy, install]);

  /* skipping shows the answer: back to the start if needed, then each
     move of the solution in turn — the cube turns to the face it drops
     towards, so the replay can be followed. Once it is cleared the usual
     popup and "next" button take over. */
  const skip = useCallback(() => {
    if (busy || playing) return;
    if (cleared || !solution.length) { newPuzzle(); return; }
    /* nothing dropped yet (or all undone): the board already is the
       starting one, so the replay can begin without rebuilding it */
    if (gameRef.current.history?.length) reset();
    const token = ++playToken.current;
    replaying.current = true;
    setPlaying(true);
    let i = 0;
    const alive = () => playToken.current === token;
    const step = () => {
      if (!alive()) return;
      if (i >= solution.length) { setPlaying(false); return; }
      if (gameRef.current.anim) { setTimeout(step, 120); return; }
      scene.current.face?.(solution[i]);
      const land = () => {
        if (!alive()) return;
        if (!scene.current.posed?.()) { setTimeout(land, 60); return; }
        setTimeout(() => {
          if (!alive()) return;
          drop(solution[i]); i++;
          setTimeout(step, 320);
        }, REPLAY.hold);
      };
      setTimeout(land, 160);
    };
    setTimeout(step, 360);
  }, [busy, playing, cleared, solution, newPuzzle, reset, drop, scene]);

  const canNext = cleared && !busy && !playing;
  const canDrop = canNext || (!busy && !cleared && !playing && downDir != null && gameRef.current.dir !== downDir);

  /* no status line: the one thing that is always there, the drop button,
     says what is going on when it cannot drop */
  const dropLabel = busy ? t.generating : fail ? t.failed : playing ? t.replaying : cleared ? t.next : t.drop;

  const toTitle = useCallback(() => {
    playToken.current++; genToken.current++; replaying.current = false;
    setPlaying(false); setBusy(false); setFail(false); setShowClear(false);
    scene.current.clearOut?.();
    setScreen("title");
  }, [scene]);

  const menu = [
    { label: t.restart, onClick: reset },
    { label: t.skip, onClick: skip },
    { label: t.toTitle, onClick: toTitle },
  ];
  const menuNote = `${presetLabel(config, t)}${t.sep}${t.summary(config)}${t.sep}seed ${seed ?? "–"}`;

  /* the tree keeps the same shape in every layout, so the canvas mount
     is never replaced — only classes and styles change */
  return (
    <I18nProvider lang={lang} setLang={setLang}>
      <div className="fixed inset-0 overflow-hidden" style={{ background: PAPER, color: INK }}>
        <div ref={mountRef} className="absolute inset-0" />
        <Hud layout={layout} minMoves={minMoves} used={used} cleared={cleared}
          canDrop={canDrop} onDrop={onDrop} dropLabel={dropLabel}
          onUndo={undo} canUndo={!!used && !busy && !playing} menu={menu} menuNote={menuNote} />

        {showClear && (
          <ClearPopup replay={clearedBy === "replay"} used={used} minMoves={minMoves} onReset={reset} onNext={() => newPuzzle()} onClose={() => setShowClear(false)} />
        )}

        {screen === "title" && <TitleScreen config={config} onStart={start} />}
      </div>
    </I18nProvider>
  );
}
