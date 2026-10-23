<!-- SPDX-License-Identifier: MPL-2.0 -->
<!-- Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk> -->
<script setup>
// Architecture & parody documentation panel for Befunge-93 Vault Cracker.
</script>

<template>
  <section class="bf-card" aria-labelledby="about-heading">
    <h2 id="about-heading">About Befunge-93 Vault Cracker</h2>
    <p class="bf-prose-p">
      Befunge-93 (Chris Pressey, 1993) routes an instruction pointer across a two-dimensional
      playfield torus where control flow bends with directional arrows
      (<code>&gt;</code>, <code>&lt;</code>, <code>^</code>, <code>v</code>),
      stack-driven branches (<code>_</code>, <code>|</code>), and ASCII string mode (<code>"</code>).
    </p>
    <p class="bf-prose-p">
      This interactive puzzle pairs a pure functional TEA (The Elm Architecture) state machine
      with dual lockstep 2D torus Befunge-93 interpreters in JavaScript and Zig C-ABI across
      selectable 10x10 vault puzzles (including torus border wraps and runtime <code>g</code>/<code>p</code>
      self-modification), halting cleanly at <code>@</code> (9, 9).
    </p>
    <dl class="bf-kv">
      <dt>UI Stack</dt>
      <dd>Vue 3 Single-File Components + Composable TEA Engine</dd>
      <dt>Runtime</dt>
      <dd>Bun (tier-1 estate JS runtime, JCS canonical manifest)</dd>
      <dt>Verification</dt>
      <dd>Boot-time VM equivalence self-check + Idris2/Zig/Bun test suites</dd>
    </dl>
  </section>
</template>
