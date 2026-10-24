#!/usr/bin/env bun
// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Conformance verifier for the Option-2 Marid Companion Trial Contract.
 *
 * Usage:
 *   bun scripts/verify-marid-trial.js                          # tests built-in local Bun shim (Stage A + B)
 *   MARID_TRIAL_URL=http://127.0.0.1:6274 bun scripts/verify-marid-trial.js --stage a
 *   MARID_TRIAL_URL=http://127.0.0.1:6274 bun scripts/verify-marid-trial.js --stage all
 */

import { EXPECTED_PASSCODE } from "../src/engine/befunge93.js";
import { MaridWireClient, ValidationError } from "../src/marid/marid-wire-client.js";
import { startVaultServer } from "../server.js";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`Contract assertion failed: ${msg}`);
  }
}

const args = process.argv.slice(2);
const stageIdx = args.indexOf("--stage");
const requestedStage = stageIdx !== -1 && args[stageIdx + 1] ? args[stageIdx + 1].toLowerCase() : "all";
const externalUrl = process.env.MARID_TRIAL_URL || "";

let localServer = null;
let baseUrl = externalUrl;
let eventsPath = externalUrl ? "/events" : "/api/marid/events";

try {
  if (!baseUrl) {
    localServer = await startVaultServer({
      hostname: "127.0.0.1",
      port: 0,
      maxBufferedEvents: 3,
    });
    baseUrl = `http://127.0.0.1:${localServer.port}`;
  }

  const client = new MaridWireClient({ baseUrl, eventsPath });

  // --- Stage A: Unary JSON + RFC 9457 Problem Details ---
  const initialLedger = await client.fetchJson("/api/vault/runs");
  assert(Array.isArray(initialLedger.runs), "GET /api/vault/runs must return runs[]");

  // Negative check 1: wrong Content-Type -> 415 application/problem+json
  const badCtRes = await fetch(`${baseUrl}/api/vault/runs`, {
    method: "POST",
    headers: {
      Accept: "application/json, application/problem+json",
      "Content-Type": "text/plain",
    },
    body: "{}",
  });
  assert(badCtRes.status === 415, `expected 415 for text/plain POST, got ${badCtRes.status}`);
  assert(
    (badCtRes.headers.get("content-type") || "").includes("application/problem+json"),
    "415 response must carry application/problem+json",
  );

  // Negative check 2: unverified passcode -> 400 ValidationError (RFC 9457)
  let rejectedWrongPasscode = false;
  try {
    await client.fetchJson("/api/vault/runs", {
      method: "POST",
      body: { passcode: "00000000", stagesCompleted: 4, attempts: 1, tempo: "brisk" },
    });
  } catch (err) {
    rejectedWrongPasscode = err instanceof ValidationError && err.status === 400;
  }
  assert(rejectedWrongPasscode, "unverified passcode must throw RFC 9457 ValidationError (400)");

  // Positive check: verified passcode ("98261047") -> 200 accepted receipt
  const receipt = await client.fetchJson("/api/vault/runs", {
    method: "POST",
    body: {
      passcode: EXPECTED_PASSCODE,
      stagesCompleted: 26,
      attempts: 1,
      tempo: "ludicrous",
      callsign: "contract-probe",
    },
  });
  assert(receipt.accepted === true, "valid oracle passcode must return accepted: true");
  assert(receipt.run?.callsign === "contract-probe", "receipt must echo callsign");

  const updatedLedger = await client.fetchJson("/api/vault/runs");
  assert(updatedLedger.runs.length >= 1, "ledger must retain verified run");

  // --- Stage B: SSE Topic Stream (`/events?topic=vault.runs&last_event_id=...`) ---
  if (requestedStage === "all" || requestedStage === "b") {
    const received = [];
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for SSE replay")), 3000);
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
    assert(received[0]?.type === "vault.run.verified", "SSE stream must replay vault.run.verified");
  }

  console.log(
    `[OK] Marid trial contract verified (target=${externalUrl || "local-bun-shim"}, stage=${requestedStage})`,
  );
} finally {
  if (localServer) {
    localServer.stop(true);
  }
}
