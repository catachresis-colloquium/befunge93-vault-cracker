<!-- SPDX-License-Identifier: MPL-2.0 -->
<!-- Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk> -->
<script setup>
defineProps({
  log: { type: Array, required: true },
  selfCheckReport: { type: Array, required: true },
});

const emit = defineEmits(["run-selfcheck"]);
</script>

<template>
  <section class="bf-card" aria-labelledby="trace-heading">
    <h2 id="trace-heading">
      <span>Execution Log &amp; Self-Checks</span>
      <button
        type="button"
        class="bf-btn"
        data-action="selfcheck"
        @click="emit('run-selfcheck')"
      >
        Re-run Self-Checks
      </button>
    </h2>

    <div class="bf-log bf-log-full" role="log" aria-label="Befunge-93 execution trace">
      <div v-for="(entry, idx) in log" :key="`log-${idx}`">
        {{ entry }}
      </div>
    </div>

    <ul class="bf-check-list" aria-label="Structural and VM self-check invariants">
      <li
        v-for="check in selfCheckReport"
        :key="check.id"
        class="bf-check-item"
      >
        <span>{{ check.label }}</span>
        <span class="bf-pill" :class="check.passed ? 'ok' : 'err'">
          {{ check.passed ? "PASS" : "FAIL" }}
        </span>
      </li>
    </ul>
  </section>
</template>
