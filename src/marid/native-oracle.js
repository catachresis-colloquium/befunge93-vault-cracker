// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Native Zig C-ABI Befunge-93 Oracle Bridge (`bun:ffi` -> `libbefunge93_vault_cracker`).
 *
 * Bridges the verified Zig C-ABI library (`ffi/zig/src/main.zig`, matching `src/abi/Foreign.idr`)
 * into the Bun server and property test suite so both arbitrary 10x10 Befunge-93 grids
 * (`befunge93_vault_cracker_eval_grid`) and the canonical vault grid (`run_vault`) execute
 * across the native C ABI in lockstep with the JavaScript VM.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTED_PASSCODE, parseGrid } from "../engine/befunge93.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(moduleDir, "../..");
const zigDir = resolve(repoRoot, "ffi/zig");
const ffiBuildPrefix = resolve(repoRoot, "_build/ffi");
const ffiCacheDir = resolve(repoRoot, "_build/ffi-cache");

let cachedSessionPromise = null;
let cachedOraclePromise = null;

function ensureNativeLibraryBuilt(suffix) {
  const libDir = resolve(ffiBuildPrefix, "lib");
  const libName =
    suffix === "dll"
      ? `befunge93_vault_cracker.${suffix}`
      : `libbefunge93_vault_cracker.${suffix}`;
  const targetLib = resolve(libDir, libName);
  if (existsSync(targetLib)) {
    return targetLib;
  }

  const res = spawnSync(
    "zig",
    ["build", "-Doptimize=ReleaseSafe", "--cache-dir", ffiCacheDir, "-p", ffiBuildPrefix],
    {
      cwd: zigDir,
      stdio: "pipe",
    },
  );
  if (res.status !== 0) {
    const stderrText = res.stderr ? res.stderr.toString("utf8").trim() : "zig build failed";
    throw new Error(stderrText || `zig exited with status ${res.status}`);
  }
  if (!existsSync(targetLib)) {
    throw new Error(`Expected Zig library missing at ${targetLib}`);
  }
  return targetLib;
}

function getNativeFfiSession() {
  if (!cachedSessionPromise) {
    cachedSessionPromise = (async () => {
      if (typeof globalThis.Bun === "undefined") {
        return null;
      }
      const { CString, FFIType, dlopen, ptr, suffix } = await import("bun:ffi");
      const libPath = ensureNativeLibraryBuilt(suffix);
      const lib = dlopen(libPath, {
        befunge93_vault_cracker_init: { args: [], returns: FFIType.ptr },
        befunge93_vault_cracker_free: { args: [FFIType.ptr], returns: FFIType.void },
        befunge93_vault_cracker_is_initialized: { args: [FFIType.ptr], returns: FFIType.u32 },
        befunge93_vault_cracker_eval_grid: {
          args: [
            FFIType.ptr,
            FFIType.ptr,
            FFIType.u32,
            FFIType.u32,
            FFIType.ptr,
            FFIType.u32,
            FFIType.ptr,
            FFIType.ptr,
          ],
          returns: FFIType.i32,
        },
        befunge93_vault_cracker_run_vault: {
          args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.ptr],
          returns: FFIType.i32,
        },
        befunge93_vault_cracker_version: { args: [], returns: FFIType.ptr },
      });

      const handle = lib.symbols.befunge93_vault_cracker_init();
      if (!handle) {
        lib.close();
        throw new Error("befunge93_vault_cracker_init returned null");
      }
      const initFlag = lib.symbols.befunge93_vault_cracker_is_initialized(handle);
      if (initFlag !== 1) {
        lib.symbols.befunge93_vault_cracker_free(handle);
        lib.close();
        throw new Error(`Expected initialized flag 1, got ${initFlag}`);
      }

      const verPtr = lib.symbols.befunge93_vault_cracker_version();
      const version = verPtr ? String(new CString(verPtr)) : "unknown";
      return {
        lib,
        handle,
        ptr,
        version,
        scratchGrid: new Uint8Array(100),
        scratchOut: new Uint8Array(8192),
        scratchMeta: new Uint32Array(2),
      };
    })();
  }
  return cachedSessionPromise;
}

/**
 * Evaluate any 10x10 Befunge-93 grid across the native Zig C-ABI (`befunge93_vault_cracker_eval_grid`).
 * Returns `null` on non-Bun runtimes so callers can fall back to the JS VM.
 */
export async function evaluateGridWithNativeZig(gridSource, options = {}) {
  const maxSteps = options.maxSteps ?? 500;
  const session = await getNativeFfiSession();
  if (!session) {
    return null;
  }

  const parsed = parseGrid(gridSource);
  if (parsed.length !== 10 || parsed[0].length !== 10) {
    throw new RangeError("Native Zig C-ABI eval_grid requires a 10x10 playfield");
  }

  const gridBytes = session.scratchGrid;
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 10; c += 1) {
      gridBytes[r * 10 + c] = parsed[r][c].charCodeAt(0) & 0xff;
    }
  }

  const neededCap = Math.max(4096, maxSteps * 24);
  const outBuf = neededCap <= session.scratchOut.byteLength ? session.scratchOut : new Uint8Array(neededCap);
  const outLen = session.scratchMeta.subarray(0, 1);
  const outHalted = session.scratchMeta.subarray(1, 2);
  outLen[0] = 0;
  outHalted[0] = 0;
  const rc = session.lib.symbols.befunge93_vault_cracker_eval_grid(
    session.handle,
    session.ptr(gridBytes),
    100,
    maxSteps,
    session.ptr(outBuf),
    outBuf.byteLength,
    session.ptr(outLen),
    session.ptr(outHalted),
  );
  if (rc !== 0) {
    throw new Error(`befunge93_vault_cracker_eval_grid failed with Result=${rc}`);
  }

  const slice = outBuf.subarray(0, outLen[0]);
  const chars = new Array(slice.length);
  for (let i = 0; i < slice.length; i += 1) {
    chars[i] = String.fromCharCode(slice[i]);
  }
  return {
    halted: outHalted[0] === 1,
    output: chars.join(""),
  };
}

export function probeNativeVaultOracle() {
  if (!cachedOraclePromise) {
    cachedOraclePromise = (async () => {
      if (typeof globalThis.Bun === "undefined") {
        return Object.freeze({
          available: false,
          engine: "js-vm-only",
          agreesWithJsVm: false,
          reason: "non-bun-runtime",
        });
      }

      try {
        const session = await getNativeFfiSession();
        const outBuf = new Uint8Array(16);
        const outLen = new Uint32Array(1);
        const rc = session.lib.symbols.befunge93_vault_cracker_run_vault(
          session.handle,
          session.ptr(outBuf),
          outBuf.byteLength,
          session.ptr(outLen),
        );
        if (rc !== 0) {
          throw new Error(`befunge93_vault_cracker_run_vault returned Result=${rc}`);
        }
        const passcode = new TextDecoder().decode(outBuf.subarray(0, outLen[0]));
        return Object.freeze({
          available: true,
          engine: "zig-c-abi",
          version: session.version,
          passcode,
          agreesWithJsVm: passcode === EXPECTED_PASSCODE,
        });
      } catch (err) {
        return Object.freeze({
          available: false,
          engine: "js-vm-only",
          agreesWithJsVm: false,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }
  return cachedOraclePromise;
}
