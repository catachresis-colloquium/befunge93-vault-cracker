// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Pure Functional TEA (The Elm Architecture) Game State Machine for
 * Befunge-93 Vault Cracker.
 *
 * Every state transition is pure and total over valid/unknown actions:
 * - Fixes off-by-one completion defect (stage 18 completes immediately on the
 *   18th transition without requiring a 19th timer tick).
 * - Prevents duplicate `[complete]` / `[halt]` log spam when Start/Step/Tick
 *   is dispatched after completion.
 * - Integrates deterministic structural + VM self-checks into state (`Boot` /
 *   `RunSelfCheck`) instead of discarding the return value.
 * - Supports interactive playfield cell inspection, visited-cell tracking,
 *   and passcode attempt telemetry.
 */

import {
  EXPECTED_PASSCODE,
  GRID,
  TABS,
  TEMPO_DELAYS,
  TEMPO_MODES,
  VAULT_LEVELS,
  WALK_TRACE,
  describeOpcode,
  executeProgram,
  getVaultLevel,
} from "./befunge93.js";

export const MAX_LOG_ENTRIES = 200;

function appendLog(log, ...entries) {
  const combined = [...log, ...entries];
  return combined.length > MAX_LOG_ENTRIES
    ? combined.slice(combined.length - MAX_LOG_ENTRIES)
    : combined;
}

/**
 * Run deterministic structural and semantic self-checks against a model.
 * @param {{ grid: readonly (readonly string[])[] }} model
 */
export function runSelfChecks(model) {
  const checks = [];
  const targetPasscode = model?.expectedPasscode ?? EXPECTED_PASSCODE;
  const targetTrace = model?.walkTrace ?? WALK_TRACE;

  const is10x10 =
    Array.isArray(model?.grid) &&
    model.grid.length === 10 &&
    model.grid.every((row) => Array.isArray(row) && row.length === 10);
  checks.push({
    id: "grid-10x10",
    label: "Playfield dimensions are rectangular 10x10",
    passed: is10x10,
  });

  const hasTerminator = Boolean(is10x10 && model.grid[9][9] === "@");
  checks.push({
    id: "terminator-at-9-9",
    label: "Halt opcode '@' anchored at (9, 9)",
    passed: hasTerminator,
  });

  const hasBackslashSwap = Boolean(is10x10 && model.grid[1][9] === "\\");
  checks.push({
    id: "swap-glyph-at-1-9",
    label: "Stack-swap opcode '\\' anchored at (1, 9)",
    passed: hasBackslashSwap,
  });

  const validWalkTrace =
    Array.isArray(targetTrace) &&
    targetTrace.length >= 1 &&
    targetTrace.every(
      (entry) =>
        Array.isArray(entry.pos) &&
        entry.pos.length === 2 &&
        entry.pos[0] >= 0 &&
        entry.pos[0] < 10 &&
        entry.pos[1] >= 0 &&
        entry.pos[1] < 10,
    );
  checks.push({
    id: "walk-trace-bounds",
    label: `${targetTrace.length}-stage walk trace coordinates lie within 10x10 torus`,
    passed: validWalkTrace,
  });

  let vmMatchesPasscode = false;
  if (is10x10) {
    try {
      const result = executeProgram(model.grid, { maxSteps: 500 });
      vmMatchesPasscode =
        result.halted &&
        result.output === targetPasscode &&
        result.stack.length === 0 &&
        result.finalPos[0] === 9 &&
        result.finalPos[1] === 9;
    } catch {
      vmMatchesPasscode = false;
    }
  }
  checks.push({
    id: "vm-equivalence",
    label: "Befunge-93 torus VM halts cleanly and emits expected 8-digit passcode",
    passed: vmMatchesPasscode,
  });

  const passedCount = checks.filter((c) => c.passed).length;
  return {
    ok: passedCount === checks.length,
    passedCount,
    totalCount: checks.length,
    checks,
  };
}

/**
 * Construct the initial immutable game model, running boot self-checks immediately.
 * @param {string} [levelId]
 */
export function createInitialModel(levelId = "vault-alpha") {
  const level = getVaultLevel(levelId);
  const base = {
    levelId: level.id,
    tab: "vault",
    running: false,
    completed: false,
    tempo: "brisk",
    stage: 0,
    ip: [0, 0],
    dir: "right",
    stack: [],
    output: "",
    passcodeInput: "",
    passcodeStatus: "idle",
    attempts: 0,
    matchedPrefixDigits: 0,
    selectedCell: [0, 0],
    visitedKeys: ["0,0"],
    selfChecksPassed: false,
    selfCheckReport: [],
    log: [
      `[boot] ${level.title} loaded (10x10 torus)`,
      "[hint] Follow the instruction pointer or step manually to recover the 8-digit passcode",
    ],
  };

  const report = runSelfChecks({
    grid: level.grid,
    expectedPasscode: level.expectedPasscode,
    walkTrace: level.walkTrace,
  });
  return {
    ...base,
    selfChecksPassed: report.ok,
    selfCheckReport: report.checks,
    log: [
      ...base.log,
      report.ok
        ? `[selfcheck] ${report.passedCount}/${report.totalCount} invariants verified`
        : `[selfcheck:warn] ${report.passedCount}/${report.totalCount} invariants verified`,
    ],
  };
}

/**
 * Whether `Start` can transition the simulation into `running: true`.
 * @param {ReturnType<typeof createInitialModel>} model
 */
export function canStart(model) {
  const traceLen = getVaultLevel(model.levelId).walkTrace.length;
  return !model.running && !model.completed && model.stage < traceLen;
}

/**
 * Whether `Step` can advance one stage.
 * @param {ReturnType<typeof createInitialModel>} model
 */
export function canStep(model) {
  const traceLen = getVaultLevel(model.levelId).walkTrace.length;
  return !model.completed && model.stage < traceLen;
}

/**
 * Compute integer completion percentage [0, 100].
 * @param {ReturnType<typeof createInitialModel>} model
 */
export function deriveProgress(model) {
  const traceLen = getVaultLevel(model.levelId).walkTrace.length;
  const clamped = Math.max(0, Math.min(traceLen, model.stage));
  return Math.round((clamped / traceLen) * 100);
}

/**
 * Compute interval delay in ms for a given tempo.
 * @param {string} tempo
 */
export function getTempoDelayMs(tempo) {
  return Object.prototype.hasOwnProperty.call(TEMPO_DELAYS, tempo)
    ? TEMPO_DELAYS[tempo]
    : TEMPO_DELAYS.brisk;
}

/**
 * Validate a candidate passcode string without mutating state.
 * @param {string} rawInput
 */
export function evaluatePasscodeCandidate(rawInput, expected = EXPECTED_PASSCODE) {
  const normalized = typeof rawInput === "string" ? rawInput.trim() : "";
  if (normalized === expected) {
    return {
      valid: true,
      status: "valid",
      matchedDigits: expected.length,
    };
  }
  let matchedDigits = 0;
  const limit = Math.min(normalized.length, expected.length);
  for (let i = 0; i < limit; i += 1) {
    if (normalized[i] === expected[i]) {
      matchedDigits += 1;
    } else {
      break;
    }
  }
  return {
    valid: false,
    status: "invalid",
    matchedDigits,
  };
}

/**
 * Inspect metadata for a cell on the 10x10 vault grid.
 * @param {number} row
 * @param {number} col
 * @param {readonly (readonly string[])[]} [grid]
 * @param {readonly { pos: readonly [number, number] }[]} [trace]
 */
export function inspectGridCell(row, col, grid = GRID, trace = WALK_TRACE) {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) {
    return null;
  }
  const glyph = grid[row][col];
  const stageHits = [];
  trace.forEach((step, idx) => {
    if (step.pos[0] === row && step.pos[1] === col) {
      stageHits.push(idx + 1);
    }
  });
  return {
    row,
    col,
    glyph,
    displayGlyph: glyph === " " ? "·" : glyph,
    description: describeOpcode(glyph),
    stageHits,
  };
}

function advanceOneStage(state, trigger) {
  const level = getVaultLevel(state.levelId);
  const trace = level.walkTrace;
  if (state.completed || state.stage >= trace.length) {
    return state.running ? { ...state, running: false } : state;
  }

  const nextIndex = state.stage;
  const next = trace[nextIndex];
  const nextStage = state.stage + 1;
  const reachedEnd = nextStage >= trace.length;
  const coordKey = `${next.pos[0]},${next.pos[1]}`;
  const visitedKeys = state.visitedKeys.includes(coordKey)
    ? state.visitedKeys
    : [...state.visitedKeys, coordKey];

  const nextLog = reachedEnd
    ? appendLog(
        state.log,
        `[${trigger} ${nextStage}/${trace.length}] IP=(${next.pos[0]},${next.pos[1]}) dir=${next.dir} :: ${next.note}`,
        `[complete] All ${trace.length} grid stages traversed — @ halt reached`,
      )
    : appendLog(
        state.log,
        `[${trigger} ${nextStage}/${trace.length}] IP=(${next.pos[0]},${next.pos[1]}) dir=${next.dir} :: ${next.note}`,
      );

  return {
    ...state,
    running: reachedEnd ? false : trigger === "step" ? false : state.running,
    completed: reachedEnd,
    stage: nextStage,
    ip: [next.pos[0], next.pos[1]],
    dir: next.dir,
    stack: [...next.stack],
    output: next.output,
    visitedKeys,
    log: nextLog,
  };
}

/**
 * Pure reducer (`(state, msg) => nextState`) implementing the game's TEA loop.
 * Unknown or malformed messages return `state` unchanged.
 *
 * @param {ReturnType<typeof createInitialModel>} state
 * @param {{ type: string, [key: string]: unknown }} msg
 */
export function update(state, msg) {
  if (!msg || typeof msg.type !== "string") {
    return state;
  }

  switch (msg.type) {
    case "SetTab": {
      if (!TABS.includes(msg.tab) || msg.tab === state.tab) {
        return state;
      }
      return { ...state, tab: msg.tab };
    }

    case "Start": {
      if (!canStart(state)) {
        return state;
      }
      return {
        ...state,
        running: true,
        log: appendLog(state.log, `[run] Instruction pointer started (tempo=${state.tempo})`),
      };
    }

    case "Pause": {
      if (!state.running) {
        return state;
      }
      return {
        ...state,
        running: false,
        log: appendLog(state.log, "[pause] Execution paused"),
      };
    }

    case "SelectLevel": {
      if (!VAULT_LEVELS.some((l) => l.id === msg.levelId) || msg.levelId === state.levelId) {
        return state;
      }
      const fresh = createInitialModel(msg.levelId);
      return {
        ...fresh,
        tab: state.tab,
        tempo: state.tempo,
      };
    }

    case "Reset": {
      const fresh = createInitialModel(state.levelId);
      return {
        ...fresh,
        tab: state.tab,
        tempo: state.tempo,
        selectedCell: [...state.selectedCell],
        log: appendLog(fresh.log, "[reset] Playfield reset to origin (0,0)"),
      };
    }

    case "SetTempo": {
      if (!TEMPO_MODES.includes(msg.tempo) || msg.tempo === state.tempo) {
        return state;
      }
      return {
        ...state,
        tempo: msg.tempo,
        log: appendLog(state.log, `[tempo] Switched to ${msg.tempo} (${TEMPO_DELAYS[msg.tempo]}ms)`),
      };
    }

    case "Tick": {
      if (!state.running) {
        return state;
      }
      return advanceOneStage(state, "tick");
    }

    case "Step": {
      if (!canStep(state)) {
        return state;
      }
      return advanceOneStage(state, "step");
    }

    case "SelectCell": {
      const row = Number(msg.row);
      const col = Number(msg.col);
      if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= 10 || col < 0 || col >= 10) {
        return state;
      }
      return {
        ...state,
        selectedCell: [row, col],
      };
    }

    case "InputPasscode": {
      const level = getVaultLevel(state.levelId);
      const value = typeof msg.value === "string" ? msg.value : "";
      return {
        ...state,
        passcodeInput: value,
        passcodeStatus:
          state.passcodeStatus === "valid" && value.trim() === level.expectedPasscode
            ? "valid"
            : "idle",
      };
    }

    case "SubmitPasscode": {
      const level = getVaultLevel(state.levelId);
      const evalResult = evaluatePasscodeCandidate(state.passcodeInput, level.expectedPasscode);
      const attempts = state.attempts + 1;
      return {
        ...state,
        attempts,
        passcodeStatus: evalResult.status,
        matchedPrefixDigits: evalResult.matchedDigits,
        log: appendLog(
          state.log,
          evalResult.valid
            ? `[unlock] Passcode accepted on attempt #${attempts} — vault open`
            : `[reject] Passcode rejected on attempt #${attempts} (${evalResult.matchedDigits}/8 leading digits matched)`,
        ),
      };
    }

    case "RunSelfCheck": {
      const level = getVaultLevel(state.levelId);
      const report = runSelfChecks({
        grid: level.grid,
        expectedPasscode: level.expectedPasscode,
        walkTrace: level.walkTrace,
      });
      return {
        ...state,
        selfChecksPassed: report.ok,
        selfCheckReport: report.checks,
        log: appendLog(
          state.log,
          report.ok
            ? `[selfcheck] ${report.passedCount}/${report.totalCount} invariants verified`
            : `[selfcheck:warn] ${report.passedCount}/${report.totalCount} invariants verified`,
        ),
      };
    }

    default:
      return state;
  }
}
