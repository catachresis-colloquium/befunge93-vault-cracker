<!-- SPDX-License-Identifier: MPL-2.0 -->
<!-- Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk> -->
<script setup>
defineProps({
  passcodeInput: { type: String, required: true },
  passcodeStatus: { type: String, required: true },
  attempts: { type: Number, required: true },
  matchedPrefixDigits: { type: Number, required: true },
});

const emit = defineEmits(["input-passcode", "submit-passcode"]);
</script>

<template>
  <section class="bf-card bf-mt-16" aria-labelledby="passcode-heading">
    <h2 id="passcode-heading">
      <span>Passcode Lock</span>
      <span v-if="attempts > 0" class="bf-pill idle">
        Attempts: {{ attempts }}
      </span>
    </h2>

    <form class="bf-pass-block" @submit.prevent="emit('submit-passcode')">
      <label class="bf-label" for="vault-passcode-input">
        Enter recovered 8-digit vault passcode
      </label>
      <div class="bf-pass-form">
        <input
          id="vault-passcode-input"
          class="bf-input"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          maxlength="16"
          placeholder="8-digit passcode..."
          :value="passcodeInput"
          @input="emit('input-passcode', $event.target.value)"
        />
        <button type="submit" class="bf-btn primary" data-action="unlock">
          Unlock
        </button>
      </div>
    </form>

    <div class="bf-mt-10" aria-live="polite">
      <span v-if="passcodeStatus === 'valid'" class="bf-pill ok" data-testid="passcode-status">
        Vault unlocked — passcode verified
      </span>
      <span v-else-if="passcodeStatus === 'invalid'" class="bf-pill err" data-testid="passcode-status">
        Access denied ({{ matchedPrefixDigits }}/8 leading digits matched)
      </span>
      <span v-else class="bf-pill idle" data-testid="passcode-status">
        Awaiting passcode submission
      </span>
    </div>
  </section>
</template>
