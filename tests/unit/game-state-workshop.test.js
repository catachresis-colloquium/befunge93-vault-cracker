// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Custom Vault Workshop mode (v0.4.0): TEA reducer, grid authoring,
 * bounded `maxSteps`, JS VM vs native Zig C-ABI lockstep, and RFC 8785 JCS /
 * base64url challenge descriptors.
 *
 * Per Rule R10 (`TEST-DOCTRINE.adoc`): negative fixtures (mutated grids,
 * tampered challenge descriptors, out-of-bounds bounds) are synthesized IN
 * MEMORY at test runtime and never committed as static estate files.
 */

import { describe, expect, test } from "bun:test";
import { EXPECTED_PASSCODE, GRID } from "../../src/engine/befunge93.js";
import { createInitialModel, update } from "../../src/engine/game-state.js";
import {
  VAULT_MODE,
  WORKSHOP_MODE,
  WORKSHOP_MAX_STEPS_CAP,
  base64urlDecode,
  base64urlEncode,
  deriveWorkshopTrace,
  gridsEqual,
  makeWorkshopChallengeId,
  verifyWorkshopChallengeId,
} from "../../src/engine/workshop.js";

const TEXT_DECODER = new TextDecoder();

function gridWithOneCellFlipped(grid) {
  const copy = grid.map((row) => row.slice());
  copy[0][0] = copy[0][0] === "@" ? " " : "@";
  return copy;
}

describe("Custom Vault Workshop (v0.4.0): TEA authoring mode", () => {
  test("initial model is in vault mode with no workshop state", () => {
    const model = createInitialModel();
    expect(model.mode).toBe(VAULT_MODE);
    expect(model.workshop).toBeNull();
  });

  test("EnterWorkshop switches mode and snapshots the level grid", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });
    expect(state.mode).toBe(WORKSHOP_MODE);
    expect(state.workshop.grid).toHaveLength(10);
    expect(state.workshop.grid[0]).toHaveLength(10);
    expect(state.workshop.maxSteps).toBe(500);
    expect(state.workshop.trace).toEqual([]);
    expect(state.workshop.agreement).toBeNull();
    expect(state.workshop.challengeId).toBeNull();
    expect(state.workshop.challengeValid).toBeNull();
    expect(state.log.some((entry) => entry.includes("[workshop] Entered"))).toBe(true);
  });

  test("EnterWorkshop on an already-open workshop is a no-op", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });
    const before = state;
    state = update(state, { type: "EnterWorkshop" });
    expect(state).toBe(before);
  });

  test("LeaveWorkshop returns to vault play", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });
    state = update(state, { type: "LeaveWorkshop" });
    expect(state.mode).toBe(VAULT_MODE);
    expect(state.workshop).toBeNull();
    expect(state.log.some((entry) => entry.includes("[workshop] Returned"))).toBe(true);
  });

  test("LeaveWorkshop outside workshop mode is a no-op", () => {
    const state = createInitialModel();
    expect(update(state, { type: "LeaveWorkshop" })).toBe(state);
  });

  test("SetWorkshopCell mutates one cell and clears derived state", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });
    state = update(state, {
      type: "SetWorkshopCell",
      row: 3,
      col: 4,
      glyph: "?",
    });
    expect(state.workshop.grid[3][4]).toBe("?");
    expect(state.workshop.selectedCell).toEqual([3, 4]);
    expect(state.workshop.trace).toEqual([]);
    expect(state.workshop.agreement).toBeNull();
    expect(state.workshop.challengeId).toBeNull();
    expect(state.workshop.challengeValid).toBeNull();
  });

  test("SetWorkshopCell rejects out-of-bounds coordinates", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });
    const before = state;
    expect(
      update(state, { type: "SetWorkshopCell", row: 10, col: 0, glyph: "@" }),
    ).toBe(before);
    expect(
      update(state, { type: "SetWorkshopCell", row: -1, col: 0, glyph: "@" }),
    ).toBe(before);
    expect(
      update(state, { type: "SetWorkshopCell", row: 0, col: 10, glyph: "@" }),
    ).toBe(before);
    expect(
      update(state, { type: "SetWorkshopCell", row: 0, col: 0, glyph: "ZZ" }),
    ).toBe(before);
    expect(
      update(state, { type: "SetWorkshopCell", row: 0, col: 0, glyph: "Z" }),
    ).toBe(before);
  });

  test("SetWorkshopCell rejects workshop-inactive messages", () => {
    const state = createInitialModel();
    expect(
      update(state, { type: "SetWorkshopCell", row: 0, col: 0, glyph: "@" }),
    ).toBe(state);
  });

  test("SetWorkshopGrid accepts a valid 10x10 grid and rejects malformed ones", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });
    const validGrid = GRID.map((row) => row.slice());
    state = update(state, { type: "SetWorkshopGrid", grid: validGrid });
    expect(state.workshop.grid[9][9]).toBe("@");

    const shortGrid = validGrid.slice(0, 9);
    expect(update(state, { type: "SetWorkshopGrid", grid: shortGrid })).toBe(state);
    const badCell = validGrid.map((row) => row.slice());
    badCell[5][5] = "Z";
    expect(update(state, { type: "SetWorkshopGrid", grid: badCell })).toBe(state);
  });

  test("SetWorkshopMaxSteps enforces the bounded range", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });
    state = update(state, { type: "DeriveWorkshopTrace" });
    expect(state.workshop.trace.length).toBeGreaterThan(0);

    const withTrace = state;
    expect(
      update(withTrace, { type: "SetWorkshopMaxSteps", maxSteps: 0 }),
    ).toBe(withTrace);
    expect(
      update(withTrace, { type: "SetWorkshopMaxSteps", maxSteps: 10001 }),
    ).toBe(withTrace);
    expect(
      update(withTrace, { type: "SetWorkshopMaxSteps", maxSteps: 500.5 }),
    ).toBe(withTrace);

    state = update(withTrace, { type: "SetWorkshopMaxSteps", maxSteps: 1 });
    expect(state.workshop.maxSteps).toBe(1);
    expect(state.workshop.trace).toEqual([]);

    state = update(state, { type: "SetWorkshopMaxSteps", maxSteps: WORKSHOP_MAX_STEPS_CAP });
    expect(state.workshop.maxSteps).toBe(WORKSHOP_MAX_STEPS_CAP);
  });

  test("DeriveWorkshopTrace runs the JS VM on the authored grid", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });
    state = update(state, { type: "DeriveWorkshopTrace" });
    const { workshop } = state;
    expect(workshop.jsResult.halted).toBe(true);
    expect(workshop.jsResult.output).toBe(EXPECTED_PASSCODE);
    expect(workshop.jsResult.steps).toBeGreaterThan(0);
    expect(workshop.trace.length).toBe(workshop.jsResult.steps + 1);
    expect(workshop.trace[0]).toEqual({
      row: 0,
      col: 0,
      dir: "right",
      instr: "0",
      output: "",
    });
    // Native oracle is unavailable in this container -> degraded JS-only path.
    expect(workshop.zigResult).toBeNull();
    expect(workshop.agreement).toBeNull();
  });

  test("WorkshopTraceDerived records JS/Zig lockstep results", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });
    const jsResult = { steps: 7, output: "98261047", halted: true };
    state = update(state, {
      type: "WorkshopTraceDerived",
      jsResult,
      zigResult: null,
      agreement: null,
    });
    expect(state.workshop.jsResult).toBe(jsResult);
    expect(state.workshop.agreement).toBeNull();

    // Synthetic Zig disagreement -> lockstep records false.
    state = update(state, {
      type: "WorkshopTraceDerived",
      jsResult: { steps: 3, output: "00000000", halted: true },
      zigResult: { steps: 3, output: "11111111", halted: true },
      agreement: false,
    });
    expect(state.workshop.agreement).toBe(false);
    expect(
      state.log.some((entry) => entry.includes("Lockstep recorded")),
    ).toBe(true);
  });

  test("WorkshopTraceDerived rejects malformed payloads", () => {
    const state = createInitialModel();
    expect(update(state, { type: "WorkshopTraceDerived", msg: {} })).toBe(state);
    expect(
      update(state, { type: "WorkshopTraceDerived", msg: { jsResult: null } }),
    ).toBe(state);
  });

  test("SetWorkshopTraceView clamps into the trace range", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });
    state = update(state, { type: "DeriveWorkshopTrace" });
    const last = state.workshop.trace.length - 1;

    state = update(state, { type: "SetWorkshopTraceView", index: last });
    expect(state.workshop.traceViewIndex).toBe(last);

    state = update(state, { type: "SetWorkshopTraceView", index: 1000000 });
    expect(state.workshop.traceViewIndex).toBe(last);

    state = update(state, { type: "SetWorkshopTraceView", index: -5 });
    expect(state.workshop.traceViewIndex).toBe(0);

    state = update(state, { type: "SetWorkshopTraceView", index: 3 });
    expect(state.workshop.traceViewIndex).toBe(3);
  });

  test("MakeWorkshopChallenge + VerifyWorkshopChallenge round-trip", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });
    state = update(state, { type: "DeriveWorkshopTrace" });
    state = update(state, { type: "MakeWorkshopChallenge" });
    expect(typeof state.workshop.challengeId).toBe("string");
    expect(state.workshop.challengeId.length).toBeGreaterThan(0);
    expect(state.workshop.challengeValid).toBe(true);

    const verified = update(state, {
      type: "VerifyWorkshopChallenge",
      challengeId: state.workshop.challengeId,
    });
    expect(verified.workshop.challengeValid).toBe(true);
    expect(
      verified.log.some((entry) => entry.includes("Challenge descriptor verified")),
    ).toBe(true);
  });

  test("VerifyWorkshopChallenge rejects an unparseable descriptor", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });
    state = update(state, { type: "MakeWorkshopChallenge" });
    state = update(state, {
      type: "VerifyWorkshopChallenge",
      challengeId: "not-a-valid-descriptor!!!",
    });
    expect(state.workshop.challengeValid).toBe(false);
    expect(state.workshop.challengeId).toBe("not-a-valid-descriptor!!!");
  });
});

describe("Custom Vault Workshop (v0.4.0): RFC 8785 / base64url descriptors", () => {
  test("challenge id encodes the exact JCS payload", () => {
    const grid = GRID.map((row) => row.slice());
    const id = makeWorkshopChallengeId(grid, 500);
    const bytes = base64urlDecode(id);
    expect(bytes).not.toBeNull();
    const payload = JSON.parse(TEXT_DECODER.decode(bytes));
    expect(payload.maxSteps).toBe(500);
    expect(gridsEqual(payload.grid, grid)).toBe(true);
    // No padding, url-safe alphabet only.
    expect(/^[A-Za-z0-9_-]+$/.test(id)).toBe(true);
    expect(id.endsWith("=")).toBe(false);
  });

  test("R10 negative mutant: flipped grid glyph invalidates the descriptor", () => {
    const grid = GRID.map((row) => row.slice());
    const validId = makeWorkshopChallengeId(grid, 500);
    const mutantGrid = gridWithOneCellFlipped(grid);
    const mutantId = makeWorkshopChallengeId(mutantGrid, 500);
    expect(mutantId).not.toBe(validId);

    expect(verifyWorkshopChallengeId(mutantId, grid, 500).valid).toBe(false);
    expect(verifyWorkshopChallengeId(validId, mutantGrid, 500).valid).toBe(false);
  });

  test("R10 negative mutant: maxSteps mutation invalidates the descriptor", () => {
    const grid = GRID.map((row) => row.slice());
    const validId = makeWorkshopChallengeId(grid, 500);
    expect(verifyWorkshopChallengeId(validId, grid, 500).valid).toBe(true);
    expect(verifyWorkshopChallengeId(validId, grid, 501).valid).toBe(false);
    expect(verifyWorkshopChallengeId(validId, grid, 0).valid).toBe(false);
  });

  test("R10 negative mutant: truncated base64url descriptor is unparseable", () => {
    const grid = GRID.map((row) => row.slice());
    const validId = makeWorkshopChallengeId(grid, 500);
    const truncated = validId.slice(0, -1);
    expect(verifyWorkshopChallengeId(truncated, grid, 500).valid).toBe(false);
    expect(verifyWorkshopChallengeId("", grid, 500).valid).toBe(false);
  });

  test("R10 negative mutant: non-alphabet and padded descriptors are rejected", () => {
    const grid = GRID.map((row) => row.slice());
    const validId = makeWorkshopChallengeId(grid, 500);
    const corrupted = validId.slice(0, 3) + "/" + validId.slice(4);
    expect(corrupted).not.toBe(validId);
    expect(verifyWorkshopChallengeId(corrupted, grid, 500).valid).toBe(false);
    expect(verifyWorkshopChallengeId(`${validId}==`, grid, 500).valid).toBe(false);
    expect(verifyWorkshopChallengeId(`${validId}x`, grid, 500).valid).toBe(false);
  });
});

describe("Custom Vault Workshop (v0.4.0): JS vs Zig C-ABI lockstep", () => {
  test("deriveWorkshopTrace agrees with the native oracle when present, degrades gracefully otherwise", async () => {
    const derived = await deriveWorkshopTrace(GRID.map((row) => row.slice()), 500);
    expect(derived.jsResult.halted).toBe(true);
    expect(derived.jsResult.output).toBe(EXPECTED_PASSCODE);
    expect(derived.trace.length).toBe(derived.jsResult.steps + 1);
    // agreement: null = native oracle unavailable (JS-only container),
    // true = lockstep with the Zig C-ABI. Both are valid v0.4.0 outcomes.
    expect([null, true]).toContain(derived.agreement);
    if (derived.agreement !== null) {
      expect(derived.zigResult.halted).toBe(derived.jsResult.halted);
      expect(derived.zigResult.output).toBe(derived.jsResult.output);
    }
  });
});
