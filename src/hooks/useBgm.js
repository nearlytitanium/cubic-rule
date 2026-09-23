import { useCallback, useEffect, useRef, useState } from "react";
import { TRACK, SCENE, CLEAR_STEPS, TITLE_MOOD, moodFor } from "../audio/tracks.js";

/* the published DiscoFunc client (an iframe player driven by postMessage).
   Loaded at run time, so a missing network just means no music. */
const ORIGIN = "https://discofunc.com";
const LIB = `${ORIGIN}/discofunc-embed.js`;
const PREF_KEY = "cubicrule.bgm";
const VOLUME = 0.7;

/* "on" | "off" | null (never asked) */
const readPref = () => { try { const v = localStorage.getItem(PREF_KEY); return v === "on" || v === "off" ? v : null; } catch { return null; } };
const writePref = (on) => { try { localStorage.setItem(PREF_KEY, on ? "on" : "off"); } catch { /* not kept */ } };

/* ═══════════════════════════════════════════════════════════════
   useBgm — owns the player. The game only says which scene it is in
   ("title" | "play" | "clear") and how far the current puzzle has got;
   both reach the one looping track as its live variables (see tracks.js).
   Browsers keep audio locked until the page gets a gesture, so the
   first visit asks (the answer's own tap unlocks it); later visits start
   on the first tap or key. The player's own ▶ also works, and pausing
   it there is remembered as "BGM off".
   ═══════════════════════════════════════════════════════════════ */
export function useBgm() {
  const mountRef = useRef(null);
  const playerRef = useRef(null);
  const sceneRef = useRef("title");
  const moodRef = useRef(TITLE_MOOD);
  const startedRef = useRef(false);
  const pendingRef = useRef(false); /* asked to play before the player existed */
  const silenceRef = useRef(0);     /* timer ending the clear phrase */
  const [pref, setPref] = useState(readPref);
  const prefRef = useRef(pref);
  const [available, setAvailable] = useState(true);
  /* this track opened in DiscoFunc's editor (the site's front page until the client loads) */
  const [trackUrl, setTrackUrl] = useState(ORIGIN);

  const remember = useCallback((on) => {
    const v = on ? "on" : "off";
    prefRef.current = v; setPref(v); writePref(on);
  }, []);

  /* the variables and knobs for the current scene. Clearing keeps the
     puzzle's x and tempo and flips y to the clear phrase, then, after
     CLEAR_STEPS steps at that tempo, to silence until the next puzzle. */
  const sendMood = useCallback(() => {
    const p = playerRef.current; if (!p) return;
    clearTimeout(silenceRef.current);
    const scene = sceneRef.current;
    const m = scene === "title" ? TITLE_MOOD : moodRef.current;
    if (scene !== "clear") { p.setVars(m.vars); p.setParams(m.params); return; }
    p.setVars({ ...m.vars, y: SCENE.clear });
    const stepMs = 60000 / m.params.bpm / 4;
    silenceRef.current = setTimeout(() => p.setVars({ y: SCENE.silent }), CLEAR_STEPS * stepMs);
  }, []);

  useEffect(() => {
    let alive = true, player = null, frame = null;
    import(/* @vite-ignore */ LIB)
      .then(({ DiscoFuncPlayer }) => {
        if (!alive || !mountRef.current) return;
        /* our own iframe, so it can refuse scrollbars. It is laid out wide
           enough for the player's whole bar (a narrow one overflows and
           shows scrollbars where they are not hidden) and the box crops it
           to the button: 56px tall with the button centred, the box shows
           the middle 44px. */
        frame = document.createElement("iframe");
        frame.src = `${ORIGIN}/#${DiscoFuncPlayer.buildHash(TRACK)}&embed=1`;
        frame.title = "DiscoFunc";
        frame.allow = "autoplay";
        frame.setAttribute("scrolling", "no");
        Object.assign(frame.style, {
          width: "200px", height: "56px", marginTop: "-6px",
          border: "none", background: "transparent", display: "block",
        });
        mountRef.current.appendChild(frame);
        player = new DiscoFuncPlayer({ iframe: frame });
        setTrackUrl(`${ORIGIN}/#${DiscoFuncPlayer.buildHash(TRACK)}`);
        player.setVolume(VOLUME);
        /* our code never pauses, so a pause came from the player's button */
        player.on("paused", () => remember(false));
        player.on("playing", () => { startedRef.current = true; remember(true); });
        playerRef.current = player;
        sendMood(); /* queued until the player is ready */
        if (pendingRef.current) { pendingRef.current = false; startedRef.current = true; player.play(); }
      })
      .catch((err) => { console.warn("BGM unavailable", err); if (alive) setAvailable(false); });
    return () => {
      alive = false;
      clearTimeout(silenceRef.current);
      player?.destroy();
      frame?.remove();
      playerRef.current = null;
    };
  }, [sendMood, remember]);

  const play = useCallback(() => {
    if (startedRef.current) return;
    const p = playerRef.current;
    if (!p) { pendingRef.current = true; return; }
    startedRef.current = true;
    p.play();
  }, []);

  /* later visits: the first gesture anywhere on the page starts the music
     (gestures inside the player's iframe never reach us; it handles those) */
  const unlock = useCallback(() => { if (prefRef.current === "on") play(); }, [play]);
  useEffect(() => {
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, [unlock]);

  /* the first-visit answer; call it from the click itself */
  const choose = useCallback((on) => { remember(on); if (on) play(); }, [remember, play]);

  const setScene = useCallback((name) => {
    if (sceneRef.current === name) return;
    sceneRef.current = name;
    sendMood();
  }, [sendMood]);

  /* while cleared the phrase is already under way; the move count does
     not change then, so only solving follows it */
  const setProgress = useCallback((used, minMoves) => {
    moodRef.current = moodFor(used, minMoves);
    if (sceneRef.current === "play") sendMood();
  }, [sendMood]);

  return { mountRef, available, trackUrl, asked: pref !== null, choose, setScene, setProgress };
}
