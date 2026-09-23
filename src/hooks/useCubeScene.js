import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { DIRS } from "../engine/rules.js";
import { HEX, SP, GESTURE, REPLAY, addLights } from "../ui/theme.js";

/* ═══════════════════════════════════════════════════════════════
   useCubeScene — everything three.js.
   The camera is fixed; the cube itself turns, so gravity is always
   world-down and "which face is at the bottom" is the player's choice.
   ═══════════════════════════════════════════════════════════════ */
export function useCubeScene({ mountRef, engineRef, gameRef, sizeRef, onCleared, onDownDir }) {
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

    addLights(THREE, scene);

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
    /* a timed turn (solution replay, restarts); null means the snappy chase below */
    let turn = null;
    /* the pose a puzzle was first shown in; restarts return to it exactly */
    const startPose = new THREE.Quaternion();
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

    /* turn so that `dir` is at the bottom (used when replaying a solution),
       and whether the cube has finished turning */
    /* ease "inOut" for turns the player watches (replay, restart);
       "out" for key presses, so the cube answers the key at once */
    const turnTo = (to, quarter = REPLAY.turn, ease = "inOut") => {
      const angle = orient.angleTo(to);
      if (angle > 0.01) turn = { from: orient.clone(), t0: performance.now(), dur: quarter * Math.sqrt(angle / (Math.PI / 2)), ease };
      target.copy(to);
    };
    const face = (dir) => { turnTo(poseFor(dir, target)); announceDown(); invalidate(); };
    const posed = () => cube.quaternion.equals(target);

    const rotate = (which) => {
      if (gameRef.current.anim) return;
      const q = new THREE.Quaternion();
      if (which === "up") q.setFromAxisAngle(AX_X, -Math.PI / 2);
      else if (which === "down") q.setFromAxisAngle(AX_X, Math.PI / 2);
      else if (which === "left") q.setFromAxisAngle(AX_Y, -Math.PI / 2);
      else q.setFromAxisAngle(AX_Y, Math.PI / 2);
      turnTo(target.clone().premultiply(q), GESTURE.keyTurn, "out");
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

    /* blocks shrinking away. They are out of g.meshes (a restart reuses
       the same ids) and each fades on its own clock in the loop, so they
       can start leaving before the next board even exists. */
    let leaving = [];
    const dropMesh = (m) => { group.remove(m); if (m.userData.tmp) m.material.dispose(); };
    const flushLeaving = () => { leaving.forEach(dropMesh); leaving = []; };
    const clearOut = () => {
      const g = gameRef.current, now = performance.now();
      for (const [, m] of g.meshes) { m.userData.leaveAt = now; leaving.push(m); }
      g.meshes = new Map();
      g.anim = null;
      invalidate();
    };

    /* opts.restart: the current blocks shrink away, the cube turns to the
       starting pose, then the blocks appear layer by layer from the floor
       up. opts.fresh marks a new puzzle, whose starting pose is chosen now
       (the nearest one with its gravity face down) and remembered. */
    const build = (board, blk, colorOf, dir, opts = {}) => {
      const g = gameRef.current;
      if (opts.restart) clearOut();
      else { flushLeaving(); for (const [, m] of g.meshes) dropMesh(m); }
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
        m.userData.at = [x, y, z];
        m.position.set(gp(x), gp(y), gp(z));
        m.visible = !opts.restart;
        group.add(m); g.meshes.set(bid, m);
      }
      setBlockers(blockerPos);
      g.board = R.clone(board); g.blk = blk; g.colorOf = colorOf; g.dir = dir;
      g.anim = null; g.used = 0;
      /* pose: snap to the gravity direction (new puzzle, reset), or turn
         towards a given face while the blocks rewind underneath */
      if (opts.restart) {
        if (opts.fresh) startPose.copy(poseFor(dir, target));
        turnTo(startPose.clone());
        const { ax, sg } = DIRS[dir];
        const items = [];
        for (const [bid, m] of g.meshes) {
          const c = m.userData.at[ax];
          items.push({ id: bid, delay: (sg < 0 ? c : n - 1 - c) * SPAWN_STAGGER });
        }
        const last = items.reduce((mx, it) => Math.max(mx, it.delay), 0);
        g.anim = { segs: [{ type: "spawn", items, dur: last + SPAWN, waitPose: true }], i: 0, t0: performance.now() };
      } else if (opts.poseDir != null) {
        target.copy(poseFor(opts.poseDir, target));
      } else if (!opts.keepOrientation) {
        target.copy(poseFor(dir, target));
        startPose.copy(target);
        orient.copy(target);
        turn = null;
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
    const VANISH = 240, SPAWN = 320, SPAWN_STAGGER = 70;
    const fading = (m) => {
      if (!m.userData.tmp) { m.material = matByColor[m.userData.ci].clone(); m.material.transparent = true; m.userData.tmp = true; }
      return m.material;
    };
    const advance = () => {
      const g = gameRef.current, a = g.anim; if (!a) return;
      const seg = a.segs[a.i];
      if (!seg) { g.anim = null; snap(); return; }
      /* a segment can wait for the cube to finish turning and the old
         blocks to finish leaving */
      if (seg.waitPose && (leaving.length || !cube.quaternion.equals(target))) { a.t0 = performance.now(); return; }
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
      } else if (seg.type === "spawn") {
        for (const it of seg.items) {
          const m = g.meshes.get(it.id); if (!m) continue;
          const u = Math.min(1, (elapsed - it.delay) / SPAWN);
          if (u <= 0) continue;
          const e = 1 - Math.pow(1 - u, 3);
          m.visible = true;
          const sc = 0.3 + 0.7 * e;
          m.scale.set(sc, sc, sc);
          fading(m).opacity = e;
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
        if (turn) {
          const u = Math.min(1, (performance.now() - turn.t0) / turn.dur);
          const e = turn.ease === "out" ? 1 - Math.pow(1 - u, 3)
            : u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
          orient.slerpQuaternions(turn.from, target, e);
          if (u >= 1) { orient.copy(target); turn = null; }
        } else {
          orient.slerp(target, 0.28);
          if (orient.angleTo(target) < 0.01) orient.copy(target);
        }
        cube.quaternion.copy(orient);
        invalidate();
      }
      if (leaving.length) {
        const now = performance.now();
        leaving = leaving.filter((m) => {
          const u = Math.min(1, (now - m.userData.leaveAt) / VANISH);
          if (u >= 1) { dropMesh(m); return false; }
          const e = u * u, sc = 1 - 0.7 * e;
          m.scale.set(sc, sc, sc);
          fading(m).opacity = 1 - e;
          return true;
        });
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
      turn = null;
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

    /* the mount can change size without the window resizing (the layout
       switches between portrait and landscape), so watch the element */
    const onResize = () => {
      if (!el.clientWidth) return;
      cam.aspect = el.clientWidth / el.clientHeight; cam.updateProjectionMatrix();
      rend.setSize(el.clientWidth, el.clientHeight); frame();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    api.current = { build, snap, setCage, setInsets, invalidate, gp, rotate, face, posed, clearOut, downDir, capturePositions, rewind, FALL_BASE, FALL_PER_UNIT, SQUASH };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
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
