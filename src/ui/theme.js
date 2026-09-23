/* VIEW — presentation constants */
export const PAPER = "#E7ECEF", CARD = "#F5F8FA", INK = "#132133", MUTE = "#6B7B8C", RULE = "#B9C4CC", ACCENT = "#C8102E";
/* block colours: crimson (the accent), azure, saffron, and a green for a
   fourth colour. Picked to stay apart for red-green colour blindness too. */
export const HEX = [0xC8102E, 0x2A86D9, 0xF0B429, 0x2FA36B];
/* three.js divides diffuse light by π, so the intensities carry that
   factor. With the key mostly overhead, tops show about the colour
   above, fronts ~75% and sides ~65% (in linear light), which reads as
   solid without going muddy. */
export const LIGHTS = {
  ambient: 0.45 * Math.PI,
  key: { intensity: 0.6 * Math.PI, color: 0xffffff, at: [4, 10, 6] },
  fill: { intensity: 0.25 * Math.PI, color: 0xBFD4E0, at: [-6, -2, -5] },
};
export function addLights(THREE, scene) {
  scene.add(new THREE.AmbientLight(0xffffff, LIGHTS.ambient));
  for (const l of [LIGHTS.key, LIGHTS.fill]) {
    const d = new THREE.DirectionalLight(l.color, l.intensity);
    d.position.set(...l.at);
    scene.add(d);
  }
}
export const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
export const SP = 1.06;
/* gesture feel: the cube follows the finger, resists past a quarter turn,
   and either completes or springs back on release */
export const GESTURE = {
  deadzone: 8,      /* px before an axis is chosen */
  quarter: 96,      /* px of drag that equals a 90° turn */
  commit: 42,       /* px past which the turn completes on release */
  resist: 0.22,     /* how much of the drag still registers past 90° */
  overshoot: 1.12,  /* hard stop for the preview, in quarter turns */
  keyTurn: 360,     /* ms for a quarter turn from the arrow / WASD keys */
};
/* solution replay pace: a quarter turn takes `turn` ms (a half turn a
   little longer), then the cube holds still for `hold` ms before it drops */
export const REPLAY = { turn: 700, hold: 280 };
