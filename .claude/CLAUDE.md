<!--
SPDX-License-Identifier: CC-BY-SA-4.0
Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
-->
# CLAUDE.md — AI Assistant Instructions for `befunge93-vault-cracker`

## Authority Spine (Read First)

1. `befunge93-vault-cracker_chora.deed` — Canonical DEED v1.2.0 repository deed (`(anchor)`, `(state)`, `(intent)`, `(ecosystem)`, `(agentic)`, `(neurosym)`, `(playbook)`).
2. `coordination.k9` — AI and maintainer coordination invariants (`k9-coordination` v1.2.0).
3. `.machine_readable/0-AI-MANIFEST.deed` — Agent session entry rules.
4. `.machine_readable/contractiles/<verb>/<verb>.k9.ncl` — K9 v1.0.0 contractile trident (`intend`, `must`, `trust`, `adjust`, `dust`, `bust`).

## Stack & Invariants

- **UI & Runtime**: Vue 3 Single-File Components (`src/App.vue`, `src/components/*.vue`) + pure ESM JavaScript (`src/engine/*.js`, `src/composables/*.js`, `src/marid/*.js`) running on **Bun** (`server.js`, `scripts/build.js`).
- **Manifest & Lockfiles**: `package.json` MUST remain RFC 8785 JCS canonical (`just fmt` / `just fmt-check`) with synchronized `bun.lock`, `deno.lock`, and `pnpm-lock.yaml`. Never introduce `package-lock.json`, `yarn.lock`, `.ts`, `.tsx`, `.res`, or `.a2ml` files.
- **Formal ABI & Native FFI**: `src/abi/*.idr` (`%default total` Idris2) + `ffi/zig/` (Zig C-ABI `libbefunge93_vault_cracker` loaded via `bun:ffi` in `src/marid/native-oracle.js`).
- **Verification**: Always run `just check` (executes all 16 system & game-bit targets concurrently in parallel) and `./launcher.sh --doctor` before concluding changes.
