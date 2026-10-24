// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Saturated Performance Benchmark Suite for Befunge-93 Vault Cracker.
 * Aligned with `hyperpolymath/proven-tests-and-benches/benchmarks` and
 * `hyperpolymath/standards` benchmarking requirements (p50, p95, p99, ops/sec, baseline gate).
 */

import { readFileSync } from "node:fs";
import process from "node:process";
import { compileVueSfcSource } from "../scripts/vue-sfc-plugin.js";
import { jcsSerialize } from "../scripts/jcs-canon.js";
import { EXPECTED_PASSCODE, GRID, WALK_TRACE, executeProgram } from "../src/engine/befunge93.js";
import { createInitialModel, update } from "../src/engine/game-state.js";
import { deriveWorkshopTrace, validateWorkshopGrid } from "../src/engine/workshop.js";
import { createMaridTrialRouter } from "../src/marid/local-trial-backend.js";
import { startVaultServer } from "../server.js";

const baseline = JSON.parse(readFileSync(new URL("./baseline.json", import.meta.url), "utf8"));

function summarizeSamples(name, iterations, totalMs, samplesUs) {
  samplesUs.sort();
  const p50Us = samplesUs[Math.floor(iterations * 0.5)];
  const p95Us = samplesUs[Math.floor(iterations * 0.95)];
  const p99Us = samplesUs[Math.floor(iterations * 0.99)];
  const opsPerSec = Math.round((iterations / totalMs) * 1000);
  return { name, iterations, totalMs: Number(totalMs.toFixed(2)), opsPerSec, p50Us, p95Us, p99Us };
}

function measureBench(name, iterations, fn) {
  for (let i = 0; i < Math.min(50, iterations); i += 1) {
    fn();
  }
  const samplesUs = new Float64Array(iterations);
  const startTotal = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    const t0 = performance.now();
    fn();
    samplesUs[i] = (performance.now() - t0) * 1000;
  }
  return summarizeSamples(name, iterations, performance.now() - startTotal, samplesUs);
}

async function measureAsyncBench(name, iterations, fn) {
  for (let i = 0; i < Math.min(15, iterations); i += 1) {
    await fn();
  }
  const samplesUs = new Float64Array(iterations);
  const startTotal = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    const t0 = performance.now();
    await fn();
    samplesUs[i] = (performance.now() - t0) * 1000;
  }
  return summarizeSamples(name, iterations, performance.now() - startTotal, samplesUs);
}

const pkgObj = JSON.parse(readFileSync("package.json", "utf8"));
// Every SFC the bundle ships. `sfc.compileAllComponents` is only a truthful
// name while this list matches `src/**/*.vue` on disk, so the two Custom Vault
// Workshop components are compiled here too.
const sfcSources = [
  ["App.vue", readFileSync("src/App.vue", "utf8")],
  ["PlayfieldGrid.vue", readFileSync("src/components/PlayfieldGrid.vue", "utf8")],
  ["ExecutionControls.vue", readFileSync("src/components/ExecutionControls.vue", "utf8")],
  ["PasscodeVault.vue", readFileSync("src/components/PasscodeVault.vue", "utf8")],
  ["TracePanel.vue", readFileSync("src/components/TracePanel.vue", "utf8")],
  ["AboutPanel.vue", readFileSync("src/components/AboutPanel.vue", "utf8")],
  ["TelemetryPanel.vue", readFileSync("src/components/TelemetryPanel.vue", "utf8")],
  ["WorkshopGrid.vue", readFileSync("src/components/WorkshopGrid.vue", "utf8")],
  ["WorkshopPanel.vue", readFileSync("src/components/WorkshopPanel.vue", "utf8")],
];

const benchRouter = createMaridTrialRouter({ maxRuns: 32, maxBufferedEvents: 16 });
const runsUrl = new URL("http://127.0.0.1:8000/api/vault/runs");
const postPayload = JSON.stringify({
  passcode: EXPECTED_PASSCODE,
  stagesCompleted: 18,
  attempts: 1,
  tempo: "ludicrous",
  callsign: "bench-op\nmultiline-note-alpha\nmultiline-note-beta",
});

// A Workshop-authored 10x10 torus used as the custom-grid fixture. Deterministic
// and representative: it mixes digits, arithmetic, string mode, the
// self-modifying `g`/`p` pair, and decorative no-op data glyphs (`=====`,
// `VAULT!`, `93-TEA`) of the kind the shipped levels are drawn with.
// Row 0 (`>5.@`) pushes 5, emits ASCII '5', and halts, giving a checkable
// invariant for the trace-derivation bench.
const WORKSHOP_BENCH_ROWS = Object.freeze([
  ">5.@      ",
  " g  p  #  ",
  "==========",
  "|VAULT!|  ",
  "|93-TEA|  ",
  "==========",
  "0123456789",
  "+-*/%!:;_@",
  '"OK"     @',
  "          ",
]);

const WORKSHOP_BENCH_GRID = Object.freeze(
  WORKSHOP_BENCH_ROWS.map((row) => Object.freeze([...row])),
);

const results = [
  measureBench("workshop.validateCustomGrid", 20000, () => {
    const { ok } = validateWorkshopGrid(WORKSHOP_BENCH_GRID);
    if (!ok) throw new Error("Workshop grid validation bench invariant failed");
  }),
  await measureAsyncBench("workshop.deriveTrace", 400, async () => {
    const derived = await deriveWorkshopTrace(WORKSHOP_BENCH_GRID, 500);
    // `.` emits the digit followed by this VM's conventional trailing space.
    if (!derived.jsResult.halted || derived.jsResult.output !== "5 ") {
      throw new Error("Workshop trace derivation bench invariant failed");
    }
  }),
  measureBench("vm.executeVaultGrid", 2000, () => {
    const r = executeProgram(GRID, { maxSteps: 500 });
    if (r.output !== EXPECTED_PASSCODE) throw new Error("VM bench invariant failed");
  }),
  measureBench("tea.fullPlaythrough", 1500, () => {
    let st = createInitialModel();
    for (let i = 0; i < WALK_TRACE.length; i += 1) {
      st = update(st, { type: "Step" });
    }
    st = update(st, { type: "InputPasscode", value: EXPECTED_PASSCODE });
    st = update(st, { type: "SubmitPasscode" });
    if (st.passcodeStatus !== "valid") throw new Error("TEA bench invariant failed");
  }),
  measureBench("jcs.canonicalizeManifest", 5000, () => {
    jcsSerialize(pkgObj);
  }),
  await measureAsyncBench("marid.postAndSseFrame", 800, async () => {
    const req = new Request(runsUrl.href, {
      method: "POST",
      headers: {
        Accept: "application/json, application/problem+json",
        "Content-Type": "application/json",
      },
      body: postPayload,
    });
    const res = await benchRouter.handle(req, runsUrl);
    if (!res || res.status !== 200) throw new Error("Marid router bench invariant failed");
  }),
  measureBench("sfc.compileAllComponents", 100, () => {
    for (const [fname, src] of sfcSources) {
      compileVueSfcSource(src, fname);
    }
  }),
  await measureAsyncBench("server.coldBootReady", 16, async () => {
    const srv = await startVaultServer({ hostname: "127.0.0.1", port: 0 });
    srv.stop(true);
  }),
];

let failed = false;
console.log("=== Befunge-93 Vault Cracker Benchmark Suite (Bun) ===");
for (const r of results) {
  const maxP95 = baseline.maxP95Microseconds[r.name];
  const pass = typeof maxP95 === "number" ? r.p95Us <= maxP95 : true;
  if (!pass) failed = true;
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${r.name.padEnd(28)} ${String(r.opsPerSec).padStart(8)} ops/s | p50=${r.p50Us.toFixed(1)}us p95=${r.p95Us.toFixed(1)}us p99=${r.p99Us.toFixed(1)}us (budget <=${maxP95}us)`,
  );
}

if (process.env.BENCH_JSON === "1") {
  console.log(`BENCH_JSON_PAYLOAD=${JSON.stringify(results)}`);
}

if (failed) {
  console.error("Benchmark p95 budget exceeded!");
  process.exit(1);
}
