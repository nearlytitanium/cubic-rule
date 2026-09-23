/* Every number that was found by experiment lives here. */
export const TUNING = {
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
