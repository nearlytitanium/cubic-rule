/* BGM, as one DiscoFunc track (https://discofunc.com): a formula of the
   step n, ";" separating voices. Everything the game does is expressed
   through two live variables, so the loop never has to be swapped or
   paused (a paused player keeps its already-scheduled notes and plays
   them on resume):

     x — how far into the puzzle: 0.25 at the start → 1 at the par move
         count → up to 2 well past it. Low x plays the lead on every other
         step at a small range, higher x fills it in, and past 1 an
         off-grid wobble creeps in.
     y — the scene: 1 solving (DiscoFunc's default, so it is right even
         before the first message), 2 the clear phrase, 3 silence.

   The clear phrase is the same theme an octave up on every step over a
   lighter bed, so it joins the loop naturally wherever it comes in.
   Scores from DiscoFunc's evaluate_bgm (taste_match 0..1): start chill
   1.00, at par chill 0.84, well past par thrill 0.72, clear pop 0.91. */
const LEAD = "(-sin(n/2.6)*3*min(x,1) + cos(n/5.5)*2 + max(0,x-1)*((n%3)-1)) / ((n%2==0 or x>0.7) ? 1 : 0)";
const LEAD_CLEAR = "-sin(n/2.6)*3 + cos(n/5.5)*2 + 7";
const BED = "floor(sin(n/3.7)*1.5+cos(n/6.3))-5";
const BED_CLEAR = "(n%2==0 ? floor(sin(n/3.7)*1.5+cos(n/6.3))-3 : NaN)";
const byScene = (solving, clear) => `y<1.5 ? ${solving} : (y<2.5 ? ${clear} : NaN)`;

export const TRACK = {
  f: `${byScene(LEAD, LEAD_CLEAR)} ; ${byScene(BED, BED_CLEAR)}`,
  steps: 16, bpm: 84, scale: "majorPentatonic", root: "D",
  voice: ["marimba", "pluck"], tone: [55, 38], vol: [62, 58], gate: [70, 45], rev: 45, dly: 22,
};

export const SCENE = { solving: 1, clear: 2, silent: 3 };
/* how long the clear phrase plays before falling silent, in steps */
export const CLEAR_STEPS = 12;

/* live variables for the formula and continuous knobs for the player
   (applied as smooth ramps) while solving */
export function moodFor(used, minMoves) {
  const par = Math.max(1, minMoves || 1);
  const p = Math.min(1, used / par);
  const over = Math.min(1, Math.max(0, (used - par) / Math.max(2, par)));
  return {
    vars: { x: 0.25 + 0.75 * p + over, y: SCENE.solving },
    params: { bpm: Math.round(TRACK.bpm + 20 * p + 12 * over), rev: Math.round(TRACK.rev - 20 * p) },
  };
}

/* the title plays the track as a puzzle starts, so beginning one carries
   straight on without a change */
export const TITLE_MOOD = moodFor(0, 1);
