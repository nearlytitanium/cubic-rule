/* the same property tests the app runs at start-up, from the command line */
import { runSelfTest } from "../src/engine/selftest.js";

const t0 = performance.now();
const fails = runSelfTest();
const ms = Math.round(performance.now() - t0);
if (fails.length) {
  console.error(`self-test failed (${ms} ms): ${fails.join(", ")}`);
  process.exit(1);
}
console.log(`self-test passed (${ms} ms)`);
