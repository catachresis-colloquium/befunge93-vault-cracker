<!-- SPDX-License-Identifier: MPL-2.0 -->
<!-- Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk> -->
<script setup>
const props = defineProps({
  grid: { type: Array, required: true },
  ip: { type: Array, required: true },
  dir: { type: String, required: true },
  selectedCell: { type: Array, required: true },
  visitedKeys: { type: Array, required: true },
  selectedCellInfo: { type: Object, default: null },
});

const emit = defineEmits(["select-cell"]);

function isIp(r, c) {
  return props.ip[0] === r && props.ip[1] === c;
}

function isSelected(r, c) {
  return props.selectedCell[0] === r && props.selectedCell[1] === c;
}

function isVisited(r, c) {
  return props.visitedKeys.includes(`${r},${c}`);
}

function moveSelection(rowDelta, colDelta, gridEl) {
  const height = props.grid.length || 10;
  const width = props.grid[0]?.length || 10;
  const nextRow = (props.selectedCell[0] + rowDelta + height) % height;
  const nextCol = (props.selectedCell[1] + colDelta + width) % width;
  emit("select-cell", { row: nextRow, col: nextCol });
  const nextCellEl = gridEl?.querySelector?.(`[data-cell="${nextRow},${nextCol}"]`);
  if (nextCellEl && typeof nextCellEl.focus === "function") {
    nextCellEl.focus();
  }
}

function handleCellKeydown(event) {
  const gridEl = event.currentTarget;
  switch (event.key) {
    case "ArrowUp":
      event.preventDefault();
      moveSelection(-1, 0, gridEl);
      break;
    case "ArrowDown":
      event.preventDefault();
      moveSelection(1, 0, gridEl);
      break;
    case "ArrowLeft":
      event.preventDefault();
      moveSelection(0, -1, gridEl);
      break;
    case "ArrowRight":
      event.preventDefault();
      moveSelection(0, 1, gridEl);
      break;
    default:
      break;
  }
}
</script>

<template>
  <section class="bf-card" aria-labelledby="playfield-heading">
    <h2 id="playfield-heading">
      <span>Playfield (10x10 Torus)</span>
      <span class="bf-pill idle">IP ({{ ip[0] }}, {{ ip[1] }}) · {{ dir }}</span>
    </h2>

    <div
      class="bf-grid"
      role="grid"
      aria-label="Befunge-93 10 by 10 instruction grid"
      @keydown="handleCellKeydown"
    >
      <div v-for="(row, rIdx) in grid" :key="`row-${rIdx}`" role="row" class="bf-grid-row">
        <button
          v-for="(cell, cIdx) in row"
          :key="`${rIdx}-${cIdx}`"
          type="button"
          role="gridcell"
          class="bf-cell"
          :class="{
            active: isIp(rIdx, cIdx),
            selected: isSelected(rIdx, cIdx),
            visited: isVisited(rIdx, cIdx),
          }"
          :tabindex="isSelected(rIdx, cIdx) ? 0 : -1"
          :aria-selected="isSelected(rIdx, cIdx)"
          :aria-current="isIp(rIdx, cIdx) ? 'step' : undefined"
          :aria-label="`Cell (${rIdx}, ${cIdx}): ${cell === ' ' ? 'space no-op' : cell}`"
          :data-cell="`${rIdx},${cIdx}`"
          @click="emit('select-cell', { row: rIdx, col: cIdx })"
        >
          {{ cell === " " ? "·" : cell }}
        </button>
      </div>
    </div>

    <div v-if="selectedCellInfo" class="bf-inspector" aria-live="polite">
      <div class="bf-inspector-head">
        <span>Inspector ({{ selectedCellInfo.row }}, {{ selectedCellInfo.col }}) · '{{ selectedCellInfo.displayGlyph }}'</span>
        <span v-if="selectedCellInfo.stageHits.length > 0">
          Stage{{ selectedCellInfo.stageHits.length > 1 ? "s" : "" }}: {{ selectedCellInfo.stageHits.join(", ") }}
        </span>
        <span v-else>Unvisited</span>
      </div>
      <div>{{ selectedCellInfo.description }}</div>
    </div>
  </section>
</template>
