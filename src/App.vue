<!-- SPDX-License-Identifier: MPL-2.0 -->
<!-- Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk> -->
<script setup>
import { onErrorCaptured, ref } from "vue";
import { useVaultGame } from "./composables/useVaultGame.js";
import PlayfieldGrid from "./components/PlayfieldGrid.vue";
import ExecutionControls from "./components/ExecutionControls.vue";
import PasscodeVault from "./components/PasscodeVault.vue";
import TracePanel from "./components/TracePanel.vue";
import AboutPanel from "./components/AboutPanel.vue";
import TelemetryPanel from "./components/TelemetryPanel.vue";

const props = defineProps({
  telemetryClient: { type: Object, default: undefined },
});

const {
  state,
  levels,
  grid,
  tabs,
  tempos,
  totalStages,
  progress,
  startEnabled,
  stepEnabled,
  pauseEnabled,
  selectedCellInfo,
  dispatch,
} = useVaultGame();

const capturedError = ref(null);

onErrorCaptured((err) => {
  capturedError.value = err instanceof Error ? err.message : String(err);
  return false;
});

function handleTabKeydown(event) {
  const currentIdx = tabs.indexOf(state.value.tab);
  if (currentIdx === -1) return;
  let nextIdx = currentIdx;
  if (event.key === "ArrowRight") {
    nextIdx = (currentIdx + 1) % tabs.length;
  } else if (event.key === "ArrowLeft") {
    nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
  } else if (event.key === "Home") {
    nextIdx = 0;
  } else if (event.key === "End") {
    nextIdx = tabs.length - 1;
  } else {
    return;
  }
  event.preventDefault();
  const nextTab = tabs[nextIdx];
  dispatch({ type: "SetTab", tab: nextTab });
  const nextTabEl = event.currentTarget?.querySelector?.(`#tab-${nextTab}`);
  if (nextTabEl && typeof nextTabEl.focus === "function") {
    nextTabEl.focus();
  }
}
</script>

<template>
  <div class="bf-app">
    <header class="bf-header">
      <div>
        <h1 class="bf-title">Befunge-93 Vault Cracker</h1>
        <p class="bf-subtitle">
          2D torus instruction-pointer puzzle · Vue 3 + Bun TEA runtime
        </p>
      </div>

      <div class="bf-header-actions">
        <label class="bf-tempo-label" for="vault-level-select">
          <span>Puzzle</span>
          <select
            id="vault-level-select"
            class="bf-tempo"
            aria-label="Vault puzzle level"
            :value="state.levelId"
            @change="dispatch({ type: 'SelectLevel', levelId: $event.target.value })"
          >
            <option v-for="lvl in levels" :key="lvl.id" :value="lvl.id">
              {{ lvl.title }}
            </option>
          </select>
        </label>

        <div
          class="bf-tabs"
          role="tablist"
          aria-label="Vault Cracker Views"
          @keydown="handleTabKeydown"
        >
          <button
            v-for="tabName in tabs"
            :key="tabName"
            :id="`tab-${tabName}`"
            type="button"
            role="tab"
            class="bf-tab"
            :class="{ active: state.tab === tabName }"
            :aria-selected="state.tab === tabName"
            :aria-controls="`panel-${tabName}`"
            :tabindex="state.tab === tabName ? 0 : -1"
            @click="dispatch({ type: 'SetTab', tab: tabName })"
          >
            {{ tabName }}
          </button>
        </div>
      </div>
    </header>

    <div v-if="capturedError" class="bf-error-banner" role="alert">
      <strong>Playfield fault:</strong> {{ capturedError }}
      <div class="bf-mt-10">
        <button
          type="button"
          class="bf-btn"
          @click="capturedError = null; dispatch({ type: 'Reset' })"
        >
          Reset Playfield
        </button>
      </div>
    </div>

    <main
      v-else-if="state.tab === 'vault'"
      id="panel-vault"
      role="tabpanel"
      aria-labelledby="tab-vault"
      class="bf-main"
    >
      <div>
        <PlayfieldGrid
          :grid="grid"
          :ip="state.ip"
          :dir="state.dir"
          :selected-cell="state.selectedCell"
          :visited-keys="state.visitedKeys"
          :selected-cell-info="selectedCellInfo"
          @select-cell="({ row, col }) => dispatch({ type: 'SelectCell', row, col })"
        />

        <PasscodeVault
          :passcode-input="state.passcodeInput"
          :passcode-status="state.passcodeStatus"
          :attempts="state.attempts"
          :matched-prefix-digits="state.matchedPrefixDigits"
          @input-passcode="(value) => dispatch({ type: 'InputPasscode', value })"
          @submit-passcode="dispatch({ type: 'SubmitPasscode' })"
        />
      </div>

      <div>
        <ExecutionControls
          :running="state.running"
          :completed="state.completed"
          :tempo="state.tempo"
          :tempos="tempos"
          :stage="state.stage"
          :total-stages="totalStages"
          :progress="progress"
          :ip="state.ip"
          :dir="state.dir"
          :stack="state.stack"
          :output="state.output"
          :start-enabled="startEnabled"
          :pause-enabled="pauseEnabled"
          :step-enabled="stepEnabled"
          @start="dispatch({ type: 'Start' })"
          @pause="dispatch({ type: 'Pause' })"
          @step="dispatch({ type: 'Step' })"
          @reset="dispatch({ type: 'Reset' })"
          @set-tempo="(tempo) => dispatch({ type: 'SetTempo', tempo })"
        />

        <section class="bf-card bf-mt-16" aria-labelledby="recent-trace-heading">
          <h2 id="recent-trace-heading">
            <span>Recent Trace</span>
            <span class="bf-pill" :class="state.selfChecksPassed ? 'ok' : 'err'">
              {{ state.selfChecksPassed ? "5/5 invariants OK" : "invariant warning" }}
            </span>
          </h2>
          <div class="bf-log" role="log" aria-live="polite">
            <div v-for="(line, i) in state.log.slice(-8)" :key="`recent-${i}`">
              {{ line }}
            </div>
          </div>
        </section>
      </div>
    </main>

    <main
      v-else-if="state.tab === 'trace'"
      id="panel-trace"
      role="tabpanel"
      aria-labelledby="tab-trace"
      class="bf-mt-20"
    >
      <TracePanel
        :log="state.log"
        :self-check-report="state.selfCheckReport"
        @run-selfcheck="dispatch({ type: 'RunSelfCheck' })"
      />
    </main>

    <main
      v-else-if="state.tab === 'about'"
      id="panel-about"
      role="tabpanel"
      aria-labelledby="tab-about"
      class="bf-mt-20"
    >
      <AboutPanel />
    </main>

    <main
      v-else
      id="panel-telemetry"
      role="tabpanel"
      aria-labelledby="tab-telemetry"
      class="bf-mt-20"
    >
      <TelemetryPanel
        :level-id="state.levelId"
        :passcode-input="state.passcodeInput"
        :output="state.output"
        :stage="state.stage"
        :attempts="state.attempts"
        :tempo="state.tempo"
        :telemetry-client="props.telemetryClient"
      />
    </main>
  </div>
</template>
