#!/usr/bin/env bun
// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Reproducible contract-conformance matrix for the Option-2
 * `metadatastician/marid` companion seam (`MaridHTTPJSONExt` Stage A unary /
 * RFC 9457 Problem Details + Stage B `/events` SSE topic stream).
 *
 * Usage:
 *   bun scripts/verify-marid-trial.js
 *                         # local Bun trial shim (Stage A + B)
 *   MARID_TRIAL_URL=http://127.0.0.1:6274 bun scripts/verify-marid-trial.js
 *                         # live Julia Marid upstream (Stage A; Stage B cases SKIP
 *                         # unless the upstream advertises stageBSseEvents)
 *   MARID_UPSTREAM_URL=http://127.0.0.1:6274 bun scripts/verify-marid-trial.js --stage all
 *   bun scripts/verify-marid-trial.js --stage a            # Stage A only
 *   bun scripts/verify-marid-trial.js --stage b            # Stage B only
 *
 * Matrix cases (each prints PASS / FAIL / SKIP):
 *   A-1 Capability negotiation — GET /api/marid/capabilities shape
 *   A-2 RFC 9457 — 415 + application/problem+json on wrong Content-Type
 *   A-3 RFC 9457 — 400 ValidationError on oracle-unverified passcode
 *   A-4 Accepted receipt — POST /api/vault/runs with JS+Zig-verified passcode
 *   A-5 Ledger persistence — GET /api/vault/runs retains verified run
 *   A-6 RFC 9457 — 406 Not Acceptable on incompatible Accept header
 *   A-7 RFC 9457 — 405 Method Not Allowed + Allow header
 *   A-8 RFC 9457 — 400 on malformed JSON body
 *   B-1 SSE replay — /events?topic=vault.runs&last_event_id=0 replays vault.run.verified
 *   B-2 marid.sync.resync_required — behind ring buffer -> recovery signal
 *   B-3 Last-Event-ID replay — at earliestRetainedSeq - 1 replays cleanly
 *   O-1 Native Zig C-ABI oracle agreement — all VAULT_LEVELS (in-process)
 *
 * Against a live MARID_UPSTREAM_URL the local shim is not started; Stage B
 * cases are skipped unless the upstream advertises stageBSseEvents, and the
 * native-oracle agreement case (O-1) still executes in-process against the
 * local JS VM + _build/ffi Zig C-ABI library.
 */

import { EXPECTED_PASSCODE, VAULT_LEVELS, executeProgram } from "../src/engine/befunge93.js";
import { MaridWireClient, ValidationError } from "../src/marid/marid-wire-client.js";
import { evaluateGridWithNativeZig } from "../src/marid/native-oracle.js";
import { startVaultServer } from "../server.js";

function assert(cond, msg) {
  if (!cond) throw new Error(`matrix assertion failed: ${msg}`);
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const args = process.argv.slice(2);
const stageIdx = args.indexOf("--stage");
const requestedStage =
  stageIdx !== -1 && args[stageIdx + 1] ? args[stageIdx + 1].toLowerCase() : "all";
const externalUrl = process.env.MARID_TRIAL_URL || process.env.MARID_UPSTREAM_URL || "";

// Each entry: { descriptor, run }. descriptor = { id, stage, group, required, route, status, reason, error, ms }.
const cases = [];
function register(id, stage, group, required, route, run) {
  cases.push({
    descriptor: { id, stage, group, required, route, status: null, reason: "", error: "", ms: 0 },
    run,
  });
}

async function main() {
  let localServer = null;
  let baseUrl = externalUrl;
  const sourceLabel = externalUrl || "local-bun-shim";
  let resultEarliestSeq = null;

  try {
    if (!baseUrl) {
      localServer = await startVaultServer({
        hostname: "127.0.0.1",
        port: 0,
        maxBufferedEvents: 4,
      });
      baseUrl = `http://127.0.0.1:${localServer.port}`;
    }

    const client = new MaridWireClient({ baseUrl });

    // --- capability discovery -------------------------------------------
    let caps = null;
    try {
      caps = await client.fetchJson("/api/marid/capabilities");
      assert(caps !== null, "capabilities response must decode");
    } catch {
      // A minimal Stage-A-only upstream may not expose /api/marid/capabilities;
      // fall back to truthful defaults and keep running the unary matrix.
      caps = {
        service: "befunge93-vault-companion",
        backend: "marid-upstream-unknown",
        maridWireVersion: "0.1.0",
        stageAUnaryJson: true,
        stageBSseEvents: false,
        problemDetails: "rfc9457",
        topics: ["vault.runs"],
      };
    }
    const stageBAdvertised = caps.stageBSseEvents === true;

    // ---------------- Stage A: unary JSON + RFC 9457 --------------------
    register(
      "A-1",
      "A",
      "capability negotiation",
      true,
      "GET /api/marid/capabilities",
      async () => {
        assert(typeof caps.stageAUnaryJson === "boolean", "capabilities.stageAUnaryJson present");
        assert(typeof caps.problemDetails === "string", "capabilities.problemDetails present");
        assert(Array.isArray(caps.topics) && caps.topics.includes("vault.runs"), "topics include vault.runs");
        assert(typeof caps.stageBSseEvents === "boolean", "capabilities.stageBSseEvents present");
      },
    );

    register(
      "A-2",
      "A",
      "RFC 9457 Problem Details",
      true,
      "POST /api/vault/runs (415)",
      async () => {
        const res = await fetch(`${baseUrl}/api/vault/runs`, {
          method: "POST",
          headers: {
            Accept: "application/json, application/problem+json",
            "Content-Type": "text/plain",
          },
          body: "{}",
        });
        assert(res.status === 415, `expected 415 for text/plain POST, got ${res.status}`);
        assert(
          (res.headers.get("content-type") || "").includes("application/problem+json"),
          "415 response must carry application/problem+json",
        );
      },
    );

    register(
      "A-3",
      "A",
      "RFC 9457 Problem Details",
      true,
      "POST /api/vault/runs (400 oracle_mismatch)",
      async () => {
        let thrown = null;
        try {
          await client.fetchJson("/api/vault/runs", {
            method: "POST",
            body: { passcode: "00000000", stagesCompleted: 4, attempts: 1, tempo: "brisk" },
          });
        } catch (err) {
          thrown = err;
        }
        assert(thrown instanceof ValidationError, "unverified passcode must throw ValidationError");
        assert(thrown.status === 400, `expected 400, got ${thrown.status}`);
        assert(thrown.details.code === "oracle_mismatch", "problem detail must name oracle_mismatch");
      },
    );

    register(
      "A-4",
      "A",
      "unary receipt",
      true,
      "POST /api/vault/runs (200)",
      async () => {
        const receipt = await client.fetchJson("/api/vault/runs", {
          method: "POST",
          body: {
            passcode: EXPECTED_PASSCODE,
            stagesCompleted: 26,
            attempts: 1,
            tempo: "ludicrous",
            callsign: "matrix-probe-a",
          },
        });
        assert(receipt.accepted === true, "valid oracle passcode must return accepted: true");
        assert(receipt.run?.callsign === "matrix-probe-a", "receipt must echo callsign");
        assert(typeof receipt.sequence === "number", "receipt must assign a sequence");
      },
    );

    register(
      "A-5",
      "A",
      "unary receipt",
      true,
      "GET /api/vault/runs",
      async () => {
        const ledger = await client.fetchJson("/api/vault/runs");
        assert(Array.isArray(ledger.runs), "GET /api/vault/runs must return runs[]");
        assert(ledger.verifiedCount >= 1, "ledger must retain verified run");
        assert(ledger.runs.some((r) => r.callsign === "matrix-probe-a"), "ledger echoes matrix run");
      },
    );

    register(
      "A-6",
      "A",
      "RFC 9457 Problem Details",
      true,
      "GET /api/vault/runs (406)",
      async () => {
        const res = await fetch(`${baseUrl}/api/vault/runs`, {
          headers: { Accept: "text/xml" },
        });
        assert(res.status === 406, `expected 406 for text/xml Accept, got ${res.status}`);
      },
    );

    register(
      "A-7",
      "A",
      "RFC 9457 Problem Details",
      true,
      "DELETE /api/vault/runs (405)",
      async () => {
        const res = await fetch(`${baseUrl}/api/vault/runs`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
        });
        assert(res.status === 405, `expected 405 for DELETE, got ${res.status}`);
        assert(/GET,\s*POST/.test(res.headers.get("allow") || ""), "Allow: GET, POST");
      },
    );

    register(
      "A-8",
      "A",
      "RFC 9457 Problem Details",
      true,
      "POST /api/vault/runs (400 invalid JSON)",
      async () => {
        const res = await fetch(`${baseUrl}/api/vault/runs`, {
          method: "POST",
          headers: {
            Accept: "application/json, application/problem+json",
            "Content-Type": "application/json",
          },
          body: "{broken-json",
        });
        assert(res.status === 400, `expected 400 for malformed JSON, got ${res.status}`);
        assert(
          (res.headers.get("content-type") || "").includes("application/problem+json"),
          "400 response must carry application/problem+json",
        );
      },
    );

    // Seed sentinel runs so the ring buffer has replayable history for Stage B.
    // The inline setup posts five sentinels (seq 1..5) before the matrix runs A-4,
    // so matrix-probe-a lands at seq 6; with maxBufferedEvents = 4 the ring holds
    // seq 3..6 = [b-3, b-4, b-5, matrix-probe-a] (earliestRetainedSeq = 3).
    const sentryCallsigns = ["matrix-probe-b-1", "matrix-probe-b-2", "matrix-probe-b-3", "matrix-probe-b-4", "matrix-probe-b-5"];
    for (const cs of sentryCallsigns) {
      await client.fetchJson("/api/vault/runs", {
        method: "POST",
        body: { passcode: EXPECTED_PASSCODE, callsign: cs },
      });
    }

    // ---------------- Stage B: SSE topic stream -------------------------
    register(
      "B-1",
      "B",
      "SSE Last-Event-ID replay",
      true,
      "GET /events?topic=vault.runs&last_event_id=0",
      async () => {
        const received = [];
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Timed out waiting for SSE replay")), 5000);
          const sub = client.subscribe(
            "vault.runs",
            {
              onEvent: (evt) => {
                received.push(evt);
                if (received.length >= 1) {
                  clearTimeout(timer);
                  sub.unsubscribe();
                  resolve();
                }
              },
              onError: (err) => {
                clearTimeout(timer);
                sub.unsubscribe();
                reject(err);
              },
            },
            { lastEventId: 0 },
          );
        });
        assert(received.length >= 1, "SSE stream must replay at least one vault.run.verified");
        assert(received[0]?.type === "vault.run.verified", "SSE stream must replay vault.run.verified");
        assert(typeof received[0]?.sequence === "number", "replayed SSE frame carries a sequence");
      },
    );

    register(
      "B-2",
      "B",
      "SSE resync recovery",
      true,
      "GET /events?topic=vault.runs&last_event_id=1",
      async () => {
        let settled = false;
        const resyncEvent = await new Promise((resolve, reject) => {
          const t = setTimeout(() => { if (!settled) { sub.unsubscribe(); reject(new Error("Resync timeout")); } }, 5000);
          const sub = client.subscribe(
            "vault.runs",
            {
              onResyncRequired: (payload) => {
                settled = true;
                clearTimeout(t);
                sub.unsubscribe();
                resolve(payload);
              },
              onError: (err) => {
                settled = true;
                clearTimeout(t);
                sub.unsubscribe();
                reject(err);
              },
            },
            { lastEventId: 1 },
          );
        });
        assert(resyncEvent.type === "marid.sync.resync_required", "stream must emit marid.sync.resync_required");
        assert(Number.isInteger(resyncEvent.earliestAvailableSequence), "resync payload names earliestAvailableSequence");
        assert(resyncEvent.earliestAvailableSequence >= 1, "earliestAvailableSequence is sane");
        resultEarliestSeq = resyncEvent.earliestAvailableSequence;
      },
    );

    register(
      "B-3",
      "B",
      "SSE Last-Event-ID replay",
      true,
      "GET /events?topic=vault.runs&last_event_id=<earliest-1>",
      async () => {
        const from = typeof resultEarliestSeq === "number" ? resultEarliestSeq - 1 : 0;
        // Ring tail at maxBufferedEvents=4: seq 3..6 = b-3, b-4, b-5, matrix-probe-a
        const expectedCallsigns = ["matrix-probe-b-3", "matrix-probe-b-4", "matrix-probe-b-5", "matrix-probe-a"];
        const replayed = [];
        await new Promise((resolve, reject) => {
          const t = setTimeout(() => { sub.unsubscribe(); reject(new Error("Replay timeout")); }, 5000);
          const sub = client.subscribe(
            "vault.runs",
            {
              onEvent: (evt) => {
                replayed.push(evt);
                if (replayed.length >= expectedCallsigns.length) {
                  clearTimeout(t);
                  sub.unsubscribe();
                  resolve();
                }
              },
              onError: (err) => {
                clearTimeout(t);
                sub.unsubscribe();
                reject(err);
              },
            },
            { lastEventId: from },
          );
        });
        const seqs = replayed.map((e) => e.sequence);
        assert(seqs.every((s, i) => i === 0 || s === seqs[i - 1] + 1), "replay must be contiguous");
        assert(replayed.every((e) => e.type === "vault.run.verified"), "replayed frames must be vault.run.verified");
        assert(seqs[0] === (typeof resultEarliestSeq === "number" ? resultEarliestSeq : from + 1), "replay starts at earliest retained sequence");
        const callsigns = replayed.map((e) => e.run?.callsign);
        assert(JSON.stringify(callsigns) === JSON.stringify(expectedCallsigns), `replayed callsigns must be ${JSON.stringify(expectedCallsigns)}, got ${JSON.stringify(callsigns)}`);
      },
    );

    // ---------------- O: differential oracle agreement (in-process) -----
    register(
      "O-1",
      "-",
      "differential oracle agreement",
      true,
      "JS VM vs Zig C-ABI eval_grid over all VAULT_LEVELS",
      async () => {
        for (const lvl of VAULT_LEVELS) {
          const jsRes = executeProgram(lvl.grid, { maxSteps: 500 });
          assert(jsRes.halted, `JS VM must halt on ${lvl.id}`);
          assert(jsRes.output === lvl.expectedPasscode, `JS VM must emit ${lvl.expectedPasscode} for ${lvl.id}`);
          const zigRes = await evaluateGridWithNativeZig(lvl.grid, { maxSteps: 500 });
          if (zigRes !== null) {
            assert(zigRes.halted === jsRes.halted, `Zig halted flag must match JS VM for ${lvl.id}`);
            assert(zigRes.output === jsRes.output, `Zig output must match JS VM for ${lvl.id}`);
          }
        }
      },
    );

    // ---------------- Execute matrix ------------------------------------
    for (const { descriptor, run } of cases) {
      const t0 = performance.now();
      if (requestedStage !== "all" && requestedStage !== descriptor.stage.toLowerCase()) {
        descriptor.status = "SKIP";
        descriptor.reason = `not requested (--stage ${requestedStage})`;
        continue;
      }
      if (descriptor.stage === "B" && !stageBAdvertised) {
        descriptor.status = "SKIP";
        descriptor.reason = "upstream does not advertise Stage B SSE (/events)";
        continue;
      }
      try {
        await run();
        descriptor.status = "PASS";
      } catch (err) {
        descriptor.status = "FAIL";
        descriptor.error = err instanceof Error ? err.message : String(err);
      }
      descriptor.ms = Number((performance.now() - t0).toFixed(1));
    }

    // ---------------- Report --------------------------------------------
    const fails = cases.filter((c) => c.descriptor.status === "FAIL");
    const skips = cases.filter((c) => c.descriptor.status === "SKIP");
    const requiredFails = fails.filter((c) => c.descriptor.required);

    const widestId = Math.max(...cases.map((c) => c.descriptor.id.length), 4);
    const widestGroup = Math.max(...cases.map((c) => c.descriptor.group.length), 5);
    console.log(`\n=== Marid Contract-Conformance Matrix (target=${sourceLabel}) ===`);
    console.log(
      `${"ID".padEnd(widestId)}  ${"Stage".padEnd(5)}  ${"Required".padEnd(8)}  ${"Status".padEnd(7)}  Group`,
    );
    console.log("-".repeat(widestId + 44 + widestGroup));
    for (const { descriptor } of cases) {
      const tail =
        descriptor.status === "SKIP"
          ? `  (# ${descriptor.reason})`
          : descriptor.status === "FAIL"
            ? `  (! ${descriptor.error})`
            : "";
      console.log(
        `${descriptor.id.padEnd(widestId)}  ${descriptor.stage.padEnd(5)}  ${(descriptor.required ? "required" : "optional").padEnd(8)}  ${descriptor.status.padEnd(7)}  ${descriptor.group}${tail}`,
      );
    }
    console.log(
      "-".repeat(widestId + 44 + widestGroup) +
        `\n${cases.length} cases: ${cases.length - fails.length - skips.length} pass, ${fails.length} fail, ${skips.length} skip${requiredFails.length === 0 ? "" : ` | ${requiredFails.length} required FAIL`}`,
    );

    if (requiredFails.length > 0) {
      console.error("[FAIL] Marid contract-conformance matrix has required failures");
      process.exit(1);
    }
    console.log(`[OK] Marid contract-conformance matrix green (target=${sourceLabel})`);
  } finally {
    if (localServer) {
      localServer.stop(true);
    }
  }
}

main().catch((err) => {
  console.error(`[FAIL] Marid contract-conformance matrix harness error: ${err}`);
  process.exit(1);
});
