// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Pure helpers for the Custom Vault Workshop mode (v0.4.0).
 *
 * - 10x10 torus grid authoring and mutation validation
 * - Bounded `maxSteps` (1 .. WORKSHOP_MAX_STEPS_CAP)
 * - Deterministic RFC 8785 JCS challenge descriptors with base64url encoding
 * - JS VM vs native Zig C-ABI lockstep derivation
 *
 * Zero Node.js dependencies: safe to import from browser bundles (Vue SPA).
 */

import { executeProgram } from "./befunge93.js";

// The native Zig C-ABI oracle is loaded lazily and only on Bun runtimes:
// `src/marid/native-oracle.js` touches `node:fs`, so it must not be part of
// the browser bundle's static import graph.
let nativeEvalPromise = null;

export const WORKSHOP_MODE = "workshop";
export const VAULT_MODE = "vault";
export const WORKSHOP_GRID_SIZE = 10;

// Befunge-93 instruction set (the set stepVm dispatches on) plus the blank cell.
export const WORKSHOP_GLYPHS = Object.freeze(
  new Set([
    " ",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "+",
    "-",
    "*",
    "/",
    "%",
    "!",
    "`",
    '"',
    "<",
    ">",
    "^",
    "v",
    "?",
    "[",
    "]",
    "\\",
    ":",
    ";",
    ",",
    ".",
    "$",
    "#",
    "|",
    "_",
    "@",
  ]),
);

export const WORKSHOP_MIN_STEPS = 1;
export const WORKSHOP_MAX_STEPS_CAP = 10000;

export function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

export function gridsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  for (let r = 0; r < a.length; r += 1) {
    if (!Array.isArray(b[r]) || a[r].length !== b[r].length) {
      return false;
    }
    for (let c = 0; c < a[r].length; c += 1) {
      if (a[r][c] !== b[r][c]) {
        return false;
      }
    }
  }
  return true;
}

export function validateWorkshopGrid(grid) {
  if (!Array.isArray(grid) || grid.length !== WORKSHOP_GRID_SIZE) {
    return { ok: false, reason: `grid must be ${WORKSHOP_GRID_SIZE} rows` };
  }
  for (let r = 0; r < grid.length; r += 1) {
    const row = grid[r];
    if (!Array.isArray(row) || row.length !== WORKSHOP_GRID_SIZE) {
      return { ok: false, reason: `row ${r} must be ${WORKSHOP_GRID_SIZE} cells` };
    }
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      if (typeof cell !== "string" || cell.length !== 1 || !WORKSHOP_GLYPHS.has(cell)) {
        return {
          ok: false,
          reason: `invalid glyph at (${r},${c}): ${JSON.stringify(cell)}`,
        };
      }
    }
  }
  return { ok: true };
}

export function validateWorkshopMaxSteps(maxSteps) {
  if (
    !Number.isInteger(maxSteps) ||
    maxSteps < WORKSHOP_MIN_STEPS ||
    maxSteps > WORKSHOP_MAX_STEPS_CAP
  ) {
    return {
      ok: false,
      reason: `maxSteps must be an integer in [${WORKSHOP_MIN_STEPS},${WORKSHOP_MAX_STEPS_CAP}]`,
    };
  }
  return { ok: true };
}

// ---------- RFC 8785 JSON Canonicalization Scheme (I-JSON/RFC 7493 subset) ----------

function compareUtf16CodeUnits(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const diff = a.charCodeAt(i) - b.charCodeAt(i);
    if (diff !== 0) {
      return diff;
    }
  }
  return a.length - b.length;
}

export function jcsSerialize(value) {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("I-JSON / JCS forbids NaN and Infinity");
    }
    if (Object.is(value, -0)) {
      return "0";
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => jcsSerialize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort(compareUtf16CodeUnits);
    const props = keys.map((k) => `${JSON.stringify(k)}:${jcsSerialize(value[k])}`);
    return `{${props.join(",")}}`;
  }
  throw new TypeError(`Unsupported JCS value type: ${typeof value}`);
}

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function base64urlEncode(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  let out = "";
  for (let i = 0; i < data.length; i += 3) {
    const b0 = data[i];
    const b1 = i + 1 < data.length ? data[i + 1] : 0;
    const b2 = i + 2 < data.length ? data[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64URL_ALPHABET[(triple >> 18) & 63];
    out += BASE64URL_ALPHABET[(triple >> 12) & 63];
    out += i + 1 < data.length ? BASE64URL_ALPHABET[(triple >> 6) & 63] : "=";
    out += i + 2 < data.length ? BASE64URL_ALPHABET[triple & 63] : "=";
  }
  return out.replace(/=+$/, "");
}

export function base64urlDecode(text) {
  if (typeof text !== "string" || /[^A-Za-z0-9_-]/.test(text)) {
    return null;
  }
  const padded = text + "=".repeat((4 - (text.length % 4)) % 4);
  const normalized = padded.replace(/-/g, "+").replace(/_/g, "/");
  let bytes;
  try {
    const binary = atob(normalized);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
  } catch {
    return null;
  }
  return bytes;
}

export function makeWorkshopChallengeId(grid, maxSteps) {
  const payload = { grid, maxSteps };
  return base64urlEncode(TEXT_ENCODER.encode(jcsSerialize(payload)));
}

export function parseWorkshopChallengeId(id) {
  if (typeof id !== "string" || id.length === 0) {
    return null;
  }
  const bytes = base64urlDecode(id);
  if (!bytes) {
    return null;
  }
  let text;
  try {
    text = TEXT_DECODER.decode(bytes);
  } catch {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  if (!Array.isArray(payload.grid) || payload.grid.length !== WORKSHOP_GRID_SIZE) {
    return null;
  }
  for (const row of payload.grid) {
    if (!Array.isArray(row) || row.length !== WORKSHOP_GRID_SIZE) {
      return null;
    }
    for (const cell of row) {
      if (typeof cell !== "string" || cell.length !== 1) {
        return null;
      }
    }
  }
  if (!Number.isInteger(payload.maxSteps)) {
    return null;
  }
  return payload;
}

export function verifyWorkshopChallengeId(id, grid, maxSteps) {
  const payload = parseWorkshopChallengeId(id);
  if (!payload) {
    return { ok: false, valid: false, reason: "unparseable challenge descriptor" };
  }
  if (!gridsEqual(payload.grid, grid)) {
    return { ok: false, valid: false, reason: "grid mismatch" };
  }
  if (payload.maxSteps !== maxSteps) {
    return { ok: false, valid: false, reason: "maxSteps mismatch" };
  }
  // Canonicality check: re-serializing must reproduce the descriptor bytes.
  const canonical = base64urlEncode(
    TEXT_ENCODER.encode(jcsSerialize({ grid: payload.grid, maxSteps: payload.maxSteps })),
  );
  if (canonical !== id) {
    return { ok: false, valid: false, reason: "non-canonical descriptor" };
  }
  return { ok: true, valid: true };
}

/**
 * Derive the workshop trace: JS VM execution (always) plus native Zig C-ABI
 * when available. Returns `agreement: null` when the native oracle degrades
 * (JS-only runtime containers); otherwise `true`/`false` lockstep comparison.
 */
// Non-literal specifier so `Bun.build { target: "browser" }` (used by
// server.js and the bench bundle) does not trace this edge into the client
// bundle; `native-oracle.js` touches `node:fs` / `bun:ffi`.
const NATIVE_ORACLE_SPEC = ["..", "marid", "native-oracle.js"].join("/");

async function resolveNativeEval() {
  if (nativeEvalPromise) {
    return nativeEvalPromise;
  }
  nativeEvalPromise = (async () => {
    if (typeof Bun === "undefined") {
      return null;
    }
    try {
      const mod = await import(NATIVE_ORACLE_SPEC);
      return mod.evaluateGridWithNativeZig ?? null;
    } catch {
      return null;
    }
  })();
  return nativeEvalPromise;
}

export async function deriveWorkshopTrace(grid, maxSteps) {
  const gridCopy = cloneGrid(grid);
  const jsResult = executeProgram(gridCopy, { maxSteps, recordHistory: true });
  let zigResult = null;
  let zigError = null;
  const evaluateNative = await resolveNativeEval();
  if (evaluateNative) {
    try {
      zigResult = await evaluateNative(gridCopy, { maxSteps });
    } catch (err) {
      zigError = err instanceof Error ? err.message : String(err);
    }
  }
  const agreement =
    zigResult === null
      ? null
      : zigResult.halted === jsResult.halted &&
        zigResult.output === jsResult.output &&
        zigResult.steps === jsResult.steps;
  return {
    jsResult,
    zigResult,
    zigError,
    agreement,
    trace: jsResult.history,
  };
}
