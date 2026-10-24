<!--
SPDX-License-Identifier: CC-BY-SA-4.0
Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>
-->
# Contributing to `befunge93-vault-cracker`

## Getting Started

```bash
git clone https://github.com/catachresis-colloquium/befunge93-vault-cracker.git
cd befunge93-vault-cracker

# Option A: Provision via Launcher v0.6.0 + mise
./launcher.sh --setup
./launcher.sh --doctor
bun install --frozen-lockfile

# Option B: Reproducible Guix time-machine shell
guix time-machine -C channels.scm -- shell -m manifest.scm
mise install
bun install --frozen-lockfile

# Verify all 16 system & game-bit gates in parallel
just check
```

## Repository Structure

```text
befunge93-vault-cracker/
├── befunge93-vault-cracker_chora.deed   # Canonical DEED v1.2.0 repository deed
├── coordination.k9                      # AI & maintainer coordination invariants
├── src/                                 # Vue 3 SFCs, TEA engine, Marid seam & Idris2 ABI
├── ffi/zig/                             # Native Zig C-ABI Befunge-93 VM, tests & bench
├── scripts/                             # SFC compiler plugin, JCS, DEED & K9 validators
├── tests/                               # Unit, Vue DOM, 4,200+ property, R10 & E2E suites
├── benches/                             # JS + Zig benchmark suite & JCS stage ledger
├── docs/                                # Architecture, Befunge-93, setup & hygiene reports
├── .machine_readable/                   # DEED descriptiles & K9 v1.0.0 contractiles
├── CHANGELOG.adoc                       # Release history
├── CODE_OF_CONDUCT.adoc                 # Community conduct policy
├── GOVERNANCE.adoc                      # Decision-making & maintainer governance
├── MAINTAINERS.adoc                     # Active maintainer roster
├── ROADMAP.adoc                         # Completed & horizon milestones
├── SECURITY.adoc                        # Coordinated vulnerability disclosure
└── Justfile                             # 18-verb provisioning & parallel check runner
```

## Mandatory Invariants (`coordination.k9` & `must.k9.ncl`)

1. **Language & Manifest Discipline** — Keep all UI and runtime code in Vue 3 SFCs (`src/**/*.vue`), pure ESM JavaScript (`.js`), Zig (`ffi/zig/`), Idris2 (`src/abi/`), and Nickel (`.ncl`). Never introduce `.ts`, `.tsx`, `.res`, `.a2ml`, `package-lock.json`, or `yarn.lock`.
2. **RFC 8785 JCS Canonical JSON** — Run `just fmt` whenever editing `package.json`, `examples/web-project-bun.json`, `contracts/marid-vault-trial.json`, or `benches/baseline.json`, and keep `bun.lock`, `deno.lock`, and `pnpm-lock.yaml` synchronized.
3. **Rule R10 Test Fixtures** — Never commit static malformed `.deed`, `.k9`, or broken-grid fixture files; construct negative test cases in memory at test runtime (`tests/contracts/canonical-wrongness-r10.test.js`).
4. **Verification Gate** — Both `just check` and `just test-runtimes` must exit `0` before opening or updating a pull request.

## Reporting Bugs & Suggesting Features

* Check [ROADMAP.adoc](../ROADMAP.adoc) and existing GitHub issues before opening a new report.
* Never report security vulnerabilities in public issues — follow [SECURITY.adoc](../SECURITY.adoc).

## Commit Messages & Signed Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `ci:`), and sign all commits reaching `main` per the estate [SIGNING-POLICY](https://github.com/hyperpolymath/standards/blob/main/docs/SIGNING-POLICY.adoc) (`gpg.format=ssh`, squash merges).
