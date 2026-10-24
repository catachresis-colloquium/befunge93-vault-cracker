// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Deterministic Befunge-93 2D Torus Interpreter & Canonical Vault Grid.
 *
 * Unlike the original React prototype (whose grid had an unclosed string-mode
 * quote on row 0 and relied purely on a hard-coded walk table), this module
 * ships a genuine Befunge-93 torus VM AND a 10x10 vault grid whose actual
 * execution produces `EXPECTED_PASSCODE` ("98261047"), empties its stack,
 * and halts cleanly on `@` at (9, 9).
 */

export const EXPECTED_PASSCODE = "98261047";

export const TEMPO_MODES = Object.freeze(["crawling", "brisk", "ludicrous"]);

export const TEMPO_DELAYS = Object.freeze({
  crawling: 900,
  brisk: 420,
  ludicrous: 120,
});

export const TABS = Object.freeze(["vault", "trace", "about", "telemetry", "workshop"]);

/**
 * Canonical 10x10 Befunge-93 vault grid.
 *
 * Execution trace summary:
 * - Row 0 pushes sentinel `0`, enters string mode, pushes ASCII `'7','4','0','1'`,
 *   exits string mode, and turns down at col 7 (`v`).
 * - Row 1 turns left at col 7 (`<`), enters string mode, pushes ASCII `'6','2','8','9'`,
 *   exits string mode, and turns down at col 0 (`v`). Cell (1, 9) preserves `\`
 *   for structural self-check diagnostics.
 * - Rows 2–4 loop through `(3,4) ':'` and `(4,4) '_'`: while the top of stack is
 *   non-zero, IP branches left across `(4,3) ','` to emit each ASCII digit in LIFO
 *   order (`98261047`); when the `0` sentinel is reached, IP branches right across
 *   `(4,5) '$'` (discarding the sentinel) to col 9 (`v`) and descends to `(9,9) '@'`.
 */
export const GRID = Object.freeze([
  Object.freeze(["0", '"', "7", "4", "0", "1", '"', "v", " ", " "]),
  Object.freeze(["v", '"', "9", "8", "2", "6", '"', "<", " ", "\\"]),
  Object.freeze([">", " ", " ", " ", "v", " ", " ", " ", " ", " "]),
  Object.freeze(["^", " ", " ", " ", ":", " ", " ", " ", " ", " "]),
  Object.freeze(["^", " ", " ", ",", "_", "$", " ", " ", " ", "v"]),
  Object.freeze([" ", "#", "=", "=", "=", "=", "=", "=", "#", " "]),
  Object.freeze([" ", "|", "V", "A", "U", "L", "T", "!", "|", " "]),
  Object.freeze([" ", "|", "9", "3", "-", "T", "E", "A", "|", " "]),
  Object.freeze([" ", "#", "=", "=", "=", "=", "=", "=", "#", " "]),
  Object.freeze([" ", " ", " ", " ", " ", " ", " ", " ", " ", "@"]),
]);

const DIRECTION_DELTAS = Object.freeze({
  right: Object.freeze([0, 1]),
  left: Object.freeze([0, -1]),
  down: Object.freeze([1, 0]),
  up: Object.freeze([-1, 0]),
});

const OPCODE_DOCS = Object.freeze({
  ">": "Move instruction pointer right",
  "<": "Move instruction pointer left",
  "^": "Move instruction pointer up",
  v: "Move instruction pointer down",
  "?": "Move instruction pointer in a deterministic/random cardinal direction",
  _: "Horizontal branch: pop value; right if 0, left otherwise",
  "|": "Vertical branch: pop value; down if 0, up otherwise",
  '"': "Toggle ASCII string mode (push char codes until closing quote)",
  ":": "Duplicate top of stack (0 if empty)",
  "\\": "Swap top two stack values",
  $: "Pop and discard top of stack",
  ".": "Pop integer and append decimal representation to output",
  ",": "Pop integer and append ASCII character to output",
  "#": "Bridge (trampoline): skip next cell in current direction",
  g: "Get: pop y, x; push ASCII code at playfield (y, x)",
  p: "Put: pop y, x, v; write char(v) into playfield (y, x)",
  "+": "Addition: pop a, b; push b + a",
  "-": "Subtraction: pop a, b; push b - a",
  "*": "Multiplication: pop a, b; push b * a",
  "/": "Integer division: pop a, b; push floor(b / a) (0 if a === 0)",
  "%": "Modulo: pop a, b; push b % a (0 if a === 0)",
  "!": "Logical NOT: pop value; push 1 if 0 else 0",
  "`": "Greater-than: pop a, b; push 1 if b > a else 0",
  "@": "End program (halt instruction pointer)",
  " ": "No-op space: IP continues in current direction",
});

/**
 * Describe any Befunge-93 cell character for UI inspection.
 * @param {string} ch
 * @returns {string}
 */
export function describeOpcode(ch) {
  if (typeof ch !== "string" || ch.length === 0) {
    return "Empty cell";
  }
  const c = ch[0];
  if (c >= "0" && c <= "9") {
    return `Push literal integer ${c} onto stack`;
  }
  if (Object.prototype.hasOwnProperty.call(OPCODE_DOCS, c)) {
    return OPCODE_DOCS[c];
  }
  return `Data glyph '${c}' (ASCII ${c.charCodeAt(0)})`;
}

/**
 * Normalize a 2D array or multiline string into a mutable rectangular character matrix.
 * Rejects empty grids or non-rectangular rows if `strict` is set.
 * @param {readonly (readonly string[])[] | string} source
 * @param {{ strict?: boolean }} [options]
 * @returns {string[][]}
 */
export function parseGrid(source, options = {}) {
  const { strict = false } = options;
  let rows;
  if (typeof source === "string") {
    const lines = source.replace(/\r\n/g, "\n").split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    rows = lines.map((line) => Array.from(line));
  } else if (Array.isArray(source)) {
    rows = source.map((row) => {
      if (typeof row === "string") {
        return Array.from(row);
      }
      if (!Array.isArray(row)) {
        throw new TypeError("Each grid row must be a string or an array of single-character strings");
      }
      return row.map((cell) => {
        if (typeof cell !== "string" || cell.length !== 1) {
          throw new TypeError(`Invalid cell value: ${JSON.stringify(cell)}`);
        }
        return cell;
      });
    });
  } else {
    throw new TypeError("Grid source must be a 2D array or multiline string");
  }

  if (rows.length === 0 || rows[0].length === 0) {
    throw new RangeError("Befunge-93 grid must have at least 1 row and 1 column");
  }

  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
  if (strict) {
    for (let r = 0; r < rows.length; r += 1) {
      if (rows[r].length !== width) {
        throw new RangeError(`Non-rectangular grid at row ${r}: expected width ${width}, got ${rows[r].length}`);
      }
    }
  }

  return rows.map((r) => {
    if (r.length === width) return r.slice();
    const padded = r.slice();
    while (padded.length < width) padded.push(" ");
    return padded;
  });
}

/**
 * Create a fresh Befunge-93 VM state for a given grid.
 * @param {readonly (readonly string[])[] | string} [gridSource]
 */
export function createVmState(gridSource = GRID) {
  const grid = parseGrid(gridSource);
  return {
    grid,
    height: grid.length,
    width: grid[0].length,
    row: 0,
    col: 0,
    dir: "right",
    stringMode: false,
    stack: [],
    output: "",
    halted: false,
    steps: 0,
  };
}

function advanceCoords(row, col, dir, height, width) {
  const delta = DIRECTION_DELTAS[dir];
  const nextRow = (((row + delta[0]) % height) + height) % height;
  const nextCol = (((col + delta[1]) % width) + width) % width;
  return [nextRow, nextCol];
}

function popStack(stack) {
  return stack.length > 0 ? stack.pop() : 0;
}

/**
 * Execute a single Befunge-93 instruction step (pure: returns a new VM state snapshot
 * unless `mutate` is explicitly requested by the batch runner).
 * @param {ReturnType<typeof createVmState>} vm
 * @param {{ mutate?: boolean, rngDirection?: () => "up"|"down"|"left"|"right" }} [options]
 */
export function stepVm(vm, options = {}) {
  if (vm.halted) {
    return options.mutate ? vm : { ...vm, stack: vm.stack.slice(), grid: vm.grid.map((r) => r.slice()) };
  }

  const state = options.mutate
    ? vm
    : {
        ...vm,
        stack: vm.stack.slice(),
        grid: vm.grid.map((r) => r.slice()),
      };

  const instr = state.grid[state.row][state.col];
  state.steps += 1;

  if (state.stringMode) {
    if (instr === '"') {
      state.stringMode = false;
    } else {
      state.stack.push(instr.charCodeAt(0));
    }
    const [nr, nc] = advanceCoords(state.row, state.col, state.dir, state.height, state.width);
    state.row = nr;
    state.col = nc;
    return state;
  }

  let skipNext = false;

  if (instr >= "0" && instr <= "9") {
    state.stack.push(instr.charCodeAt(0) - 48);
  } else {
    switch (instr) {
      case '"':
        state.stringMode = true;
        break;
      case ">":
        state.dir = "right";
        break;
      case "<":
        state.dir = "left";
        break;
      case "^":
        state.dir = "up";
        break;
      case "v":
        state.dir = "down";
        break;
      case "?": {
        const dirs = ["right", "down", "left", "up"];
        state.dir = options.rngDirection ? options.rngDirection() : dirs[state.steps % 4];
        break;
      }
      case "_": {
        const v = popStack(state.stack);
        state.dir = v === 0 ? "right" : "left";
        break;
      }
      case "|": {
        const v = popStack(state.stack);
        state.dir = v === 0 ? "down" : "up";
        break;
      }
      case "+": {
        const a = popStack(state.stack);
        const b = popStack(state.stack);
        state.stack.push(b + a);
        break;
      }
      case "-": {
        const a = popStack(state.stack);
        const b = popStack(state.stack);
        state.stack.push(b - a);
        break;
      }
      case "*": {
        const a = popStack(state.stack);
        const b = popStack(state.stack);
        state.stack.push(b * a);
        break;
      }
      case "/": {
        const a = popStack(state.stack);
        const b = popStack(state.stack);
        state.stack.push(a === 0 ? 0 : Math.trunc(b / a));
        break;
      }
      case "%": {
        const a = popStack(state.stack);
        const b = popStack(state.stack);
        state.stack.push(a === 0 ? 0 : b % a);
        break;
      }
      case "!": {
        const v = popStack(state.stack);
        state.stack.push(v === 0 ? 1 : 0);
        break;
      }
      case "`": {
        const a = popStack(state.stack);
        const b = popStack(state.stack);
        state.stack.push(b > a ? 1 : 0);
        break;
      }
      case ":": {
        const v = popStack(state.stack);
        state.stack.push(v, v);
        break;
      }
      case "\\": {
        const a = popStack(state.stack);
        const b = popStack(state.stack);
        state.stack.push(a, b);
        break;
      }
      case "$": {
        popStack(state.stack);
        break;
      }
      case ".": {
        const v = popStack(state.stack);
        state.output += `${v} `;
        break;
      }
      case ",": {
        const v = popStack(state.stack);
        state.output += String.fromCharCode(((v % 256) + 256) % 256);
        break;
      }
      case "#": {
        skipNext = true;
        break;
      }
      case "g": {
        const y = popStack(state.stack);
        const x = popStack(state.stack);
        if (y >= 0 && y < state.height && x >= 0 && x < state.width) {
          state.stack.push(state.grid[y][x].charCodeAt(0));
        } else {
          state.stack.push(0);
        }
        break;
      }
      case "p": {
        const y = popStack(state.stack);
        const x = popStack(state.stack);
        const v = popStack(state.stack);
        if (y >= 0 && y < state.height && x >= 0 && x < state.width) {
          state.grid[y][x] = String.fromCharCode(((v % 256) + 256) % 256);
        }
        break;
      }
      case "@": {
        state.halted = true;
        return state;
      }
      case " ":
      default:
        break;
    }
  }

  let [nr, nc] = advanceCoords(state.row, state.col, state.dir, state.height, state.width);
  if (skipNext) {
    [nr, nc] = advanceCoords(nr, nc, state.dir, state.height, state.width);
  }
  state.row = nr;
  state.col = nc;
  return state;
}

/**
 * Execute a Befunge-93 grid up to `maxSteps`, returning final VM state and trace history.
 * @param {readonly (readonly string[])[] | string} [gridSource]
 * @param {{ maxSteps?: number, recordHistory?: boolean }} [options]
 */
export function executeProgram(gridSource = GRID, options = {}) {
  const { maxSteps = 2000, recordHistory = false } = options;
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new RangeError(`maxSteps must be a positive integer, got ${maxSteps}`);
  }

  const vm = createVmState(gridSource);
  const history = recordHistory ? [{ row: vm.row, col: vm.col, dir: vm.dir, instr: vm.grid[0][0], output: "" }] : [];

  while (!vm.halted && vm.steps < maxSteps) {
    const instr = vm.grid[vm.row][vm.col];
    stepVm(vm, { mutate: true });
    if (recordHistory) {
      history.push({
        step: vm.steps,
        row: vm.row,
        col: vm.col,
        dir: vm.dir,
        instr,
        stack: vm.stack.slice(),
        output: vm.output,
        halted: vm.halted,
      });
    }
  }

  return {
    halted: vm.halted,
    steps: vm.steps,
    output: vm.output,
    stack: vm.stack.slice(),
    finalPos: [vm.row, vm.col],
    finalDir: vm.dir,
    exhaustedBudget: !vm.halted && vm.steps >= maxSteps,
    history,
  };
}

const WALK_CHECKPOINTS = [
  [0, 0, () => "Push 0 sentinel onto stack at origin (0,0)"],
  [0, 1, () => 'Enter stringmode (") on row 0'],
  [0, 5, () => "Push ASCII bytes for '7', '4', '0', '1'"],
  [0, 7, () => "Exit stringmode and deflect downward (v)"],
  [1, 7, () => "Deflect leftward (<) across row 1"],
  [1, 2, () => "Push ASCII bytes for '6', '2', '8', '9' in reverse"],
  [1, 0, () => "Close stringmode and drop into drain loop (v)"],
  ...Array.from({ length: 8 }, () => [
    4,
    3,
    (topBefore, outAfter) =>
      `Pop ${topBefore} via ',' -> emit digit '${outAfter[outAfter.length - 1]}'`,
  ]),
  [4, 5, () => "Sentinel 0 branches right at '_' and '$' clears stack"],
  [4, 9, () => "Enter east vault shaft at (4,9) downward (v)"],
  [9, 9, () => "Reached @ at (9,9) — execution complete"],
];

function deriveWalkTrace(gridSource) {
  const vm = createVmState(gridSource);
  const trace = [];
  let cpIndex = 0;

  while (!vm.halted && vm.steps < 500 && cpIndex < WALK_CHECKPOINTS.length) {
    const r = vm.row;
    const c = vm.col;
    const topBefore = vm.stack.length > 0 ? vm.stack[vm.stack.length - 1] : 0;
    stepVm(vm, { mutate: true });

    const [wantRow, wantCol, buildNote] = WALK_CHECKPOINTS[cpIndex];
    if (r === wantRow && c === wantCol) {
      trace.push(
        Object.freeze({
          pos: Object.freeze([r, c]),
          dir: vm.dir,
          stack: Object.freeze(vm.stack.slice()),
          output: vm.output,
          note: buildNote(topBefore, vm.output),
        }),
      );
      cpIndex += 1;
    }
  }
  return Object.freeze(trace);
}

/**
 * 18 semantic stages derived directly by stepping `createVmState(GRID)` through `stepVm`
 * (zero duplicated stack/output literals — the live VM IS the single source of truth).
 */
export const WALK_TRACE = deriveWalkTrace(GRID);

function freezeRows(rows) {
  return Object.freeze(rows.map((line) => Object.freeze([...line])));
}

function deriveLevelTraceFromVm(gridSource) {
  const vm = createVmState(gridSource);
  const trace = [];
  let currentFrozenGrid = gridSource;
  while (!vm.halted && vm.steps < 500) {
    const r = vm.row;
    const c = vm.col;
    const instr = vm.grid[r][c];
    const inStr = vm.stringMode;
    stepVm(vm, { mutate: true });
    if (!inStr && instr === "p") {
      currentFrozenGrid = freezeRows(vm.grid.map((row) => row.join("")));
    }
    if (instr !== " " || inStr || vm.halted) {
      const note = inStr && instr !== '"'
        ? `Stringmode push '${instr}' (${instr.charCodeAt(0)})`
        : describeOpcode(instr);
      trace.push(
        Object.freeze({
          pos: Object.freeze([r, c]),
          dir: vm.dir,
          stack: Object.freeze(vm.stack.slice()),
          output: vm.output,
          grid: currentFrozenGrid,
          note,
        }),
      );
    }
  }
  return Object.freeze({
    expectedPasscode: vm.output,
    walkTrace: Object.freeze(trace),
  });
}

const TORUS_WRAP_GRID = freezeRows([
  '<^ "6402"0',
  "         \\",
  ">   v     ",
  "^   :     ",
  "^  ,_$   v",
  " #======# ",
  " |TORUS!| ",
  " |WRAP93| ",
  '^ "319"<  ',
  " >77*4+^ @",
]);

const SELF_MOD_GRID = freezeRows([
  '^v"6802"< ',
  " >76g34pv\\",
  ">   v   < ",
  "^   :     ",
  "^   _$   v",
  " #======# ",
  " |PATCH,| ",
  " |g&p-VM| ",
  " #======# ",
  '>0"4175"v@',
]);

const torusWrapDerived = deriveLevelTraceFromVm(TORUS_WRAP_GRID);
const selfModDerived = deriveLevelTraceFromVm(SELF_MOD_GRID);

export const VAULT_LEVELS = Object.freeze([
  Object.freeze({
    id: "vault-alpha",
    title: "Level 1 · Alpha Torus",
    grid: GRID,
    expectedPasscode: EXPECTED_PASSCODE,
    walkTrace: WALK_TRACE,
  }),
  Object.freeze({
    id: "torus-wrap",
    title: "Level 2 · Border Wrap & Arithmetic",
    grid: TORUS_WRAP_GRID,
    expectedPasscode: torusWrapDerived.expectedPasscode,
    walkTrace: torusWrapDerived.walkTrace,
  }),
  Object.freeze({
    id: "self-mod-cipher",
    title: "Level 3 · Self-Modifying (g/p)",
    grid: SELF_MOD_GRID,
    expectedPasscode: selfModDerived.expectedPasscode,
    walkTrace: selfModDerived.walkTrace,
  }),
]);

export function getVaultLevel(levelId = "vault-alpha") {
  return VAULT_LEVELS.find((lvl) => lvl.id === levelId) ?? VAULT_LEVELS[0];
}
