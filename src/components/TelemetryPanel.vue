<!-- SPDX-License-Identifier: MPL-2.0 -->
<!-- Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk> -->
<script setup>
import { computed, onMounted, ref } from "vue";
import { useVaultTelemetry } from "../composables/useVaultTelemetry.js";

const props = defineProps({
  levelId: { type: String, default: "vault-alpha" },
  passcodeInput: { type: String, required: true },
  output: { type: String, required: true },
  stage: { type: Number, required: true },
  attempts: { type: Number, required: true },
  tempo: { type: String, required: true },
  telemetryClient: { type: Object, default: undefined },
});

const callsign = ref("vault-operator");

const {
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
  submitVerifiedRun,
  connectStream,
  disconnectStream,
} = useVaultTelemetry({ client: props.telemetryClient });

const candidatePasscode = computed(() => {
  if (props.passcodeInput && props.passcodeInput.trim().length > 0) {
    return props.passcodeInput.trim();
  }
  return props.output || "";
});

const modeLabel = computed(() => {
  switch (backendMode.value) {
    case "marid-upstream":
      return "Marid Julia Upstream";
    case "local-bun-shim":
      return "Local Bun Trial Shim";
    case "upstream-unavailable":
      return "Upstream Unavailable (503)";
    case "offline-static":
      return "Static / Offline Mode";
    default:
      return "Unprobed";
  }
});

const modeBadgeClass = computed(() => {
  if (backendMode.value === "marid-upstream" || backendMode.value === "local-bun-shim") {
    return "ok";
  }
  if (backendMode.value === "upstream-unavailable") {
    return "err";
  }
  return "warn";
});

const canSubmit = computed(() => {
  const online =
    backendMode.value === "local-bun-shim" || backendMode.value === "marid-upstream";
  return online && !submitting.value && candidatePasscode.value.length > 0;
});

async function handleSubmitRun() {
  try {
    await submitVerifiedRun({
      levelId: props.levelId,
      passcode: candidatePasscode.value,
      stagesCompleted: props.stage,
      attempts: props.attempts,
      tempo: props.tempo,
      callsign: callsign.value,
    });
  } catch {
    // `lastError` is populated by `useVaultTelemetry` using RFC 9457 Problem Details
  }
}

function toggleStream() {
  if (sseConnected.value) {
    disconnectStream();
  } else {
    connectStream();
  }
}

onMounted(() => {
  probeCapabilities({ autoConnectStream: false });
});
</script>

<template>
  <div class="bf-main">
    <section class="bf-card" aria-labelledby="marid-companion-heading">
      <h2 id="marid-companion-heading">
        <span>Marid Companion Seam (Option 2 Trial)</span>
        <span class="bf-pill" :class="modeBadgeClass" data-testid="marid-mode-badge">
          {{ modeLabel }}
        </span>
      </h2>

      <p class="bf-section-note">
        Progressive-enhancement companion surface speaking
        <code>@metadatastician/marid-client</code>'s exact wire contract: Stage A unary I-JSON +
        RFC 9457 <code>application/problem+json</code>, and Stage B W3C SSE
        (<code>/events?topic=vault.runs&amp;last_event_id=…</code>). The client puzzle works
        standalone if no companion is reachable.
      </p>

      <div class="bf-stat-grid">
        <div class="bf-stat-box">
          <span class="bf-stat-label">Stage A (Unary + RFC 9457)</span>
          <span class="bf-stat-value">
            {{ capabilities?.stageAUnaryJson ? "Ready" : "Offline" }}
          </span>
        </div>
        <div class="bf-stat-box">
          <span class="bf-stat-label">Stage B (SSE Stream)</span>
          <span class="bf-stat-value">
            {{ capabilities?.stageBSseEvents ? (sseConnected ? "Live" : "Available") : "Deferred" }}
          </span>
        </div>
        <div class="bf-stat-box">
          <span class="bf-stat-label">Storage Honesty</span>
          <span class="bf-stat-value">
            {{ capabilities?.storageMode || "client_only" }}
          </span>
        </div>
        <div class="bf-stat-box">
          <span class="bf-stat-label">Verified Runs</span>
          <span class="bf-stat-value" data-testid="marid-verified-count">
            {{ verifiedCount }}
          </span>
        </div>
        <div class="bf-stat-box">
          <span class="bf-stat-label">Native Oracle</span>
          <span class="bf-stat-value" data-testid="marid-native-oracle">
            {{
              capabilities?.nativeOracle?.agreesWithJsVm
                ? "Zig C-ABI"
                : capabilities
                  ? "JS VM"
                  : "—"
            }}
          </span>
        </div>
      </div>

      <div class="bf-controls">
        <button
          type="button"
          class="bf-btn"
          :disabled="loading"
          data-testid="marid-probe-btn"
          @click="probeCapabilities({ autoConnectStream: false })"
        >
          {{ loading ? "Probing…" : "Refresh Companion" }}
        </button>

        <button
          v-if="capabilities?.stageBSseEvents"
          type="button"
          class="bf-btn"
          data-testid="marid-stream-btn"
          @click="toggleStream"
        >
          {{ sseConnected ? "Disconnect SSE" : "Subscribe SSE (vault.runs)" }}
        </button>
      </div>

      <form class="bf-form-divider" @submit.prevent="handleSubmitRun">
        <div class="bf-inline-row">
          <label for="marid-callsign-input" class="bf-callsign-label">
            Operator Callsign:
          </label>
          <input
            id="marid-callsign-input"
            v-model="callsign"
            type="text"
            maxlength="32"
            class="bf-input bf-callsign-input"
          />
          <button
            type="submit"
            class="bf-btn primary"
            :disabled="!canSubmit"
            data-testid="marid-submit-run-btn"
          >
            {{ submitting ? "Verifying…" : `Verify & Record (${candidatePasscode || "no digits"})` }}
          </button>
        </div>
      </form>

      <p
        v-if="lastSubmittedRun"
        class="bf-feedback-ok"
        data-testid="marid-submit-ok"
      >
        Server-verified run <code>{{ lastSubmittedRun.id }}</code> recorded for
        <strong>{{ lastSubmittedRun.callsign }}</strong> ({{ lastSubmittedRun.stagesCompleted }}
        stages, {{ lastSubmittedRun.tempo }}).
      </p>

      <p
        v-if="lastError"
        role="alert"
        class="bf-feedback-err"
        data-testid="marid-error-msg"
      >
        {{ lastError }}
      </p>
    </section>

    <section class="bf-card" aria-labelledby="marid-ledger-heading">
      <h2 id="marid-ledger-heading">
        <span>Verified Run Ledger</span>
        <span class="bf-pill" :class="sseConnected ? 'ok' : 'warn'">
          {{ sseConnected ? "SSE live" : "Unary snapshot" }}
        </span>
      </h2>

      <div v-if="runs.length === 0" class="bf-ledger-empty">
        No server-verified runs recorded in this ephemeral session yet. Run the playfield to
        recover the 8-digit passcode (or unlock the vault), then submit above.
      </div>

      <ul v-else class="bf-ledger-list">
        <li v-for="run in runs" :key="run.id" class="bf-ledger-item">
          <span>
            <strong>{{ run.callsign }}</strong> · <code>{{ run.id }}</code>
          </span>
          <span class="bf-muted-text">
            {{ run.stagesCompleted }} stages · {{ run.attempts }} attempt(s) · {{ run.tempo }}
          </span>
        </li>
      </ul>

      <h3 class="bf-subhead">
        Recent SSE Topic Frames (<code>vault.runs</code>)
      </h3>
      <div class="bf-log bf-log-compact" role="log" aria-live="polite">
        <div v-if="streamEvents.length === 0" class="bf-muted-text">
          (no live SSE frames received yet)
        </div>
        <div v-for="evt in streamEvents" :key="`seq-${evt.sequence}`">
          [seq={{ evt.sequence }}] {{ evt.type }} — {{ evt.run?.callsign || evt.topic }}
        </div>
      </div>
    </section>
  </div>
</template>
