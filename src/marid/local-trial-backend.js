// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Local Marid-Wire Trial Backend & Transparent `MARID_UPSTREAM_URL` Reverse Proxy.
 *
 * Implements the exact HTTP/JSON + RFC 9457 Problem Details + W3C SSE seam expected by
 * `@metadatastician/marid-client` (`MaridHTTPJSONExt.jl` + `MaridTransport.format_sse_event`):
 *
 * - Stage A (Unary HTTP/JSON + RFC 9457):
 *   - `GET  /api/marid/capabilities`
 *   - `GET  /api/vault/runs`
 *   - `POST /api/vault/runs` (verifies passcode against the real Befunge-93 VM oracle)
 * - Stage B (SSE Topic Streaming with Sequence Replay & Gap Resync):
 *   - `GET  /api/marid/events?topic=vault.runs&last_event_id=<seq>` (aliased at `/events`)
 *
 * When `upstreamUrl` (`MARID_UPSTREAM_URL`) is configured, `/api/*` and `/events` proxy
 * directly to the external Julia `Marid` server and fail closed (`503 application/problem+json`)
 * if the upstream is unreachable — never silently faking persistence or upstream health.
 */

import {
  EXPECTED_PASSCODE,
  GRID,
  TEMPO_MODES,
  VAULT_LEVELS,
  WALK_TRACE,
  executeProgram,
  getVaultLevel,
} from "../engine/befunge93.js";
import { stripTrailingSlashes } from "./marid-wire-client.js";
import { evaluateGridWithNativeZig, probeNativeVaultOracle } from "./native-oracle.js";

const JSON_MIME = "application/json; charset=utf-8";
const PROBLEM_MIME = "application/problem+json; charset=utf-8";
const SSE_MIME = "text/event-stream; charset=utf-8";

function makeTraceId(seq) {
  return `bf93-marid-${Date.now().toString(36)}-${seq}`;
}

function acceptsJson(acceptHeader) {
  if (!acceptHeader || acceptHeader.trim() === "") return true;
  const lower = acceptHeader.toLowerCase();
  return (
    lower.includes("*/*") ||
    lower.includes("application/*") ||
    lower.includes("application/json") ||
    lower.includes("application/problem+json")
  );
}

function formatSseFrame({ id, event, data }) {
  const lines = [];
  if (id !== undefined && id !== null && String(id) !== "") {
    lines.push(`id: ${id}`);
  }
  if (event) {
    lines.push(`event: ${event}`);
  }
  const serialized = typeof data === "string" ? data : JSON.stringify(data);
  for (const line of serialized.split("\n")) {
    lines.push(`data: ${line}`);
  }
  lines.push("", "");
  return lines.join("\n");
}

export function createMaridTrialRouter(options = {}) {
  const maxRuns = options.maxRuns ?? 32;
  const maxBufferedEvents = options.maxBufferedEvents ?? 16;
  const upstreamUrl = options.upstreamUrl ? stripTrailingSlashes(options.upstreamUrl) : "";
  const baseHeaders = options.securityHeaders ?? {};
  const fetchImpl = options.fetchImpl ?? fetch;

  // Compute the authoritative VM oracle once at router initialization.
  const oracleExec = executeProgram(GRID, { maxSteps: 500 });
  const oraclePasscode = oracleExec.halted ? oracleExec.output : EXPECTED_PASSCODE;

  const levelOracleCache = new Map();
  function verifyLevelPasscode(levelId) {
    let cached = levelOracleCache.get(levelId);
    if (!cached) {
      const level = getVaultLevel(levelId);
      cached = (async () => {
        const jsEval =
          level.id === "vault-alpha"
            ? { halted: true, output: oraclePasscode }
            : executeProgram(level.grid, { maxSteps: 500 });
        const zigEval = await evaluateGridWithNativeZig(level.grid, { maxSteps: 500 }).catch(
          () => null,
        );
        return { level, jsEval, zigEval };
      })();
      levelOracleCache.set(levelId, cached);
    }
    return cached;
  }

  let reqCounter = 0;
  let sequence = 0;
  let earliestRetainedSeq = 1;
  const verifiedRuns = [];
  const eventRing = [];
  const subscribers = new Set();

  function jsonResponse(status, payload, traceId, extraHeaders = {}) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        ...baseHeaders,
        "Content-Type": JSON_MIME,
        Vary: "Accept",
        "X-Content-Type-Options": "nosniff",
        "X-Request-ID": traceId,
        ...extraHeaders,
      },
    });
  }

  function problemResponse(status, title, detail, traceId, extra = {}, extraHeaders = {}) {
    const body = {
      type: extra.type || "about:blank",
      title,
      status,
      detail,
      ...extra,
    };
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        ...baseHeaders,
        "Content-Type": PROBLEM_MIME,
        Vary: "Accept",
        "X-Content-Type-Options": "nosniff",
        "X-Request-ID": traceId,
        ...extraHeaders,
      },
    });
  }

  function emitTopicEvent(topic, type, payload) {
    sequence += 1;
    const evt = {
      sequence,
      topic,
      type,
      emittedAt: new Date().toISOString(),
      ...payload,
    };
    eventRing.push(evt);
    if (eventRing.length > maxBufferedEvents) {
      eventRing.shift();
      earliestRetainedSeq = eventRing[0].sequence;
    }
    const encoded = new TextEncoder().encode(
      formatSseFrame({ id: sequence, event: type, data: evt }),
    );
    for (const sub of subscribers) {
      if (sub.topic === topic) {
        try {
          sub.controller.enqueue(encoded);
        } catch {
          subscribers.delete(sub);
        }
      }
    }
    return evt;
  }

  async function proxyToUpstream(req, url, traceId) {
    // Map browser-facing `/api/marid/events` to Marid's canonical `/events` stream path
    let targetPath = url.pathname;
    if (url.pathname === "/api/marid/events") {
      targetPath = "/events";
    }
    const targetUrl = `${upstreamUrl}${targetPath}${url.search}`;

    // If upstream is a minimal Stage-A Marid server (only `/api/vault/runs` + `/healthz`),
    // synthesize capability discovery truthfully from upstream `/api/marid/capabilities` or `/healthz`.
    if (url.pathname === "/api/marid/capabilities" && req.method === "GET") {
      try {
        const capRes = await fetchImpl(`${upstreamUrl}/api/marid/capabilities`, {
          headers: { Accept: "application/json, application/problem+json" },
        });
        if (capRes.ok) {
          const upstreamCaps = await capRes.json();
          return jsonResponse(
            200,
            {
              service: "befunge93-vault-companion",
              backend: "marid-upstream",
              maridWireVersion: "0.1.0",
              storageMode: upstreamCaps.storageMode || "in_memory_ephemeral",
              stageAUnaryJson: true,
              stageBSseEvents: Boolean(upstreamCaps.stageBSseEvents),
              problemDetails: "rfc9457",
              topics: upstreamCaps.topics || ["vault.runs"],
              ...upstreamCaps,
            },
            traceId,
          );
        }
        if (capRes.status === 404) {
          const healthRes = await fetchImpl(`${upstreamUrl}/healthz`, {
            headers: { Accept: "application/json, application/problem+json" },
          });
          if (healthRes.ok) {
            return jsonResponse(
              200,
              {
                service: "befunge93-vault-companion",
                backend: "marid-upstream",
                maridWireVersion: "0.1.0",
                storageMode: "in_memory_ephemeral",
                stageAUnaryJson: true,
                stageBSseEvents: false,
                problemDetails: "rfc9457",
                topics: [],
              },
              traceId,
            );
          }
        }
      } catch (err) {
        return problemResponse(
          503,
          "Service Unavailable",
          `Configured MARID_UPSTREAM_URL (${upstreamUrl}) is unreachable: ${err instanceof Error ? err.message : String(err)}`,
          traceId,
        );
      }
    }

    try {
      const upstreamHeaders = new Headers();
      for (const key of ["accept", "content-type", "cache-control", "last-event-id"]) {
        const val = req.headers.get(key);
        if (val) upstreamHeaders.set(key, val);
      }
      const init = {
        method: req.method,
        headers: upstreamHeaders,
        signal: req.signal,
      };
      if (req.method !== "GET" && req.method !== "HEAD") {
        init.body = await req.arrayBuffer();
      }
      const upstreamRes = await fetchImpl(targetUrl, init);
      const outHeaders = new Headers(baseHeaders);
      for (const [k, v] of upstreamRes.headers.entries()) {
        outHeaders.set(k, v);
      }
      if (!outHeaders.has("X-Request-ID")) {
        outHeaders.set("X-Request-ID", traceId);
      }
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: outHeaders,
      });
    } catch (err) {
      return problemResponse(
        503,
        "Service Unavailable",
        `Upstream Marid companion (${upstreamUrl}) failed: ${err instanceof Error ? err.message : String(err)}`,
        traceId,
      );
    }
  }

  async function handle(req, url) {
    const isTrialRoute =
      url.pathname === "/api/marid/capabilities" ||
      url.pathname === "/api/vault/runs" ||
      url.pathname === "/api/marid/events" ||
      url.pathname === "/events";

    if (!isTrialRoute) return null;

    reqCounter += 1;
    const traceId = makeTraceId(reqCounter);

    if (upstreamUrl) {
      return proxyToUpstream(req, url, traceId);
    }

    // --- Stage B: SSE stream (`GET /api/marid/events` or `GET /events`) ---
    if (url.pathname === "/api/marid/events" || url.pathname === "/events") {
      if (req.method !== "GET") {
        return problemResponse(
          405,
          "Method Not Allowed",
          "SSE endpoint only accepts GET",
          traceId,
          {},
          { Allow: "GET" },
        );
      }
      const topic = url.searchParams.get("topic") || "vault.runs";
      const lastEventRaw =
        url.searchParams.get("last_event_id") ?? req.headers.get("last-event-id") ?? "0";
      const lastEventId = /^\d+$/.test(lastEventRaw) ? Number(lastEventRaw) : 0;

      let subRecord = null;
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          // Initial comment frame flushes headers immediately across fetch/proxy layers
          controller.enqueue(encoder.encode(`: marid-sse-connected topic=${topic}\n\n`));

          if (lastEventId > 0 && eventRing.length > 0 && lastEventId < earliestRetainedSeq - 1) {
            const resyncPayload = {
              sequence,
              topic,
              type: "marid.sync.resync_required",
              earliestAvailableSequence: earliestRetainedSeq,
              requestedLastEventId: lastEventId,
            };
            controller.enqueue(
              encoder.encode(
                formatSseFrame({
                  id: sequence,
                  event: "resync_required",
                  data: resyncPayload,
                }),
              ),
            );
          } else if (lastEventId < sequence) {
            for (const evt of eventRing) {
              if (evt.topic === topic && evt.sequence > lastEventId) {
                controller.enqueue(
                  encoder.encode(
                    formatSseFrame({ id: evt.sequence, event: evt.type, data: evt }),
                  ),
                );
              }
            }
          }

          subRecord = { topic, controller };
          subscribers.add(subRecord);

          req.signal?.addEventListener(
            "abort",
            () => {
              subscribers.delete(subRecord);
              try {
                controller.close();
              } catch {
                // already closed
              }
            },
            { once: true },
          );
        },
        cancel() {
          if (subRecord) subscribers.delete(subRecord);
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          ...baseHeaders,
          "Content-Type": SSE_MIME,
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Content-Type-Options": "nosniff",
          "X-Request-ID": traceId,
        },
      });
    }

    // Content negotiation guard matching `MaridHTTPJSONExt.jl`
    if (!acceptsJson(req.headers.get("accept"))) {
      return problemResponse(
        406,
        "Not Acceptable",
        "Supported representation: application/json",
        traceId,
      );
    }

    // --- Stage A.1: Capability discovery (`GET /api/marid/capabilities`) ---
    if (url.pathname === "/api/marid/capabilities") {
      if (req.method !== "GET" && req.method !== "HEAD") {
        return problemResponse(
          405,
          "Method Not Allowed",
          "Only GET is supported on /api/marid/capabilities",
          traceId,
          {},
          { Allow: "GET, HEAD" },
        );
      }
      const nativeOracle = await probeNativeVaultOracle();
      return jsonResponse(
        200,
        {
          service: "befunge93-vault-companion",
          backend: "local-bun-shim",
          maridWireVersion: "0.1.0",
          storageMode: "in_memory_ephemeral",
          stageAUnaryJson: true,
          stageBSseEvents: true,
          problemDetails: "rfc9457",
          topics: ["vault.runs"],
          nativeOracle: {
            available: nativeOracle.available,
            engine: nativeOracle.engine,
            agreesWithJsVm: nativeOracle.agreesWithJsVm,
          },
        },
        traceId,
      );
    }

    // --- Stage A.2 & A.3: Vault Run Ledger (`GET / POST /api/vault/runs`) ---
    if (url.pathname === "/api/vault/runs") {
      if (req.method === "GET" || req.method === "HEAD") {
        return jsonResponse(
          200,
          {
            storageMode: "in_memory_ephemeral",
            oracleStages: WALK_TRACE.length,
            sequence,
            verifiedCount: verifiedRuns.length,
            runs: verifiedRuns.slice().reverse(),
          },
          traceId,
        );
      }

      if (req.method === "POST") {
        const contentType = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
        if (contentType !== "application/json") {
          return problemResponse(
            415,
            "Unsupported Media Type",
            "POST /api/vault/runs requires Content-Type: application/json",
            traceId,
          );
        }

        let payload;
        try {
          payload = await req.json();
        } catch {
          return problemResponse(400, "Invalid JSON", "Request body is not valid I-JSON", traceId);
        }

        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          return problemResponse(
            400,
            "Validation Error",
            "Request body must be a JSON object",
            traceId,
            { field: "body", code: "type" },
          );
        }

        const requestedLevelId =
          typeof payload.levelId === "string" && VAULT_LEVELS.some((l) => l.id === payload.levelId)
            ? payload.levelId
            : "vault-alpha";
        const { level, jsEval, zigEval } = await verifyLevelPasscode(requestedLevelId);
        const candidate = typeof payload.passcode === "string" ? payload.passcode.trim() : "";
        const nativeMatches = !zigEval || (zigEval.halted && candidate === zigEval.output);
        if (!jsEval.halted || candidate !== jsEval.output || !nativeMatches) {
          return problemResponse(
            400,
            "Validation Error",
            "Submitted passcode did not pass server-side Befunge-93 torus verification",
            traceId,
            { field: "passcode", code: "oracle_mismatch", levelId: level.id },
          );
        }

        const traceLen = level.walkTrace.length;
        const stagesCompleted =
          typeof payload.stagesCompleted === "number" &&
          Number.isInteger(payload.stagesCompleted) &&
          payload.stagesCompleted >= 0 &&
          payload.stagesCompleted <= traceLen
            ? payload.stagesCompleted
            : traceLen;
        const attempts =
          typeof payload.attempts === "number" &&
          Number.isInteger(payload.attempts) &&
          payload.attempts >= 1
            ? payload.attempts
            : 1;
        const tempo = TEMPO_MODES.includes(payload.tempo) ? payload.tempo : "brisk";
        const callsign =
          typeof payload.callsign === "string" && payload.callsign.trim().length > 0
            ? payload.callsign.trim().slice(0, 32)
            : "anon-operator";

        const record = {
          id: `run-${sequence + 1}`,
          levelId: level.id,
          callsign,
          verifiedPasscode: true,
          stagesCompleted,
          attempts,
          tempo,
          verifiedAt: new Date().toISOString(),
        };

        verifiedRuns.push(record);
        if (verifiedRuns.length > maxRuns) {
          verifiedRuns.shift();
        }

        const evt = emitTopicEvent("vault.runs", "vault.run.verified", { run: record });
        return jsonResponse(
          200,
          {
            accepted: true,
            storageMode: "in_memory_ephemeral",
            sequence: evt.sequence,
            run: record,
          },
          traceId,
        );
      }

      return problemResponse(
        405,
        "Method Not Allowed",
        "Allowed methods on /api/vault/runs: GET, POST",
        traceId,
        {},
        { Allow: "GET, POST" },
      );
    }

    return null;
  }

  function closeAllStreams() {
    for (const sub of subscribers) {
      try {
        sub.controller.close();
      } catch {
        // ignore
      }
    }
    subscribers.clear();
  }

  return {
    handle,
    emitTopicEvent,
    closeAllStreams,
    get subscriberCount() {
      return subscribers.size;
    },
  };
}
