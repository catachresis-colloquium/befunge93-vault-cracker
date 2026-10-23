// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Progressive-enhancement Vue 3 composable for the optional Marid companion backend.
 *
 * Design principles:
 * - Zero coupling to the pure TEA game reducer (`src/engine/game-state.js` works 100% standalone).
 * - Zero background polling or dangling timers when idle or when hosted as static files.
 * - Automatically adapts between Stage A (Unary HTTP/JSON + RFC 9457 only) and Stage B
 *   (Unary + live SSE `/events?topic=vault.runs`) based on `/api/marid/capabilities`.
 */

import { onScopeDispose, ref, shallowRef } from "vue";
import { MaridWireClient } from "../marid/marid-wire-client.js";

export function useVaultTelemetry(options = {}) {
  const client = options.client ?? new MaridWireClient({ baseUrl: options.baseUrl ?? "" });

  const backendMode = ref("unprobed");
  const capabilities = shallowRef(null);
  const runs = shallowRef([]);
  const verifiedCount = ref(0);
  const sseConnected = ref(false);
  const streamEvents = shallowRef([]);
  const loading = ref(false);
  const submitting = ref(false);
  const lastError = ref(null);
  const lastSubmittedRun = shallowRef(null);

  let activeSubscription = null;

  function disconnectStream() {
    if (activeSubscription !== null) {
      activeSubscription.unsubscribe();
      activeSubscription = null;
    }
    sseConnected.value = false;
  }

  async function refreshRuns() {
    const res = await client.fetchJson("/api/vault/runs");
    if (res && Array.isArray(res.runs)) {
      runs.value = res.runs;
      verifiedCount.value = typeof res.verifiedCount === "number" ? res.verifiedCount : res.runs.length;
    }
    return res;
  }

  function connectStream() {
    disconnectStream();
    if (!capabilities.value?.stageBSseEvents) {
      return false;
    }

    activeSubscription = client.subscribe(
      "vault.runs",
      {
        onOpen: () => {
          sseConnected.value = true;
        },
        onEvent: (evt) => {
          sseConnected.value = true;
          streamEvents.value = [evt, ...streamEvents.value].slice(0, 20);
          if (evt.type === "vault.run.verified" && evt.run) {
            const existing = runs.value.filter((r) => r.id !== evt.run.id);
            runs.value = [evt.run, ...existing].slice(0, 32);
            verifiedCount.value = Math.max(verifiedCount.value, runs.value.length);
          }
        },
        onResyncRequired: () => {
          refreshRuns().catch((err) => {
            lastError.value = err instanceof Error ? err.message : String(err);
          });
        },
        onError: (err) => {
          sseConnected.value = false;
          lastError.value = err instanceof Error ? err.message : String(err);
        },
      },
      { autoReconnect: false },
    );
    return true;
  }

  async function probeCapabilities({ autoConnectStream = false } = {}) {
    loading.value = true;
    lastError.value = null;
    try {
      const caps = await client.fetchJson("/api/marid/capabilities");
      capabilities.value = caps;
      backendMode.value = caps?.backend || "local-bun-shim";
      await refreshRuns();
      if (autoConnectStream && caps?.stageBSseEvents) {
        connectStream();
      }
      return caps;
    } catch (err) {
      capabilities.value = null;
      if (err && typeof err === "object" && err.status === 503) {
        backendMode.value = "upstream-unavailable";
        lastError.value = err.message;
      } else {
        backendMode.value = "offline-static";
        lastError.value = err instanceof Error ? err.message : String(err);
      }
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function submitVerifiedRun({ passcode, stagesCompleted, attempts, tempo, callsign }) {
    submitting.value = true;
    lastError.value = null;
    try {
      const res = await client.fetchJson("/api/vault/runs", {
        method: "POST",
        body: {
          passcode,
          stagesCompleted,
          attempts: Math.max(1, attempts || 1),
          tempo,
          callsign: callsign || "vault-operator",
        },
      });
      if (res?.run) {
        lastSubmittedRun.value = res.run;
        const existing = runs.value.filter((r) => r.id !== res.run.id);
        runs.value = [res.run, ...existing].slice(0, 32);
        verifiedCount.value = Math.max(verifiedCount.value, runs.value.length);
      }
      return res;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      submitting.value = false;
    }
  }

  onScopeDispose(() => {
    disconnectStream();
  });

  return {
    client,
    backendMode,
    capabilities,
    runs,
    verifiedCount,
    sseConnected,
    streamEvents,
    loading,
    submitting,
    lastError,
    lastSubmittedRun,
    probeCapabilities,
    refreshRuns,
    submitVerifiedRun,
    connectStream,
    disconnectStream,
  };
}
