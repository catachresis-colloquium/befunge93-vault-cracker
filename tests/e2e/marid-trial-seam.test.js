// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

import { existsSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { EXPECTED_PASSCODE } from "../../src/engine/befunge93.js";
import {
  ConflictError,
  MaridError,
  MaridWireClient,
  NotFoundError,
  TimeoutError,
  UnauthorizedError,
  ValidationError,
} from "../../src/marid/marid-wire-client.js";
import { startVaultServer } from "../../server.js";

describe("Marid Option-2 Companion Seam — Wire Client, Proxy & Vue Integration", () => {
  test("MaridError.fromProblemDetails maps RFC 9457 statuses to typed error classes", () => {
    expect(MaridError.fromProblemDetails({ status: 400, detail: "bad field" })).toBeInstanceOf(
      ValidationError,
    );
    expect(MaridError.fromProblemDetails({ status: 404, title: "Not Found" })).toBeInstanceOf(
      NotFoundError,
    );
    expect(MaridError.fromProblemDetails({ status: 409, title: "Conflict" })).toBeInstanceOf(
      ConflictError,
    );
    expect(MaridError.fromProblemDetails({ status: 403, title: "Forbidden" })).toBeInstanceOf(
      UnauthorizedError,
    );
    expect(MaridError.fromProblemDetails({ status: 504, title: "Gateway Timeout" })).toBeInstanceOf(
      TimeoutError,
    );
  });

  test("Stage A unary HTTP/JSON + RFC 9457 Problem Details accepts verified runs and rejects malformed or unverified inputs", async () => {
    const srv = await startVaultServer({ hostname: "127.0.0.1", port: 0 });
    try {
      const client = new MaridWireClient({ baseUrl: `http://127.0.0.1:${srv.port}` });
      const caps = await client.fetchJson("/api/marid/capabilities");
      expect(caps.backend).toBe("local-bun-shim");
      expect(caps.stageAUnaryJson).toBe(true);
      expect(caps.stageBSseEvents).toBe(true);
      expect(caps.storageMode).toBe("in_memory_ephemeral");
      const hasNativeZig = existsSync("_build/ffi/lib");
      expect(caps.nativeOracle).toEqual(
        hasNativeZig
          ? {
              available: true,
              engine: "zig-c-abi",
              agreesWithJsVm: true,
            }
          : {
              available: false,
              engine: "js-vm-only",
              agreesWithJsVm: false,
            },
      );

      const receipt = await client.fetchJson("/api/vault/runs", {
        method: "POST",
        body: {
          passcode: EXPECTED_PASSCODE,
          stagesCompleted: 26,
          attempts: 1,
          tempo: "brisk",
          callsign: "ada-lovelace",
        },
      });
      expect(receipt.accepted).toBe(true);
      expect(receipt.sequence).toBe(1);

      const ledger = await client.fetchJson("/api/vault/runs");
      expect(ledger.verifiedCount).toBe(1);
      expect(ledger.runs[0].callsign).toBe("ada-lovelace");

      const base = `http://127.0.0.1:${srv.port}`;

      // 1. Unverified passcode -> 400 ValidationError (`application/problem+json`)
      let wrongCodeErr = null;
      try {
        await client.fetchJson("/api/vault/runs", {
          method: "POST",
          body: { passcode: "12345678" },
        });
      } catch (err) {
        wrongCodeErr = err;
      }
      expect(wrongCodeErr).toBeInstanceOf(ValidationError);
      expect(wrongCodeErr.status).toBe(400);
      expect(wrongCodeErr.details.code).toBe("oracle_mismatch");

      // 2. Malformed JSON -> 400 RFC 9457
      const badJsonRes = await fetch(`${base}/api/vault/runs`, {
        method: "POST",
        headers: {
          Accept: "application/json, application/problem+json",
          "Content-Type": "application/json",
        },
        body: "{broken-json",
      });
      expect(badJsonRes.status).toBe(400);
      expect(badJsonRes.headers.get("content-type")).toContain("application/problem+json");

      // 3. Incompatible Accept -> 406 Not Acceptable
      const badAcceptRes = await fetch(`${base}/api/vault/runs`, {
        headers: { Accept: "text/xml" },
      });
      expect(badAcceptRes.status).toBe(406);

      // 4. Unsupported method -> 405 with Allow header
      const badMethodRes = await fetch(`${base}/api/vault/runs`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      expect(badMethodRes.status).toBe(405);
      expect(badMethodRes.headers.get("allow")).toBe("GET, POST");
    } finally {
      srv.stop(true);
    }
  });

  test("Stage B SSE replays missed sequences and emits marid.sync.resync_required when behind ring buffer", async () => {
    const srv = await startVaultServer({
      hostname: "127.0.0.1",
      port: 0,
      maxBufferedEvents: 2,
    });
    try {
      const base = `http://127.0.0.1:${srv.port}`;
      // Use `/events` path directly to prove byte-level compatibility with `@metadatastician/marid-client`
      const client = new MaridWireClient({ baseUrl: base, eventsPath: "/events" });

      for (const name of ["op-1", "op-2", "op-3", "op-4"]) {
        await client.fetchJson("/api/vault/runs", {
          method: "POST",
          body: { passcode: EXPECTED_PASSCODE, callsign: name },
        });
      }

      // Ring buffer holds seq 3 and seq 4 (`earliestRetainedSeq === 3`).
      // Requesting `last_event_id=1` (< 3 - 1) must trigger `onResyncRequired`.
      const resyncEvent = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Resync timeout")), 2500);
        const sub = client.subscribe(
          "vault.runs",
          {
            onResyncRequired: (payload) => {
              clearTimeout(t);
              sub.unsubscribe();
              resolve(payload);
            },
            onError: reject,
          },
          { lastEventId: 1 },
        );
      });
      expect(resyncEvent.type).toBe("marid.sync.resync_required");
      expect(resyncEvent.earliestAvailableSequence).toBe(3);

      // Requesting `last_event_id=2` (`=== earliestRetainedSeq - 1`) replays seq 3 and seq 4 cleanly.
      const replayed = [];
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Replay timeout")), 2500);
        const sub = client.subscribe(
          "vault.runs",
          {
            onEvent: (evt) => {
              replayed.push(evt);
              if (replayed.length === 2) {
                clearTimeout(t);
                sub.unsubscribe();
                resolve();
              }
            },
            onError: reject,
          },
          { lastEventId: 2 },
        );
      });
      expect(replayed.map((e) => e.sequence)).toEqual([3, 4]);
      expect(replayed.map((e) => e.run.callsign)).toEqual(["op-3", "op-4"]);
    } finally {
      srv.stop(true);
    }
  });

  test("MARID_UPSTREAM_URL reverse proxy bridges a Stage-A-only upstream Marid server and fails closed (503) if upstream is down", async () => {
    // Simulate a minimal Stage-A Julia `MaridHTTPJSONExt.serve_json` server (`/healthz` + `/api/vault/runs`, no SSE yet)
    const upstreamRuns = [];
    const mockMaridUpstream = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/healthz") {
          return Response.json({ status: "ok" });
        }
        if (u.pathname === "/api/vault/runs" && req.method === "GET") {
          return Response.json({
            storageMode: "in_memory_ephemeral",
            verifiedCount: upstreamRuns.length,
            runs: upstreamRuns,
          });
        }
        if (u.pathname === "/api/vault/runs" && req.method === "POST") {
          const body = await req.json();
          const run = {
            id: `julia-${upstreamRuns.length + 1}`,
            callsign: body.callsign || "julia-op",
            stagesCompleted: body.stagesCompleted ?? 26,
            attempts: body.attempts ?? 1,
            tempo: body.tempo ?? "brisk",
          };
          upstreamRuns.unshift(run);
          return Response.json({ accepted: true, sequence: upstreamRuns.length, run });
        }
        return new Response(
          JSON.stringify({ type: "about:blank", title: "Not Found", status: 404 }),
          { status: 404, headers: { "Content-Type": "application/problem+json" } },
        );
      },
    });

    const appSrv = await startVaultServer({
      hostname: "127.0.0.1",
      port: 0,
      maridUpstreamUrl: `http://127.0.0.1:${mockMaridUpstream.port}`,
    });

    try {
      const client = new MaridWireClient({ baseUrl: `http://127.0.0.1:${appSrv.port}` });
      const caps = await client.fetchJson("/api/marid/capabilities");
      expect(caps.backend).toBe("marid-upstream");
      expect(caps.stageAUnaryJson).toBe(true);
      expect(caps.stageBSseEvents).toBe(false);

      const postRes = await client.fetchJson("/api/vault/runs", {
        method: "POST",
        body: { passcode: EXPECTED_PASSCODE, callsign: "marid-trial-user" },
      });
      expect(postRes.run.id).toBe("julia-1");

      const ledger = await client.fetchJson("/api/vault/runs");
      expect(ledger.verifiedCount).toBe(1);
      expect(ledger.runs[0].callsign).toBe("marid-trial-user");
    } finally {
      appSrv.stop(true);
      mockMaridUpstream.stop(true);
    }

    // Point MARID_UPSTREAM_URL at a closed loopback port -> must fail loudly with 503 Problem Details
    const deadPortSrv = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("ok") });
    const closedPort = deadPortSrv.port;
    deadPortSrv.stop(true);

    const appSrvClosed = await startVaultServer({
      hostname: "127.0.0.1",
      port: 0,
      maridUpstreamUrl: `http://127.0.0.1:${closedPort}`,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${appSrvClosed.port}/api/marid/capabilities`, {
        headers: { Accept: "application/json, application/problem+json" },
      });
      expect(res.status).toBe(503);
      expect(res.headers.get("content-type")).toContain("application/problem+json");
    } finally {
      appSrvClosed.stop(true);
    }
  });

  test("TelemetryPanel Vue SFC renders companion status and submits cracked run in happy-dom", async () => {
    const win = new Window({ url: "http://127.0.0.1:8000/" });
    globalThis.window = win;
    globalThis.document = win.document;
    globalThis.HTMLElement = win.HTMLElement;
    globalThis.SVGElement = win.SVGElement;
    globalThis.Element = win.Element;
    globalThis.Node = win.Node;
    globalThis.Event = win.Event;
    globalThis.KeyboardEvent = win.KeyboardEvent;

    const srv = await startVaultServer({ hostname: "127.0.0.1", port: 0 });
    const { createApp, nextTick } = await import("vue");
    const { default: App } = await import("../../src/App.vue");

    const host = win.document.createElement("div");
    win.document.body.appendChild(host);
    const telemetryClient = new MaridWireClient({ baseUrl: `http://127.0.0.1:${srv.port}` });
    const app = createApp(App, { telemetryClient });
    app.mount(host);

    try {
      // Enter passcode on Vault tab first
      const passInput = host.querySelector("#vault-passcode-input");
      passInput.value = EXPECTED_PASSCODE;
      passInput.dispatchEvent(new win.Event("input", { bubbles: true }));
      await nextTick();

      // Switch to `telemetry` tab
      const telemetryTab = host.querySelector("#tab-telemetry");
      expect(telemetryTab).not.toBeNull();
      telemetryTab.click();
      await nextTick();

      const badge = host.querySelector('[data-testid="marid-mode-badge"]');
      for (let i = 0; i < 40 && badge.textContent.trim() === "Unprobed"; i += 1) {
        await new Promise((r) => setTimeout(r, 20));
        await nextTick();
      }
      expect(badge.textContent.trim()).toBe("Local Bun Trial Shim");

      const submitBtn = host.querySelector('[data-testid="marid-submit-run-btn"]');
      expect(submitBtn.disabled).toBe(false);
      submitBtn.click();
      for (let i = 0; i < 40 && !host.querySelector('[data-testid="marid-submit-ok"]'); i += 1) {
        await new Promise((r) => setTimeout(r, 20));
        await nextTick();
      }

      const okBanner = host.querySelector('[data-testid="marid-submit-ok"]');
      expect(okBanner).not.toBeNull();
      expect(okBanner.textContent).toContain("run-1");
      expect(host.querySelector('[data-testid="marid-verified-count"]').textContent.trim()).toBe("1");

      // Switch puzzle level to Level 3 (self-mod-cipher -> 68025714) and verify levelId forwarding
      const levelSelect = host.querySelector("#vault-level-select");
      levelSelect.value = "self-mod-cipher";
      levelSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
      await nextTick();

      host.querySelector("#tab-vault").click();
      await nextTick();
      const passInputLvl3 = host.querySelector("#vault-passcode-input");
      passInputLvl3.value = "68025714";
      passInputLvl3.dispatchEvent(new win.Event("input", { bubbles: true }));
      await nextTick();

      host.querySelector("#tab-telemetry").click();
      await nextTick();
      const badgeLvl3 = host.querySelector('[data-testid="marid-mode-badge"]');
      for (let i = 0; i < 40 && badgeLvl3.textContent.trim() === "Unprobed"; i += 1) {
        await new Promise((r) => setTimeout(r, 20));
        await nextTick();
      }
      const submitBtnLvl3 = host.querySelector('[data-testid="marid-submit-run-btn"]');
      expect(submitBtnLvl3.disabled).toBe(false);
      submitBtnLvl3.click();
      for (
        let i = 0;
        i < 40 && !host.querySelector('[data-testid="marid-submit-ok"]')?.textContent?.includes("run-2");
        i += 1
      ) {
        await new Promise((r) => setTimeout(r, 20));
        await nextTick();
      }
      expect(host.querySelector('[data-testid="marid-submit-ok"]')?.textContent).toContain("run-2");
      expect(host.querySelector('[data-testid="marid-verified-count"]').textContent.trim()).toBe("2");
    } finally {
      app.unmount();
      host.remove();
      srv.stop(true);
    }
  });

  test("Saturation: MaridWireClient handles timeouts, AbortSignal, 204, non-JSON errors, and CRLF SSE comments", async () => {
    // 1. TimeoutError on stalled fetch
    const slowClient = new MaridWireClient({
      baseUrl: "http://example.test",
      defaultTimeoutMs: 25,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        }),
    });
    let timedOut = null;
    try {
      await slowClient.fetchJson("/api/vault/runs");
    } catch (e) {
      timedOut = e;
    }
    expect(timedOut).toBeInstanceOf(TimeoutError);

    // 2. 204 No Content & non-JSON 502 plain text error fallback
    const edgeClient = new MaridWireClient({
      baseUrl: "http://example.test///",
      fetch: async (url) => {
        if (url.endsWith("/empty")) return new Response(null, { status: 204 });
        return new Response("Bad Gateway Text", { status: 502, statusText: "Bad Gateway" });
      },
    });
    expect(edgeClient.baseUrl).toBe("http://example.test");
    expect(await edgeClient.fetchJson("/empty")).toBeNull();
    let badGw = null;
    try {
      await edgeClient.fetchJson("/fail");
    } catch (e) {
      badGw = e;
    }
    expect(badGw).toBeInstanceOf(MaridError);
    expect(badGw.status).toBe(502);
    expect(badGw.message).toBe("Bad Gateway Text");

    // 3. CRLF SSE stream with comment heartbeat + multiline JSON data
    const crlfSse =
      ": heartbeat\r\n\r\nid: 7\r\nevent: vault.run.verified\r\ndata: {\r\ndata: \"sequence\": 7,\r\ndata: \"type\": \"vault.run.verified\"\r\ndata: }\r\n\r\n";
    const sseClient = new MaridWireClient({
      baseUrl: "http://example.test",
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(crlfSse));
              c.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    });

    const parsedEvents = [];
    await new Promise((resolve, reject) => {
      const sub = sseClient.subscribe("vault.runs", {
        onEvent: (evt) => {
          parsedEvents.push(evt);
          sub.unsubscribe();
          resolve();
        },
        onError: reject,
      });
    });
    expect(parsedEvents).toEqual([{ sequence: 7, type: "vault.run.verified" }]);

    // 4. Split-chunk CRLF (\r at end of chunk 1, \n at start of chunk 2) + unexpected EOF notification
    const splitClient = new MaridWireClient({
      baseUrl: "https://localhost",
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(c) {
              const enc = new TextEncoder();
              c.enqueue(enc.encode('id: 8\r\ndata: {"sequence":8,"type":"one"}\r\n\r'));
              c.enqueue(enc.encode('\nid: 9\r\ndata: {"sequence":9,"type":"two"}\r\n\r\n'));
              c.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
    });

    const splitEvents = [];
    let eofError = null;
    await new Promise((resolve) => {
      splitClient.subscribe(
        "vault.runs",
        {
          onEvent: (evt) => splitEvents.push(evt),
          onError: (err) => {
            eofError = err;
            resolve();
          },
        },
        { autoReconnect: false },
      );
    });
    expect(splitEvents).toEqual([
      { sequence: 8, type: "one" },
      { sequence: 9, type: "two" },
    ]);
    expect(eofError).toBeInstanceOf(MaridError);
  });
});
