<!-- SPDX-License-Identifier: MPL-2.0 -->
<!-- Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk> -->

/**
 * Custom Vault Workshop: 10x10 torus grid authoring surface.
 *
 * - ARIA grid with roving tabindex (only the selected cell is tabbable)
 * - Arrow keys move focus around the torus (wrapping)
 * * `Enter` or `Space` cycles the focused cell through the Befunge-93 glyph set
 * - Click selects a cell; double-click cycles its glyph
 * - No inline JavaScript: CSP-compatible
 */

<script setup>
import { computed } from "vue";
import { WORKSHOP_GLYPHS } from "../engine/workshop.js";

const props = defineProps({
  grid: { type: Array, required: true },
  selectedCell: { type: Array, required: true },
});

const emit = defineEmits(["select-cell", "change-glyph"]);

const GLYPH_ORDER = computed(() => [...WORKSHOP_GLYPHS].sort());

function isSelected(rIdx, cIdx) {
  return props.selectedCell[0] === rIdx && props.selectedCell[1] === cIdx;
}

function glyphIndex(glyph) {
  return GLYPH_ORDER.value.indexOf(glyph);
}

function nextGlyph(glyph) {
  const i = glyphIndex(glyph);
  return GLYPH_ORDER.value[(i + 1) % GLYPH_ORDER.value.length];
}

function moveSelection(rowDelta, colDelta) {
  const height = props.grid.length || 10;
  const width = props.grid[0]?.length || 10;
  const nextRow = (props.selectedCell[0] + rowDelta + height) % height;
  const nextCol = (props.selectedCell[1] + colDelta + width) % width;
  emit("select-cell", { row: nextRow, col: nextCol });
}

function handleGridKeydown(event) {
  switch (event.key) {
    case "ArrowUp":
      event.preventDefault();
      moveSelection(-1, 0);
      break;
    case "ArrowDown":
      event.preventDefault();
      moveSelection(1, 0);
      break;
    case "ArrowLeft":
      event.preventDefault();
      moveSelection(0, -1);
      break;
    case "ArrowRight":
      event.preventDefault();
      moveSelection(0, 1);
      break;
    default:
      break;
  }
}

function handleCellKeydown(event, rIdx, cIdx) {
  switch (event.key) {
    case "ArrowUp":
    case "ArrowDown":
    case "ArrowLeft":
    case "ArrowRight":
      event.preventDefault();
      moveSelection(
        event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0,
        event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0,
      );
      const nextRow =
        event.key === "ArrowUp"
          ? props.selectedCell[0] - 1
          : event.key === "ArrowDown"
            ? props.selectedCell[0] + 1
            : props.selectedCell[0];
      const nextCol =
        event.key === "ArrowLeft"
          ? props.selectedCell[1] - 1
          : event.key === "ArrowRight"
            ? props.selectedCell[1] + 1
            : props.selectedCell[1];
      const height = props.grid.length || 10;
      const width = props.grid[0]?.length || 10;
      const nextEl = event.currentTarget.closest(".bf-grid")?.querySelector(
        `[data-cell="${((nextRow % height) + height) % height},${
          ((nextCol % width) + width) % width
        }"]`,
      );
      if (nextEl && typeof nextEl.focus === "function") {
        nextEl.focus();
      }
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      emit("change-glyph", { row: rIdx, col: cIdx, glyph: nextGlyph(props.grid[rIdx][cIdx]) });
      break;
    default:
      break;
  }
}
</script>

<template>
  <section class="bf-card" aria-labelledby="workshop-grid-heading">
    <h2 id="workshop-grid-heading">
      <span>Custom Workshop — 10x10 torus</span>
      <span class="bf-pill">{{ selectedCell[0] }},{{ selectedCell[1] }}</span>
    </h2>

    <div
      class="bf-grid"
      role="grid"
      aria-label="Custom Befunge-93 playfield (10 by 10, authoring mode)"
      @keydown="handleGridKeydown"
    >
      <div
        v-for="(row, rIdx) in grid"
        :key="`w-row-${rIdx}`"
        role="row"
        class="bf-grid-row"
      >
        <button
          v-for="(cell, cIdx) in row"
          :key="`w-cell-${rIdx}-${cIdx}`"
          type="button"
          role="gridcell"
          class="bf-cell"
          :class="{ selected: isSelected(rIdx, cIdx) }"
          :tabindex="isSelected(rIdx, cIdx) ? 0 : -1"
          :aria-selected="isSelected(rIdx, cIdx)"
          :aria-label="`Cell (${rIdx}, ${cIdx}): ${cell === " " ? "space no-op" : cell}`"
          :data-cell="`${rIdx},${cIdx}`"
          @click="() => emit('select-cell', { row: rIdx, col: cIdx })"
          @dblclick="() => emit('change-glyph', { row: rIdx, col: cIdx, glyph: nextGlyph(cell) })"
          @keydown="($event) => handleCellKeydown($event, rIdx, cIdx)"
        >
          {{ cell === " " ? "·" : cell }}
        </button>
      </div>
    </div>

    <p class="bf-hint">
      Arrow keys move focus (torus wraps) · Enter or Space cycles the focused cell's glyph ·
      double-click cycles too
    </p>
  </section>
</template>
