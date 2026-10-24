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
import { EXPECTED_PASSCODE, GRID, VAULT_LEVELS } from "../../src/engine/befunge93.js";
import { createInitialModel, update } from "../../src/engine/game-state.js";
import {
  VAULT_MODE,
  WORKSHOP_MODE,
  WORKSHOP_GLYPHS,
  WORKSHOP_MAX_STEPS_CAP,
  WORKSHOP_OPCODE_CYCLE,
  base64urlDecode,
  base64urlEncode,
  deriveWorkshopTrace,
  gridsEqual,
  isValidWorkshopGlyph,
  makeWorkshopChallengeId,
  validateWorkshopGrid,
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

  test("EnterWorkshop seeds a grid its own validator accepts, for every shipped level", () => {
    // Regression: the Workshop cloned the level grid but validated against a
    // 36-glyph opcode-only alphabet, so all three shipped levels -- whose
    // decorative ASCII art ('=====', 'VAULT!', '93-TEA') and `g`/`p` opcodes are
    // legal Befunge-93 -- opened in a state the Workshop itself rejected, and
    // every subsequent edit was silently discarded.
    for (const level of VAULT_LEVELS) {
      expect(validateWorkshopGrid(level.grid).ok).toBe(true);

      let state = createInitialModel(level.id);
      state = update(state, { type: "EnterWorkshop" });
      expect(state.mode).toBe(WORKSHOP_MODE);
      expect(validateWorkshopGrid(state.workshop.grid).ok).toBe(true);
      expect(state.workshop.lastError).toBeNull();

      // The editor must actually respond on the seeded grid.
      const edited = update(state, {
        type: "SetWorkshopCell",
        row: 5,
        col: 2,
        glyph: "g",
      });
      expect(edited.workshop.grid[5][2]).toBe("g");
      expect(edited.workshop.lastError).toBeNull();
    }
  });

  test("playfield alphabet is printable ASCII and the opcode cycle is a subset", () => {
    expect(WORKSHOP_GLYPHS.size).toBe(95);
    for (const glyph of WORKSHOP_GLYPHS) {
      expect(glyph.length).toBe(1);
      expect(glyph >= " " && glyph <= "~").toBe(true);
    }
    // Control characters and non-ASCII must stay out of the torus.
    for (const bad of ["\n", "\t", "\r", "\x00", "\x7f", "é", "…", ""]) {
      expect(isValidWorkshopGlyph(bad)).toBe(false);
    }
    expect(isValidWorkshopGlyph("gg")).toBe(false);

    // The UI authoring cycle must only offer glyphs that validate, and must
    // include the self-modifying pair the VMs dispatch on.
    for (const glyph of WORKSHOP_OPCODE_CYCLE) {
      expect(WORKSHOP_GLYPHS.has(glyph)).toBe(true);
    }
    expect(WORKSHOP_OPCODE_CYCLE).toContain("g");
    expect(WORKSHOP_OPCODE_CYCLE).toContain("p");
    expect(WORKSHOP_OPCODE_CYCLE).toContain("@");
    expect(new Set(WORKSHOP_OPCODE_CYCLE).size).toBe(WORKSHOP_OPCODE_CYCLE.length);
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

  test("SetWorkshopCell rejects out-of-bounds coordinates and unprintable glyphs", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });
    const gridBefore = state.workshop.grid.map((row) => row.slice());

    const rejected = [
      { row: 10, col: 0, glyph: "@" }, // row out of range
      { row: -1, col: 0, glyph: "@" }, // negative row
      { row: 0, col: 10, glyph: "@" }, // col out of range
      { row: 0, col: 0, glyph: "ZZ" }, // multi-character cell
      { row: 0, col: 0, glyph: "" }, // empty cell
      { row: 0, col: 0, glyph: "\n" }, // C0 control
      { row: 0, col: 0, glyph: "\x7f" }, // DEL
      { row: 0, col: 0, glyph: "é" }, // printable, but outside 0x20..0x7E
    ];

    for (const msg of rejected) {
      const next = update(state, { type: "SetWorkshopCell", ...msg });
      // A rejection must be observable, never silent: an unreported no-op is
      // indistinguishable from a frozen editor.
      expect(typeof next.workshop.lastError).toBe("string");
      expect(next.workshop.lastError.length).toBeGreaterThan(0);
      expect(next.log[next.log.length - 1]).toContain("[workshop:rejected]");
      // ...and it must leave the authored grid untouched.
      expect(next.workshop.grid).toEqual(gridBefore);
    }
  });

  test("SetWorkshopCell accepts any printable ASCII data glyph, incl. g and p", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });

    // `g`/`p` are the self-modifying opcodes that `stepVm` and the Zig C-ABI VM
    // both dispatch on; decorative glyphs such as '=' are legal no-op cells.
    for (const glyph of ["g", "p", "=", "Z", "~", "{", " ", '"']) {
      const next = update(state, { type: "SetWorkshopCell", row: 4, col: 4, glyph });
      expect(next.workshop.grid[4][4]).toBe(glyph);
      expect(next.workshop.lastError).toBeNull();
    }

    // Every printable ASCII code point is a legal cell.
    let accepted = 0;
    for (let code = 0x20; code <= 0x7e; code += 1) {
      const glyph = String.fromCharCode(code);
      const next = update(state, { type: "SetWorkshopCell", row: 0, col: 0, glyph });
      expect(next.workshop.grid[0][0]).toBe(glyph);
      accepted += 1;
    }
    expect(accepted).toBe(95);
  });

  test("SetWorkshopCell rejects workshop-inactive messages", () => {
    const state = createInitialModel();
    expect(
      update(state, { type: "SetWorkshopCell", row: 0, col: 0, glyph: "@" }),
    ).toBe(state);
  });

  test("SetWorkshopGrid accepts a valid 10x10 grid and reports malformed ones", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });
    const validGrid = GRID.map((row) => row.slice());
    state = update(state, { type: "SetWorkshopGrid", grid: validGrid });
    expect(state.workshop.grid[9][9]).toBe("@");
    expect(state.workshop.lastError).toBeNull();
    const accepted = state;

    const shortGrid = validGrid.slice(0, 9);
    const tooShort = update(accepted, { type: "SetWorkshopGrid", grid: shortGrid });
    expect(tooShort.workshop.lastError).toContain("grid must be 10 rows");
    expect(tooShort.workshop.grid).toEqual(validGrid);
    expect(tooShort.log[tooShort.log.length - 1]).toContain("[workshop:rejected]");

    // A control character is not a legal playfield cell; an uppercase data
    // glyph is, so it must no longer be mistaken for one.
    const badCell = validGrid.map((row) => row.slice());
    badCell[5][5] = "\n";
    const controlRejected = update(accepted, { type: "SetWorkshopGrid", grid: badCell });
    expect(controlRejected.workshop.lastError).toContain("invalid glyph at (5,5)");
    expect(controlRejected.workshop.grid).toEqual(validGrid);

    const decorative = validGrid.map((row) => row.slice());
    decorative[5][5] = "Z";
    const decorativeAccepted = update(accepted, { type: "SetWorkshopGrid", grid: decorative });
    expect(decorativeAccepted.workshop.lastError).toBeNull();
    expect(decorativeAccepted.workshop.grid[5][5]).toBe("Z");
  });

  test("SetWorkshopMaxSteps enforces the bounded range", () => {
    let state = createInitialModel();
    state = update(state, { type: "EnterWorkshop" });
    state = update(state, { type: "DeriveWorkshopTrace" });
    expect(state.workshop.trace.length).toBeGreaterThan(0);

    const withTrace = state;
    for (const bad of [0, 10001, 500.5, "500", null]) {
      const next = update(withTrace, { type: "SetWorkshopMaxSteps", maxSteps: bad });
      // Rejected bounds must be reported, and must not disturb the derived trace.
      expect(typeof next.workshop.lastError).toBe("string");
      expect(next.workshop.lastError).toContain("maxSteps rejected");
      expect(next.workshop.maxSteps).toBe(withTrace.workshop.maxSteps);
      expect(next.workshop.trace).toEqual(withTrace.workshop.trace);
      expect(next.log[next.log.length - 1]).toContain("[workshop:rejected]");
    }

    state = update(withTrace, { type: "SetWorkshopMaxSteps", maxSteps: 1 });
    expect(state.workshop.maxSteps).toBe(1);
    expect(state.workshop.lastError).toBeNull();
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
