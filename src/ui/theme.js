/* VIEW — presentation constants */
export const PAPER = "#E7ECEF", CARD = "#F5F8FA", INK = "#132133", MUTE = "#6B7B8C", RULE = "#B9C4CC", ACCENT = "#C8102E";
export const HEX = [0xC8102E, 0x0E7C8C, 0xE0A02E, 0x5B4B8A];
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
};
