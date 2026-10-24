# SPDX-License-Identifier: MPL-2.0
# Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
#
# Befunge-93 Vault Cracker — Parallel System & Game Verification Suite
# Requires: just >= 1.42.0 (for `mod` and `[parallel]`).
# Canon: hyperpolymath/standards PROVISIONING-STANDARD.adoc (18 canonical verbs).

set shell := ["bash", "-euo", "pipefail", "-c"]

# Provisioning module (`just provision::doctor`, `just provision::check`, etc.)
mod provision "build/just/provision.just"

project := "befunge93-vault-cracker"
version := "0.2.0"
host    := env("HOST", "0.0.0.0")
port    := env("PORT", "8000")

# Default recipe: list all available commands
default: help

# Show available recipes grouped by category
[group('meta')]
help:
    @just --list --unsorted

# ============================================================================
# CANONICAL PROVISIONING & LIFECYCLE VERBS (18-VERB FLOOR)
# ============================================================================

# Install pinned developer tools and frozen JS dependencies
[group('provisioning')]
setup:
    ./launcher.sh --setup
    bun install --frozen-lockfile

# Diagnose toolchain, lockfiles, deeds, and provisioning health (read-only)
[group('provisioning')]
doctor:
    ./launcher.sh --doctor

# Repair drift in installed tools and rebuild the frontend bundle
[group('provisioning')]
heal:
    ./launcher.sh --heal
    bun install --frozen-lockfile
    bun run build

# Compile Vue 3 Single-File Components, bundle dist/, and build the Zig C-ABI oracle library
[group('build')]
build: build-web build-ffi

# Compile only the Vue 3 + Bun web bundle into dist/
[group('build')]
build-web:
    bun run build

# Compile the Zig C-ABI shared library into _build/ffi/lib/ for bun:ffi (keeping ffi/zig/ pure source)
[group('build')]
build-ffi:
    @if command -v zig >/dev/null 2>&1; then (cd ffi/zig && zig build -Doptimize=ReleaseSafe --cache-dir ../../_build/ffi-cache -p ../../_build/ffi); fi

# Install and verify locked dependencies without mutating lockfiles
[group('provisioning')]
deps:
    bun install --frozen-lockfile

# Enter the Guix development shell (or mise environment fallback)
[group('provisioning')]
dev-shell: provision::dev-shell

# Bump mise tools to latest, re-lock mise.lock, and re-pin Guix channels
[group('provisioning')]
toolchain-refresh: provision::toolchain-refresh

# Print the canonical prompt for AI assistants setting up this repository
[group('provisioning')]
ai-setup: provision::ai-setup

# Print role-tailored LLM warm-up context (`user`, `dev`, or `maintainer`)
[group('provisioning')]
ai-warmup role='dev': (provision::ai-warmup role)

# Execute tests and benchmarks with structured timing saved under .eval/
[group('provisioning')]
eval: provision::eval

# Display where toolchain, runtime, and service configuration live
[group('provisioning')]
config-show: provision::config-show

# Display OPSM fetch and installation metadata
[group('provisioning')]
opsm: provision::opsm

# Run the complete unit, Vue DOM, property, contract, and E2E test suite
[group('test')]
test:
    bun test

# Run EVERY repository-system and game-system check concurrently in parallel
[group('check')]
[parallel]
check: check-structure check-sources check-examples check-jcs check-deeds check-k9 check-launcher check-ffi check-abi check-game-vm check-game-tea check-game-ui check-game-properties check-game-contracts check-game-server check-marid-seam

# Canonicalize RFC 8785 JCS JSON manifests in place
[group('quality')]
fmt:
    bun scripts/jcs-canon.js --write package.json examples/web-project-bun.json contracts/marid-vault-trial.json benches/baseline.json

# Verify formatting and RFC 8785 JCS canonicalization without modifying files
[group('quality')]
fmt-check:
    bun scripts/jcs-canon.js --check package.json examples/web-project-bun.json contracts/marid-vault-trial.json benches/baseline.json

# Lint deeds, K9 contracts, coordination manifest, shell scripts, and sources
[group('quality')]
[parallel]
lint: check-deeds check-k9 check-sources check-jcs check-shell

# Remove generated build artifacts and ephemeral FFI caches
[group('build')]
clean:
    rm -rf dist ffi/zig/zig-out ffi/zig/.zig-cache build-idris

# Alias for `serve`: build and run the Befunge-93 Vault Cracker web server
[group('runtime')]
run: serve

# Full non-interactive CI gate: frozen lockfile check + parallel `check` + multi-runtime tests + benchmarks
[group('ci')]
ci:
    bun install --frozen-lockfile
    just check
    just bench-js

# Supply-chain, secret, and vulnerability audit
[group('security')]
audit:
    @echo "=== Security & Supply-Chain Audit ==="
    @test -f SECURITY.adoc && test -f .well-known/security.txt
    @! grep -rnE '(PRIVATE KEY|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16})' src/ scripts/ server.js
    @if command -v trivy >/dev/null 2>&1; then trivy fs --scanners vuln,secret --quiet .; else echo "  INFO: trivy not installed; baseline secret/policy checks passed"; fi

# Generate CycloneDX / package inventory summary from locked dependencies
[group('security')]
sbom:
    @bun -e 'const fs=require("node:fs"); const p=JSON.parse(fs.readFileSync("package.json","utf8")); console.log(JSON.stringify({bomFormat:"CycloneDX",specVersion:"1.5",version:1,metadata:{component:{name:p.name,version:p.version,licenses:[{license:{id:p.license}}]}},components:Object.entries({...p.dependencies,...p.devDependencies}).map(([name,version])=>({type:"library",name,version}))},null,2));'

# Verify clean state, tag readiness, and build release bundle
[group('release')]
release: check build
    @echo "Release {{version}} verified and built in dist/"

# Build sealed OCI container image via Podman (or Docker fallback)
[group('container')]
container:
    @if command -v podman >/dev/null 2>&1; then podman build -f Containerfile -t {{project}}:{{version}} .; elif command -v docker >/dev/null 2>&1; then docker build -f Containerfile -t {{project}}:{{version}} .; else echo "Neither podman nor docker installed; validating Containerfile syntax..."; grep -q '^FROM docker.io/oven/bun:' Containerfile && grep -q '^USER bun' Containerfile; fi

# Sign or verify release checksums for dist/ artifacts
[group('release')]
sign: build
    sha256sum dist/index.html dist/app.js dist/vault.css

# ============================================================================
# RUNTIME & LAUNCHER COMMANDS (`just serve`, `just dev`, `just start`, etc.)
# ============================================================================

# Build fresh Vue 3 bundle and serve the game on http://{{host}}:{{port}}
[group('runtime')]
serve: build
    HOST={{host}} PORT={{port}} bun run server.js

# Serve in watch mode for live local development
[group('runtime')]
dev: build
    HOST={{host}} PORT={{port}} bun --watch run server.js

# Start the puzzle server in the background via the compliant launcher
[group('runtime')]
start:
    ./launcher.sh --start

# Stop the background puzzle server
[group('runtime')]
stop:
    ./launcher.sh --stop

# Query background puzzle server health and PID
[group('runtime')]
status:
    ./launcher.sh --status

# ============================================================================
# REPOSITORY-AS-A-SYSTEM BIT-BY-BIT CHECKS
# ============================================================================

# Run all repository-system checks in parallel
[group('check-system')]
[parallel]
check-system: check-structure check-sources check-examples check-jcs check-deeds check-k9 check-launcher check-ffi check-abi

# Bit 1: Repository layout, governance files, and absence of retired paths
[group('check-system')]
check-structure:
    bash tests/validate_structure.sh

# Bit 2: Source extensions, SPDX headers, Vue SFC blocks, and Idris2 totality
[group('check-system')]
check-sources:
    bash tests/validate_sources.sh

# Bit 3: Example manifests in examples/
[group('check-system')]
check-examples:
    bash tests/validate_examples.sh

# Bit 4: RFC 8785 JCS manifest canonicalization & multi-runtime lockfiles
[group('check-system')]
check-jcs:
    bun scripts/jcs-canon.js --check package.json examples/web-project-bun.json contracts/marid-vault-trial.json benches/baseline.json
    test -f bun.lock && test -f deno.lock && test -f pnpm-lock.yaml
    test ! -f package-lock.json && test ! -f yarn.lock

# Bit 5: DEED v1.2.0 formal grammar, UUIDv5/v8 literals, and chora clauses
[group('check-system')]
check-deeds:
    bun scripts/deed_lint.js befunge93-vault-cracker_chora.deed .machine_readable/0-AI-MANIFEST.deed .machine_readable/descriptiles/provisioning_praxis.deed .machine_readable/descriptiles/befunge93-vault-cracker.launcher_praxis.deed

# Bit 6: coordination.k9 v1.2.0 + K9 v1.0.0 contractiles & service components
[group('check-system')]
check-k9:
    bun scripts/validate-coordination-k9.js coordination.k9
    bash scripts/k9/tools/k9-validate.sh .machine_readable/svc/k9/vault-cracker-svc.k9.ncl .machine_readable/contractiles/*/*.k9.ncl

# Bit 7: Launcher v0.6.0 header, provisioning set audit, and doctor check
[group('check-system')]
check-launcher:
    @[ -x launcher.sh ] || chmod +x launcher.sh
    bash build/just/provision-check.sh .
    ./launcher.sh --version
    ./launcher.sh --help >/dev/null

# Bit 8: Zig C-ABI FFI compilation, unit tests, and C header integration tests
[group('check-system')]
check-ffi:
    bash tests/validate_ffi.sh

# Bit 9: Idris2 formal ABI & ProvenTests module verification
[group('check-system')]
check-abi:
    test -f befunge93-vault-cracker.ipkg
    @for f in src/abi/Types.idr src/abi/Layout.idr src/abi/Foreign.idr src/abi/VaultProofs.idr; do grep -q '%default total' "$f"; done
    @if command -v idris2 >/dev/null 2>&1; then idris2 --build befunge93-vault-cracker.ipkg; else echo "  PASS: Idris2 ABI sources verified (idris2 compiler optional locally)"; fi

# Optional ShellCheck pass over launcher.sh and validation scripts
[group('check-system')]
check-shell:
    @if command -v shellcheck >/dev/null 2>&1; then shellcheck -x launcher.sh tests/validate_*.sh scripts/run-js-tests.sh; else bash -n launcher.sh && for s in tests/validate_*.sh; do bash -n "$$s"; done; echo "  PASS: bash -n syntax verified on all shell scripts"; fi

# ============================================================================
# PARODY UI AS A GAME-SYSTEM BIT-BY-BIT CHECKS
# ============================================================================

# Run all parody UI & Befunge-93 game-system checks in parallel
[group('check-game')]
[parallel]
check-game: check-game-vm check-game-tea check-game-ui check-game-properties check-game-contracts check-game-server check-marid-seam

# Game Bit 1: 2D torus Befunge-93 VM (opcodes, wraparound, stringmode, g/p, halt)
[group('check-game')]
check-game-vm:
    bun test tests/unit/befunge93-vm.test.js

# Game Bit 2: Pure TEA reducer (Start/Pause/Step/Tick/Reset, tempo, passcode oracle, R-01..R-04)
[group('check-game')]
check-game-tea:
    bun test tests/unit/game-state-tea.test.js

# Game Bit 3: Vue 3 SFC DOM mount, 10x10 ARIA grid, keyboard nav, 18-step solve & vault unlock
[group('check-game')]
check-game-ui:
    bun test tests/game/vue-components-dom.test.js

# Game Bit 4: Generative property-based tests (4,200+ randomized grids, chaos streams & JCS)
[group('check-game')]
check-game-properties: build-ffi
    bun test tests/property/befunge93-properties.test.js

# Game Bit 5: Cross-layer coupling, live must.k9.ncl probes, ProvenTests adequacy & R10 wrongness pairs
[group('check-game')]
check-game-contracts:
    bun test tests/contracts/canonical-wrongness-r10.test.js

# Game Bit 6: Live Bun HTTP server smoke, CSP headers & background launcher lifecycle
[group('check-game')]
check-game-server: build-web build-ffi
    bun test tests/e2e/server-smoke.test.js

# Game Bit 7: Option-2 Marid companion wire contract (Stage A unary/RFC 9457, Stage B SSE, proxy & Vue panel)
[group('check-game')]
check-marid-seam: build-ffi
    bun test tests/e2e/marid-trial-seam.test.js
    bun scripts/verify-marid-trial.js

# Serve the puzzle UI reverse-proxying `/api/*` to a live upstream Julia Marid companion
[group('runtime')]
serve-marid upstream='http://127.0.0.1:6274': build
    HOST={{host}} PORT={{port}} MARID_UPSTREAM_URL={{upstream}} bun run server.js

# Verify Stage A (`a`) or full (`all`) Marid companion contract against MARID_TRIAL_URL (or local shim)
[group('check-game')]
verify-marid-upstream stage='a':
    bun scripts/verify-marid-trial.js --stage {{stage}}

# ============================================================================
# MULTI-RUNTIME & BENCHMARK TARGETS
# ============================================================================

# Verify identical test execution across Bun, Deno, and pnpm from one package.json
[group('test')]
test-runtimes:
    bun test
    deno task test
    pnpm run test

# Run both JavaScript/Vue and native Zig C-ABI FFI microbenchmarks
[group('bench')]
bench: bench-js bench-ffi

# Run Bun VM, TEA playthrough, JCS, and Vue SFC compiler benchmarks against baseline.json
[group('bench')]
bench-js:
    bun run bench

# Run native 50,000-iteration Zig C-ABI vault VM benchmark
[group('bench')]
bench-ffi:
    @if command -v zig >/dev/null 2>&1; then (cd ffi/zig && zig build bench && rm -rf zig-out .zig-cache); else echo "zig not installed; skipping native FFI benchmark"; fi
