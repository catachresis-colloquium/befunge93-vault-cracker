// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

import { computed, getCurrentScope, onScopeDispose, readonly, shallowRef, watch } from "vue";
import { TABS, TEMPO_MODES, VAULT_LEVELS, getVaultLevel } from "../engine/befunge93.js";
import {
  canStart,
  canStep,
  createInitialModel,
  deriveProgress,
  getTempoDelayMs,
  inspectGridCell,
  update,
} from "../engine/game-state.js";

/**
 * Vue 3 composable driving the Befunge-93 Vault Cracker TEA state machine.
 *
 * @param {{ scheduleInterval?: typeof setInterval, cancelInterval?: typeof clearInterval }} [timers]
 */
export function useVaultGame(timers = {}) {
  const scheduleInterval = timers.scheduleInterval ?? globalThis.setInterval.bind(globalThis);
  const cancelInterval = timers.cancelInterval ?? globalThis.clearInterval.bind(globalThis);

  const modelRef = shallowRef(createInitialModel());
  let activeTimerId = null;

  function clearActiveTimer() {
    if (activeTimerId !== null) {
      cancelInterval(activeTimerId);
      activeTimerId = null;
    }
  }

  function dispatch(msg) {
    modelRef.value = update(modelRef.value, msg);
  }

  watch(
    () => [modelRef.value.running, modelRef.value.tempo],
    ([isRunning, currentTempo]) => {
      clearActiveTimer();
      if (isRunning) {
        const delayMs = getTempoDelayMs(currentTempo);
        activeTimerId = scheduleInterval(() => {
          dispatch({ type: "Tick" });
        }, delayMs);
      }
    },
    { immediate: true },
  );

  if (getCurrentScope()) {
    onScopeDispose(() => {
      clearActiveTimer();
    });
  }

  const activeLevel = computed(() => getVaultLevel(modelRef.value.levelId));
  const grid = computed(() => {
    const stg = modelRef.value.stage;
    const trace = activeLevel.value.walkTrace;
    if (stg > 0 && trace[stg - 1]?.grid) {
      return trace[stg - 1].grid;
    }
    return activeLevel.value.grid;
  });
  const totalStages = computed(() => activeLevel.value.walkTrace.length);
  const progress = computed(() => deriveProgress(modelRef.value));
  const startEnabled = computed(() => canStart(modelRef.value));
  const stepEnabled = computed(() => canStep(modelRef.value));
  const pauseEnabled = computed(() => modelRef.value.running);
  const selectedCellInfo = computed(() => {
    const [r, c] = modelRef.value.selectedCell;
    return inspectGridCell(r, c, grid.value, activeLevel.value.walkTrace);
  });

  return {
    state: readonly(modelRef),
    levels: VAULT_LEVELS,
    grid,
    tabs: TABS,
    tempos: TEMPO_MODES,
    totalStages,
    progress,
    startEnabled,
    stepEnabled,
    pauseEnabled,
    selectedCellInfo,
    dispatch,
  };
}
