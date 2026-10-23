// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

import { describe, expect, test } from "bun:test";
import { EXPECTED_PASSCODE, GRID, WALK_TRACE } from "../../src/engine/befunge93.js";
import {
  MAX_LOG_ENTRIES,
  canStart,
  canStep,
  createInitialModel,
  deriveProgress,
  evaluatePasscodeCandidate,
  getTempoDelayMs,
  inspectGridCell,
  runSelfChecks,
  update,
} from "../../src/engine/game-state.js";

describe("TEA Game State & Recon Bug Regressions (Categories 1, 7, 13)", () => {
  test("Regression R-01: boot self-checks run and record 5/5 invariants in initial model", () => {
    const model = createInitialModel();
    expect(model.selfChecksPassed).toBe(true);
    expect(model.selfCheckReport).toHaveLength(5);
    expect(model.selfCheckReport.every((c) => c.passed)).toBe(true);
    expect(model.log.some((line) => line.includes("[selfcheck] 5/5 invariants verified"))).toBe(true);
  });

  test("Regression R-02: 18th stage completes immediately without requiring a phantom 19th tick", () => {
    let state = update(createInitialModel(), { type: "Start" });
    expect(state.running).toBe(true);

    for (let i = 0; i < WALK_TRACE.length; i += 1) {
      state = update(state, { type: "Tick" });
    }

    expect(state.stage).toBe(18);
    expect(deriveProgress(state)).toBe(100);
    expect(state.completed).toBe(true);
    expect(state.running).toBe(false);
    expect(state.output).toBe(EXPECTED_PASSCODE);
    expect(state.ip).toEqual([9, 9]);
  });

  test("Regression R-03: Start, Step, and Tick are idempotent no-ops once completed", () => {
    let state = createInitialModel();
    for (let i = 0; i < WALK_TRACE.length; i += 1) {
      state = update(state, { type: "Step" });
    }
    const logCountAtCompletion = state.log.length;
    expect(canStart(state)).toBe(false);
    expect(canStep(state)).toBe(false);

    const afterStart = update(state, { type: "Start" });
    const afterStep = update(afterStart, { type: "Step" });
    const afterTick = update(afterStep, { type: "Tick" });

    expect(afterTick.log.length).toBe(logCountAtCompletion);
    expect(afterTick.running).toBe(false);
  });

  test("Regression R-04: swap opcode '\\' at (1, 9) matches self-check invariant", () => {
    expect(GRID[1][9]).toBe("\\");
    const mutated = GRID.map((r) => r.slice());
    mutated[1][9] = " ";
    const broken = runSelfChecks({ grid: mutated });
    expect(broken.ok).toBe(false);
    expect(broken.checks.find((c) => c.id === "swap-glyph-at-1-9")?.passed).toBe(false);
  });

  test("lifecycle transitions: Start -> Pause -> SetTempo -> Step -> Reset", () => {
    let state = createInitialModel();
    state = update(state, { type: "SetTab", tab: "trace" });
    expect(state.tab).toBe("trace");

    state = update(state, { type: "SetTempo", tempo: "ludicrous" });
    expect(state.tempo).toBe("ludicrous");
    expect(getTempoDelayMs(state.tempo)).toBe(120);

    state = update(state, { type: "Start" });
    expect(state.running).toBe(true);

    // Stepping while running advances one stage and pauses automatic playback
    state = update(state, { type: "Step" });
    expect(state.stage).toBe(1);
    expect(state.running).toBe(false);

    // Reset preserves tab & tempo while clearing stage, output, and completion
    state = update(state, { type: "Reset" });
    expect(state.stage).toBe(0);
    expect(state.output).toBe("");
    expect(state.tab).toBe("trace");
    expect(state.tempo).toBe("ludicrous");
  });

  test("passcode evaluation tracks attempts and leading-digit prefix matches", () => {
    expect(evaluatePasscodeCandidate("98200000")).toEqual({
      valid: false,
      status: "invalid",
      matchedDigits: 3,
    });

    let state = createInitialModel();
    state = update(state, { type: "InputPasscode", value: "98000000" });
    state = update(state, { type: "SubmitPasscode" });
    expect(state.attempts).toBe(1);
    expect(state.passcodeStatus).toBe("invalid");
    expect(state.matchedPrefixDigits).toBe(2);

    state = update(state, { type: "InputPasscode", value: `  ${EXPECTED_PASSCODE}  ` });
    state = update(state, { type: "SubmitPasscode" });
    expect(state.attempts).toBe(2);
    expect(state.passcodeStatus).toBe("valid");
    expect(state.matchedPrefixDigits).toBe(8);
  });

  test("cell selection & inspector validate coordinates and reject unknown messages", () => {
    const info = inspectGridCell(9, 9);
    expect(info?.glyph).toBe("@");
    expect(info?.stageHits).toContain(18);
    expect(inspectGridCell(-1, 0)).toBeNull();
    expect(inspectGridCell(0, 10)).toBeNull();

    const state = createInitialModel();
    expect(update(state, { type: "SelectCell", row: 4, col: 3 }).selectedCell).toEqual([4, 3]);
    expect(update(state, { type: "SelectCell", row: 99, col: 0 })).toBe(state);
    expect(update(state, { type: "SelectCell", row: 1.5, col: 2 })).toBe(state);
    expect(update(state, { type: "UnknownAction" })).toBe(state);
    expect(update(state, null)).toBe(state);
  });

  test("Saturation: SetTab covers all 4 tabs, rejects invalid tabs, and Pause/SetTempo are idempotent", () => {
    let state = createInitialModel();
    for (const tab of ["trace", "about", "telemetry", "vault"]) {
      state = update(state, { type: "SetTab", tab });
      expect(state.tab).toBe(tab);
      // Same tab is reference-identical no-op
      expect(update(state, { type: "SetTab", tab })).toBe(state);
    }
    expect(update(state, { type: "SetTab", tab: "nonexistent" })).toBe(state);

    // Pause when already paused is reference-identical no-op
    expect(update(state, { type: "Pause" })).toBe(state);
    // Tick when paused is reference-identical no-op
    expect(update(state, { type: "Tick" })).toBe(state);
    // SetTempo to current tempo or invalid tempo is reference-identical no-op
    expect(update(state, { type: "SetTempo", tempo: "brisk" })).toBe(state);
    expect(update(state, { type: "SetTempo", tempo: "warp-9" })).toBe(state);
    expect(getTempoDelayMs("unknown-tempo")).toBe(420);
  });

  test("Saturation: InputPasscode preserves valid status iff trimmed input still matches, and RunSelfCheck appends log", () => {
    let state = createInitialModel();
    state = update(state, { type: "InputPasscode", value: EXPECTED_PASSCODE });
    state = update(state, { type: "SubmitPasscode" });
    expect(state.passcodeStatus).toBe("valid");

    // Trailing whitespace edit keeps valid status
    state = update(state, { type: "InputPasscode", value: `${EXPECTED_PASSCODE} ` });
    expect(state.passcodeStatus).toBe("valid");

    // Changing one digit resets status to idle
    state = update(state, { type: "InputPasscode", value: "98261040" });
    expect(state.passcodeStatus).toBe("idle");

    const beforeLen = state.log.length;
    state = update(state, { type: "RunSelfCheck" });
    expect(state.selfChecksPassed).toBe(true);
    expect(state.log.length).toBe(beforeLen + 1);
  });

  test("Saturation: runSelfChecks detects missing @ terminator and malformed grid shapes", () => {
    expect(runSelfChecks({ grid: [] }).ok).toBe(false);
    const noAt = GRID.map((r) => r.slice());
    noAt[9][9] = " ";
    const rep = runSelfChecks({ grid: noAt });
    expect(rep.ok).toBe(false);
    expect(rep.checks.find((c) => c.id === "terminator-at-9-9")?.passed).toBe(false);
    expect(rep.checks.find((c) => c.id === "vm-equivalence")?.passed).toBe(false);
  });

  test("Bounded TEA log ring caps state.log at MAX_LOG_ENTRIES across long runs", () => {
    let state = createInitialModel();
    for (let i = 0; i < MAX_LOG_ENTRIES + 60; i += 1) {
      state = update(state, { type: "RunSelfCheck" });
    }
    expect(state.log.length).toBe(MAX_LOG_ENTRIES);
    expect(state.log[state.log.length - 1]).toContain("[selfcheck]");
  });

  test("Multi-level puzzle selector (SelectLevel) switches cleanly across torus-wrap and self-mod-cipher", () => {
    let state = createInitialModel();
    expect(state.levelId).toBe("vault-alpha");

    // Selecting current or unknown level is a reference-identical no-op
    expect(update(state, { type: "SelectLevel", levelId: "vault-alpha" })).toBe(state);
    expect(update(state, { type: "SelectLevel", levelId: "nonexistent" })).toBe(state);

    // Switch to Level 2 (torus-wrap -> 31956402)
    state = update(state, { type: "SelectLevel", levelId: "torus-wrap" });
    expect(state.levelId).toBe("torus-wrap");
    expect(state.selfChecksPassed).toBe(true);
    state = update(state, { type: "InputPasscode", value: "31956402" });
    state = update(state, { type: "SubmitPasscode" });
    expect(state.passcodeStatus).toBe("valid");

    // Switch to Level 3 (self-mod-cipher -> 68025714)
    state = update(state, { type: "SelectLevel", levelId: "self-mod-cipher" });
    expect(state.levelId).toBe("self-mod-cipher");
    expect(state.selfChecksPassed).toBe(true);
    while (!state.completed) {
      state = update(state, { type: "Step" });
    }
    expect(state.output).toBe("68025714");
    state = update(state, { type: "InputPasscode", value: state.output });
    state = update(state, { type: "SubmitPasscode" });
    expect(state.passcodeStatus).toBe("valid");
  });
});
