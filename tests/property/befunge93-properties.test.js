// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

import { describe, expect, test } from "bun:test";
import {
  TABS,
  TEMPO_MODES,
  VAULT_LEVELS,
  WALK_TRACE,
  createVmState,
  executeProgram,
  getVaultLevel,
  GRID,
  stepVm,
} from "../../src/engine/befunge93.js";
import {
  createInitialModel,
  deriveProgress,
  update,
} from "../../src/engine/game-state.js";
import { evaluateGridWithNativeZig } from "../../src/marid/native-oracle.js";
import { jcsSerialize } from "../../scripts/jcs-canon.js";
import {
  base64urlDecode,
  deriveWorkshopTrace,
  makeWorkshopChallengeId,
  validateWorkshopGrid,
  verifyWorkshopChallengeId,
  VAULT_MODE,
  WORKSHOP_MODE,
  WORKSHOP_GLYPHS,
  WORKSHOP_GRID_SIZE,
  WORKSHOP_MAX_STEPS_CAP,
} from "../../src/engine/workshop.js";

/** Deterministic PRNG (Mulberry32) for reproducible 1,000+ generative cases. */
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Generative Property-Based Suite >=1,000 cases/property (Categories 9 & 14)", () => {
  test("Property P1 (1,200 cases): 2D torus coordinate stepping never escapes [0, H) x [0, W)", () => {
    const rng = mulberry32(0xbf93_0001);
    const navGlyphs = [">", "<", "^", "v", "#", " ", ":", "$", "!"];

    for (let caseIdx = 0; caseIdx < 1200; caseIdx += 1) {
      const h = 2 + Math.floor(rng() * 14);
      const w = 2 + Math.floor(rng() * 14);
      const grid = Array.from({ length: h }, () =>
        Array.from({ length: w }, () => navGlyphs[Math.floor(rng() * navGlyphs.length)]),
      );

      let vm = createVmState(grid);
      for (let s = 0; s < 25; s += 1) {
        vm = stepVm(vm, { mutate: true });
        expect(vm.row).toBeGreaterThanOrEqual(0);
        expect(vm.row).toBeLessThan(h);
        expect(vm.col).toBeGreaterThanOrEqual(0);
        expect(vm.col).toBeLessThan(w);
      }
    }
  });

  test("Property P2 (1,000 cases): bounded execution terminates cleanly on arbitrary opcodes", () => {
    const rng = mulberry32(0xbf93_0002);
    const alphabet = '0123456789><^v_|:+*-/%!`\\$.,#gp@" ';

    for (let caseIdx = 0; caseIdx < 1000; caseIdx += 1) {
      const h = 3 + Math.floor(rng() * 8);
      const w = 3 + Math.floor(rng() * 8);
      const maxSteps = 20 + Math.floor(rng() * 60);
      const grid = Array.from({ length: h }, () =>
        Array.from({ length: w }, () => alphabet[Math.floor(rng() * alphabet.length)]),
      );

      const res = executeProgram(grid, { maxSteps });
      expect(res.steps).toBeLessThanOrEqual(maxSteps);
      expect(res.exhaustedBudget).toBe(!res.halted);
      expect(typeof res.output).toBe("string");
    }
  });

  test("Property P3 (1,000 cases): TEA state machine preserves structural invariants under random command streams", () => {
    const rng = mulberry32(0xbf93_0003);

    const randomAction = () => {
      const pick = Math.floor(rng() * 13);
      switch (pick) {
        case 0:
          return { type: "Start" };
        case 1:
          return { type: "Pause" };
        case 2:
          return { type: "Step" };
        case 3:
          return { type: "Tick" };
        case 4:
          return { type: "Reset" };
        case 5:
          return { type: "SetTempo", tempo: TEMPO_MODES[Math.floor(rng() * TEMPO_MODES.length)] };
        case 6:
          return { type: "SetTab", tab: TABS[Math.floor(rng() * TABS.length)] };
        case 7:
          return { type: "SelectCell", row: Math.floor(rng() * 12) - 1, col: Math.floor(rng() * 12) - 1 };
        case 8:
          return { type: "InputPasscode", value: String(Math.floor(rng() * 100000000)) };
        case 9:
          return { type: "SubmitPasscode" };
        case 10:
          return { type: "RunSelfCheck" };
        case 11:
          return {
            type: "SelectLevel",
            levelId: VAULT_LEVELS[Math.floor(rng() * VAULT_LEVELS.length)].id,
          };
        default:
          return { type: "BogusChaosEvent", payload: null };
      }
    };

    for (let seq = 0; seq < 1000; seq += 1) {
      let state = createInitialModel();
      const length = 5 + Math.floor(rng() * 30);
      for (let i = 0; i < length; i += 1) {
        state = update(state, randomAction());
        const traceLen = getVaultLevel(state.levelId).walkTrace.length;
        expect(state.stage).toBeGreaterThanOrEqual(0);
        expect(state.stage).toBeLessThanOrEqual(traceLen);
        const pct = deriveProgress(state);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
        expect(state.completed).toBe(state.stage === traceLen);
        expect(state.completed && state.running).toBe(false);
        expect(TABS).toContain(state.tab);
        expect(TEMPO_MODES).toContain(state.tempo);
      }
    }
  });

  test("Property P4 (1,000 cases): RFC 8785 JCS canonicalization is idempotent and key-order invariant", () => {
    const rng = mulberry32(0xbf93_0004);
    const genVal = (depth) => {
      if (depth > 2) return Math.floor(rng() * 1000) - 500;
      const kind = Math.floor(rng() * 5);
      if (kind === 0) return rng() < 0.5;
      if (kind === 1) return null;
      if (kind === 2) return `s_${Math.floor(rng() * 999)}`;
      if (kind === 3) return [genVal(depth + 1), genVal(depth + 1)];
      const keys = ["zeta", "alpha", "mu", "0", "beta"];
      const obj = {};
      for (let i = 0; i < 3; i += 1) {
        obj[keys[Math.floor(rng() * keys.length)]] = genVal(depth + 1);
      }
      return obj;
    };

    for (let i = 0; i < 1000; i += 1) {
      const val = genVal(0);
      const once = jcsSerialize(val);
      // Panic-attack hygiene: JCS output must always be valid I-JSON — guard the
      // round-trip parse instead of assuming it cannot throw.
      let roundTripped;
      try {
        roundTripped = JSON.parse(once);
      } catch {
        throw new Error(`JCS serializer produced non-parseable I-JSON: ${once}`);
      }
      const twice = jcsSerialize(roundTripped);
      expect(twice).toBe(once);
    }
  });

  test("Property P5 (1,000 cases + 3 levels): differential JS VM vs native Zig C-ABI eval_grid lockstep", async () => {
    for (const lvl of VAULT_LEVELS) {
      const jsRes = executeProgram(lvl.grid, { maxSteps: 500 });
      expect(jsRes.halted).toBe(true);
      expect(jsRes.output).toBe(lvl.expectedPasscode);
      const zigRes = await evaluateGridWithNativeZig(lvl.grid, { maxSteps: 500 });
      if (zigRes !== null) {
        expect(zigRes.halted).toBe(jsRes.halted);
        expect(zigRes.output).toBe(jsRes.output);
      }
    }

    const rng = mulberry32(0xbf93_0005);
    const alphabet = '0123456789><^v?_|:+*-/%!`\\$.,#gp&~@" ';

    for (let caseIdx = 0; caseIdx < 1000; caseIdx += 1) {
      const maxSteps = 12 + Math.floor(rng() * 24);
      const grid = Array.from({ length: 10 }, () =>
        Array.from({ length: 10 }, () => alphabet[Math.floor(rng() * alphabet.length)]),
      );

      const jsRes = executeProgram(grid, { maxSteps });
      const zigRes = await evaluateGridWithNativeZig(grid, { maxSteps });
      if (zigRes !== null) {
        expect(zigRes.halted).toBe(jsRes.halted);
        expect(zigRes.output).toBe(jsRes.output);
      }
    }
  });

  test("Property P6 (1,000 cases): every single-cell workshop mutation preserves 10x10 shape and valid glyph set", () => {
    // Seeded, like P7-P9: an unseeded `Math.random()` here made the property
    // non-reproducible, so a regression could pass on one run and fail on the
    // next without any source change.
    const rng = mulberry32(0xbf93_0009);
    const glyphs = [...WORKSHOP_GLYPHS];
    const baseGrid = GRID.map((row) => row.slice());

    // The shipped vault grid is itself a legal playfield: its decorative ASCII
    // art is made of no-op data glyphs, so a mutation must never invalidate it.
    expect(validateWorkshopGrid(baseGrid).ok).toBe(true);

    for (let caseIdx = 0; caseIdx < 1000; caseIdx += 1) {
      const grid = baseGrid.map((row) => row.slice());
      const r = Math.floor(rng() * WORKSHOP_GRID_SIZE);
      const c = Math.floor(rng() * WORKSHOP_GRID_SIZE);
      const glyph = glyphs[Math.floor(rng() * glyphs.length)];
      grid[r][c] = glyph;

      const { ok } = validateWorkshopGrid(grid);
      expect(ok).toBe(true);
      expect(grid.length).toBe(WORKSHOP_GRID_SIZE);
      expect(grid.every((row) => row.length === WORKSHOP_GRID_SIZE)).toBe(true);
      for (const row of grid) {
        for (const cell of row) {
          expect(WORKSHOP_GLYPHS.has(cell)).toBe(true);
        }
      }
      expect(grid[r][c]).toBe(glyph);
    }
  });

  test("Property P7 (1,000 cases): workshop challenge descriptor round-trips and rejects tampered grid/maxSteps", () => {
    const rng = mulberry32(0xbf93_0006);
    const glyphs = [...WORKSHOP_GLYPHS];

    for (let caseIdx = 0; caseIdx < 1000; caseIdx += 1) {
      const grid = Array.from({ length: WORKSHOP_GRID_SIZE }, () =>
        Array.from({ length: WORKSHOP_GRID_SIZE }, () =>
          glyphs[Math.floor(rng() * glyphs.length)],
        ),
      );
      const maxSteps = 1 + Math.floor(rng() * WORKSHOP_MAX_STEPS_CAP);

      const id = makeWorkshopChallengeId(grid, maxSteps);
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
      expect(/^[A-Za-z0-9_-]+$/.test(id)).toBe(true);

      const verified = verifyWorkshopChallengeId(id, grid, maxSteps);
      expect(verified.ok).toBe(true);
      expect(verified.valid).toBe(true);

      // Tampering one cell invalidates the descriptor.
      const tampered = grid.map((row) => row.slice());
      tampered[0][0] = tampered[0][0] === "@" ? " " : "@";
      expect(verifyWorkshopChallengeId(id, tampered, maxSteps).valid).toBe(false);

      // Tampering maxSteps invalidates the descriptor.
      expect(verifyWorkshopChallengeId(id, grid, maxSteps + 1).valid).toBe(false);
    }
  });

  test("Property P8 (1,000 cases): workshop TEA preserves invariants under random command streams", () => {
    const rng = mulberry32(0xbf93_0007);
    const glyphs = [...WORKSHOP_GLYPHS];

    for (let seq = 0; seq < 1000; seq += 1) {
      let state = createInitialModel();
      state = update(state, { type: "EnterWorkshop" });

      const randomAction = () => {
        const pick = Math.floor(rng() * 9);
        switch (pick) {
          case 0:
            return {
              type: "SetWorkshopCell",
              row: Math.floor(rng() * WORKSHOP_GRID_SIZE),
              col: Math.floor(rng() * WORKSHOP_GRID_SIZE),
              glyph: glyphs[Math.floor(rng() * glyphs.length)],
            };
          case 1:
            return { type: "SetWorkshopMaxSteps", maxSteps: 1 + Math.floor(rng() * 5000) };
          case 2:
            return { type: "DeriveWorkshopTrace" };
          case 3:
            return { type: "MakeWorkshopChallenge" };
          case 4:
            return {
              type: "VerifyWorkshopChallenge",
              challengeId: state.workshop?.challengeId ?? "garbage",
            };
          case 5:
            return { type: "SetWorkshopTraceView", index: Math.floor(rng() * 100) - 10 };
          case 6:
            return { type: "SelectCell", row: Math.floor(rng() * 12) - 1, col: Math.floor(rng() * 12) - 1 };
          case 7:
            return { type: "SetTab", tab: TABS[Math.floor(rng() * TABS.length)] };
          default:
            return { type: "BogusChaosEvent", payload: null };
        }
      };

      const length = 5 + Math.floor(rng() * 30);
      for (let i = 0; i < length; i += 1) {
        state = update(state, randomAction());
        if (state.mode === WORKSHOP_MODE) {
          expect(state.workshop).not.toBeNull();
          expect(state.workshop.grid.length).toBe(WORKSHOP_GRID_SIZE);
          expect(state.workshop.maxSteps).toBeGreaterThanOrEqual(1);
          expect(state.workshop.maxSteps).toBeLessThanOrEqual(WORKSHOP_MAX_STEPS_CAP);
          expect(state.workshop.traceViewIndex).toBeGreaterThanOrEqual(0);
        } else {
          expect(state.mode).toBe(VAULT_MODE);
        }
        expect(state.workshop?.traceViewIndex).toBeLessThanOrEqual(
          Math.max(0, (state.workshop?.trace.length ?? 1) - 1),
        );
      }
    }
  });

  test("Property P9 (1,000 cases): differential JS VM vs native Zig C-ABI lockstep on workshop-authored random 10x10 grids", async () => {
    const rng = mulberry32(0xbf93_0008);
    const alphabet = '0123456789><^v?_|:+*-/%!`\\\\$.,#gp&~@\" ';

    for (let caseIdx = 0; caseIdx < 1000; caseIdx += 1) {
      const maxSteps = 10 + Math.floor(rng() * 100);
      const grid = Array.from({ length: 10 }, () =>
        Array.from({ length: 10 }, () => alphabet[Math.floor(rng() * alphabet.length)]),
      );

      const derived = await deriveWorkshopTrace(grid, maxSteps);
      const jsRes = derived.jsResult;
      expect(jsRes.steps).toBeLessThanOrEqual(maxSteps);
      expect(typeof jsRes.output).toBe("string");

      const zigRes = derived.zigResult;
      if (zigRes !== null) {
        expect(zigRes.steps).toBeLessThanOrEqual(maxSteps);
        expect(zigRes.halted).toBe(jsRes.halted);
        expect(zigRes.output).toBe(jsRes.output);
        expect(derived.agreement).toBe(
          zigRes.halted === jsRes.halted &&
            zigRes.output === jsRes.output &&
            zigRes.steps === jsRes.steps,
        );
      }
    }
  });
});
