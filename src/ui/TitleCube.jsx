import { useEffect, useRef } from "react";
import * as THREE from "three";
import { HEX, SP, addLights } from "./theme.js";

/* a small board for the title screen: the cage, a few blocks and grey
   blockers, turning a quarter at a time the way the player turns it. It
   has its own renderer, so it knows nothing about the game's scene. */
const N = 4;
const BLOCKS = [
  /* [x, y, z, colour index] — colour 3 is a blocker */
  [0, 0, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [1, 0, 1, 0], [0, 1, 1, 0],
  [3, 0, 3, 1], [3, 1, 3, 1], [2, 0, 3, 1], [3, 0, 2, 1],
  [2, 0, 0, 2], [3, 0, 0, 2],
  [1, 2, 1, -1], [2, 1, 2, -1], [0, 2, 3, -1],
];
const TURN = 900, PAUSE = 900;

export function TitleCube({ size = 180 }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const rend = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    rend.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rend.setSize(size, size);
    el.appendChild(rend.domElement);

    const scene = new THREE.Scene();
    addLights(THREE, scene);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    cam.position.set(0, 0, 15.5); cam.lookAt(0, 0, 0);

    /* the tilt shows three faces; the quarter turns happen inside it */
    const tilt = new THREE.Group();
    tilt.rotation.set(0.42, -0.62, 0);
    scene.add(tilt);
    const cube = new THREE.Group(); tilt.add(cube);

    const side = N * SP;
    const cageGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(side, side, side));
    const cageMat = new THREE.LineBasicMaterial({ color: 0x132133, transparent: true, opacity: 0.45 });
    cube.add(new THREE.LineSegments(cageGeo, cageMat));

    const gp = (i) => (i - (N - 1) / 2) * SP;
    const blockGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const blockerGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    const mats = HEX.map((h) => new THREE.MeshLambertMaterial({ color: h }));
    const blockerMat = new THREE.MeshLambertMaterial({ color: 0x93A1AD, transparent: true, opacity: 0.3, depthWrite: false });
    const edgeGeo = new THREE.EdgesGeometry(blockerGeo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x132133, transparent: true, opacity: 0.35 });
    for (const [x, y, z, c] of BLOCKS) {
      const m = c < 0 ? new THREE.Mesh(blockerGeo, blockerMat) : new THREE.Mesh(blockGeo, mats[c]);
      m.position.set(gp(x), gp(y), gp(z));
      cube.add(m);
      if (c < 0) { const e = new THREE.LineSegments(edgeGeo, edgeMat); e.position.copy(m.position); cube.add(e); }
    }

    /* quarter turns about the screen's axes, eased, with a rest between */
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
    const from = new THREE.Quaternion(), to = new THREE.Quaternion(), q = new THREE.Quaternion();
    let t0 = performance.now(), lastAxis = -1;
    const nextTurn = () => {
      let a; do a = (Math.random() * 3) | 0; while (a === lastAxis);
      lastAxis = a;
      from.copy(cube.quaternion);
      q.setFromAxisAngle(AXES[a], (Math.random() < 0.5 ? -1 : 1) * Math.PI / 2);
      to.copy(from).premultiply(q);
    };
    nextTurn();

    let raf;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = performance.now() - t0;
      if (t < TURN) {
        const u = t / TURN;
        cube.quaternion.slerpQuaternions(from, to, u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
      } else if (t < TURN + PAUSE) {
        cube.quaternion.copy(to);
      } else {
        t0 = performance.now(); nextTurn();
      }
      rend.render(scene, cam);
    };
    if (still) rend.render(scene, cam); else tick();

    return () => {
      cancelAnimationFrame(raf);
      cageGeo.dispose(); cageMat.dispose(); blockGeo.dispose(); blockerGeo.dispose();
      edgeGeo.dispose(); edgeMat.dispose(); blockerMat.dispose(); mats.forEach((m) => m.dispose());
      rend.dispose();
      rend.domElement.remove();
    };
  }, [size]);

  return <div ref={ref} aria-hidden="true" style={{ width: size, height: size }} />;
}
