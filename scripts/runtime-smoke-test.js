// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Runtime-portable verification suite executed when `scripts.test` runs under
 * secondary runtimes (`deno task test`, `pnpm run test` without Bun).
 * Under Bun (`bun test`), the full unit + Vue SFC DOM + property + R10 wrongness
 * + benchmark suites in `tests/` execute directly.
 */

import { readFileSync } from "node:fs";
import process from "node:process";
import {
  EXPECTED_PASSCODE,
  GRID,
  WALK_TRACE,
  executeProgram,
} from "../src/engine/befunge93.js";
import {
  createInitialModel,
  deriveProgress,
  runSelfChecks,
  update,
} from "../src/engine/game-state.js";
import { checkJcsBytes } from "./jcs-canon.js";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const jcs = checkJcsBytes(readFileSync("package.json", "utf8"));
assert(jcs.ok, "package.json must remain RFC 8785 JCS canonical");

const vmResult = executeProgram(GRID, { maxSteps: 500 });
assert(vmResult.halted, "Befunge-93 VM must halt on canonical 10x10 grid");
assert(vmResult.output === EXPECTED_PASSCODE, `VM output ${vmResult.output} must match ${EXPECTED_PASSCODE}`);
assert(vmResult.stack.length === 0, "VM stack must be empty at halt");

let state = createInitialModel();
assert(state.selfChecksPassed === true, "Boot self-checks must pass");
const checks = runSelfChecks({ grid: GRID });
assert(checks.ok && checks.passedCount === 5, "All 5 structural/VM self-checks must pass");

for (let i = 0; i < WALK_TRACE.length; i += 1) {
  state = update(state, { type: "Step" });
}
assert(state.completed === true, "Model must mark completed on 18th stage");
assert(deriveProgress(state) === 100, "Progress must equal 100% at stage 18");
assert(state.output === EXPECTED_PASSCODE, "Walk trace final output must match passcode");

state = update(state, { type: "InputPasscode", value: EXPECTED_PASSCODE });
state = update(state, { type: "SubmitPasscode" });
assert(state.passcodeStatus === "valid", "Correct passcode must unlock the vault");

console.log("js-runtimes-test-ran: portable Befunge-93 VM + TEA + JCS suite passed");
if (typeof process !== "undefined" && typeof process.exit === "function") {
  process.exit(0);
}
