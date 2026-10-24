<!-- SPDX-License-Identifier: MPL-2.0 -->
<!-- Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk> -->

/**
 * Custom Vault Workshop controls panel.
 *
 * Drives the TEA workshop actions (`EnterWorkshop`, `SetWorkshopMaxSteps`,
 * `DeriveWorkshopTrace`/`WorkshopTraceDerived`, `SetWorkshopTraceView`,
 * `MakeWorkshopChallenge`, `VerifyWorkshopChallenge`) and displays the
 * derived trace + JS vs Zig C-ABI lockstep verdict.
 *
 * No inline JavaScript: CSP-compatible.
 */

<script setup>
import { computed, ref, watch } from "vue";
import {
  describeOpcode,
  EXPECTED_PASSCODE,
  VAULT_LEVELS,
  getVaultLevel,
} from "../engine/befunge93.js";
import { deriveWorkshopTrace as deriveWorkshopTraceEngine } from "../engine/workshop.js";

const props = defineProps({
  state: { type: Object, required: true },
  dispatch: { type: Function, required: true },
});

const deriving = ref(false);
const verifyChallengeId = ref("");
const viewIndexLocal = ref(0);

const workshop = computed(() => props.state.workshop);
const maxSteps = computed(() => (workshop.value ? workshop.value.maxSteps : 500));
const trace = computed(() => (workshop.value ? workshop.value.trace : []));
const agreement = computed(() => (workshop.value ? workshop.value.agreement : null));
const jsResult = computed(() => (workshop.value ? workshop.value.jsResult : null));
const traceViewIndex = computed(() => (workshop.value ? workshop.value.traceViewIndex : 0));
const currentEntry = computed(() => {
  const t = trace.value;
  const i = traceViewIndex.value;
  return t.length > 0 ? t[Math.max(0, Math.min(i, t.length - 1))] : null;
});
const challengeId = computed(() => (workshop.value ? workshop.value.challengeId : null));
const challengeValid = computed(() => (workshop.value ? workshop.value.challengeValid : null));
const selectedCell = computed(() => props.state.selectedCell);
const levelId = computed(() => props.state.levelId);

watch(
  () => workshop.value?.maxSteps,
  (next) => {
    if (next != null) {
      viewIndexLocal.value = Math.max(0, Math.min(viewIndexLocal.value, trace.value.length - 1));
    }
  },
);

async function handleDeriveTrace() {
  const st = workshop.value;
  if (!st) return;
  deriving.value = true;
  try {
    const derived = await deriveWorkshopTraceEngine(st.grid, st.maxSteps);
    props.dispatch({
      type: "WorkshopTraceDerived",
      jsResult: derived.jsResult,
      zigResult: derived.zigResult,
      agreement: derived.agreement,
    });
    props.dispatch({ type: "SetWorkshopTraceView", index: 0 });
    viewIndexLocal.value = 0;
  } finally {
    deriving.value = false;
  }
}

function agreementLabel() {
  const a = agreement.value;
  if (a === null) return "JS VM only (native oracle unavailable)";
  return a ? "JS/Zig lockstep: agree" : "JS/Zig lockstep: DISAGREE";
}

function agreementClass() {
  const a = agreement.value;
  if (a === null) return "muted";
  return a ? "ok" : "err";
}

function cellDescription(r, c) {
  const w = workshop.value;
  if (!w) return null;
  const glyph = w.grid[r]?.[c];
  if (glyph === undefined) return null;
  return { glyph, description: describeOpcode(glyph) };
}
</script>

<template>
  <section class="bf-card" aria-labelledby="workshop-heading">
    <h2 id="workshop-heading">Custom Vault Workshop</h2>
    <p class="bf-hint">
      Author a 10x10 Befunge-93 playfield, bound its step budget, derive its
      execution trace, and compare the JS VM against the native Zig C-ABI
      oracle. Challenge descriptors are RFC 8785 JCS + base64url.
    </p>

    <div class="bf-workshop-toolbar">
      <button
        type="button"
        class="bf-btn"
        :class="{ primary: state.mode === 'workshop' }"
        @click="
          state.mode === 'workshop'
            ? dispatch({ type: 'LeaveWorkshop' })
            : dispatch({ type: 'EnterWorkshop' })
        "
      >
        {{ state.mode === 'workshop' ? 'Return to Vault Play' : 'Enter Workshop Mode' }}
      </button>

      <label class="bf-field">
        <span>maxSteps (1&ndash;10000)</span>
        <input
          type="number"
          class="bf-input"
          :value="maxSteps"
          min="1"
          max="10000"
          @change="
            dispatch({
              type: 'SetWorkshopMaxSteps',
              maxSteps: Math.max(1, Math.min(10000, Number($event.target.value) || 1)),
            })
          "
        />
      </label>

      <button
        type="button"
        class="bf-btn"
        :disabled="deriving || state.mode !== 'workshop'"
        @click="handleDeriveTrace"
      >
        {{ deriving ? 'Deriving trace...' : 'Derive trace (JS VM + native Zig)' }}
      </button>

      <span class="bf-chip" :class="agreementClass()">
        {{ agreementLabel() }}
      </span>
    </div>

    <template v-if="workshop">
      <div class="bf-workshop-trace">
        <h3>Derived trace</h3>
        <p>
          JS VM:
          <span class="bf-mono">
            {{ jsResult ? `${jsResult.steps} steps &middot; output ${jsResult.output}` : '&ndash;' }}
          </span>
        </p>
        <input
          type="range"
          class="bf-range"
          :min="0"
          :max="Math.max(0, trace.length - 1)"
          :value="viewIndexLocal"
          @input="viewIndexLocal = Number($event.target.value)"
          @change="dispatch({ type: 'SetWorkshopTraceView', index: viewIndexLocal })"
          :disabled="trace.length === 0"
        />
        <template v-if="currentEntry">
          <p class="bf-mono">
            step {{ currentEntry.step }} &middot; IP=({{ currentEntry.row }},{{ currentEntry.col }}) &middot;
            dir={{ currentEntry.dir }} &middot; instr='{{ currentEntry.instr }}' &middot;
            output='{{ currentEntry.output }}'
          </p>
        </template>
      </div>

      <div class="bf-workshop-challenge">
        <h3>Challenge descriptor (RFC 8785 JCS + base64url)</h3>
        <p class="bf-mono bf-challenge-id">{{ challengeId || '&ndash;' }}</p>
        <div class="bf-field">
          <label>Verify descriptor</label>
          <input
            type="text"
            class="bf-input"
            :value="verifyChallengeId"
            @input="verifyChallengeId = $event.target.value"
          />
          <button
            type="button"
            class="bf-btn bf-btn-sm"
            @click="
              dispatch({
                type: 'VerifyWorkshopChallenge',
                challengeId: verifyChallengeId || null,
              })
            "
          >
            Verify
          </button>
          <button
            type="button"
            class="bf-btn bf-btn-sm"
            @click="dispatch({ type: 'MakeWorkshopChallenge' })"
          >
            (Re)mint
          </button>
          <span
            class="bf-chip"
            :class="{ ok: challengeValid === true, err: challengeValid === false }"
          >
            {{ challengeValid === null ? 'not minted' : challengeValid ? 'valid' : 'invalid' }}
          </span>
        </div>
      </div>

      <div class="bf-workshop-passcode">
        <h3>Derived passcode vs level oracle</h3>
        <p>
          JS VM output:
          <span class="bf-mono">{{ jsResult ? jsResult.output : '&ndash;' }}</span>
          &nbsp;level oracle: <span class="bf-mono">{{ getVaultLevel(levelId).expectedPasscode }}</span>
        </p>
        <label class="bf-field">
          <span>Submit passcode attempt</span>
          <input
            type="text"
            class="bf-input"
            :value="jsResult ? jsResult.output : ''"
            readonly
          />
          <button
            type="button"
            class="bf-btn bf-btn-sm"
            @click="dispatch({ type: 'SubmitPasscode' })"
            :disabled="state.passcodeStatus === 'valid'"
          >
            Submit to vault
          </button>
        </label>
      </div>

      <div class="bf-inspector" aria-live="polite">
        <h3>Cell inspector</h3>
        <template v-if="cellDescription(selectedCell[0], selectedCell[1])">
          <div class="bf-inspector-head">
            <span>
              Cell ({{
                selectedCell[0]
              }},{{
                selectedCell[1]
              }}): '{{ cellDescription(selectedCell[0], selectedCell[1]).glyph === ' ' ? 'space' : cellDescription(selectedCell[0], selectedCell[1]).glyph }}'
            </span>
          </div>
          <div>{{ cellDescription(selectedCell[0], selectedCell[1]).description }}</div>
        </template>
      </div>
    </template>
  </section>
</template>
