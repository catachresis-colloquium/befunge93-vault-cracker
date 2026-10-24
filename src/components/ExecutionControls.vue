<!-- SPDX-License-Identifier: MPL-2.0 -->
<!-- Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk> -->
<script setup>
defineProps({
  running: { type: Boolean, required: true },
  completed: { type: Boolean, required: true },
  tempo: { type: String, required: true },
  tempos: { type: Array, required: true },
  stage: { type: Number, required: true },
  totalStages: { type: Number, required: true },
  progress: { type: Number, required: true },
  ip: { type: Array, required: true },
  dir: { type: String, required: true },
  stack: { type: Array, required: true },
  output: { type: String, required: true },
  startEnabled: { type: Boolean, required: true },
  pauseEnabled: { type: Boolean, required: true },
  stepEnabled: { type: Boolean, required: true },
});

const emit = defineEmits(["start", "pause", "step", "reset", "set-tempo"]);
</script>

<template>
  <section class="bf-card" aria-labelledby="exec-heading">
    <h2 id="exec-heading">
      <span>Execution</span>
      <span class="bf-pill" :class="completed ? 'ok' : running ? 'ok' : 'idle'">
        {{ completed ? "halted (@)" : running ? "running" : "idle" }}
      </span>
    </h2>

    <div class="bf-controls">
      <button
        type="button"
        class="bf-btn primary"
        data-action="start"
        :disabled="!startEnabled"
        @click="emit('start')"
      >
        Start
      </button>
      <button
        type="button"
        class="bf-btn"
        data-action="pause"
        :disabled="!pauseEnabled"
        @click="emit('pause')"
      >
        Pause
      </button>
      <button
        type="button"
        class="bf-btn"
        data-action="step"
        :disabled="!stepEnabled"
        @click="emit('step')"
      >
        Step
      </button>
      <button
        type="button"
        class="bf-btn"
        data-action="reset"
        @click="emit('reset')"
      >
        Reset
      </button>

      <label class="bf-tempo-label" for="vault-tempo-select">
        <span>Tempo</span>
        <select
          id="vault-tempo-select"
          class="bf-tempo"
          :value="tempo"
          aria-label="Execution tempo"
          @change="emit('set-tempo', $event.target.value)"
        >
          <option v-for="mode in tempos" :key="mode" :value="mode">
            {{ mode }}
          </option>
        </select>
      </label>
    </div>

    <progress
      class="bf-progress"
      role="progressbar"
      aria-label="Vault crack stage progress"
      :value="progress"
      max="100"
      :aria-valuenow="progress"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      {{ progress }}%
    </progress>

    <dl class="bf-kv">
      <dt>Stage</dt>
      <dd>{{ stage }} / {{ totalStages }} ({{ progress }}%)</dd>

      <dt>IP</dt>
      <dd>({{ ip[0] }}, {{ ip[1] }}) · {{ dir }}</dd>

      <dt>Stack</dt>
      <dd>
        <div class="bf-stack" aria-label="Befunge-93 stack contents">
          <span v-if="stack.length === 0" class="bf-chip">(empty)</span>
          <span v-for="(val, idx) in stack" :key="`stk-${idx}`" class="bf-chip">
            {{ val }}
          </span>
        </div>
      </dd>

      <dt>Output</dt>
      <dd data-testid="vm-output">{{ output || "—" }}</dd>
    </dl>
  </section>
</template>
