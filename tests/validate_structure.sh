#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# Validate repository file structure, DEED/K9 governance, Vue+Bun runtime, and RSR layout.

set -euo pipefail

PASS=0
FAIL=0

check() {
    local desc="$1"
    local path="$2"
    if [ -e "$path" ]; then
        echo "  PASS: $desc ($path)"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $desc ($path missing)"
        FAIL=$((FAIL + 1))
    fi
}

check_absent() {
    local desc="$1"
    local path="$2"
    if [ ! -e "$path" ]; then
        echo "  PASS: $desc ($path absent)"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $desc ($path must not exist)"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== Structure Validation ==="
echo ""

echo "--- Governance & Documentation ---"
check "README" "README.adoc"
check "EXPLAINME" "EXPLAINME.adoc"
check "ARCHITECTURE" "ARCHITECTURE.adoc"
check "LICENSE" "LICENSE"
check "SECURITY" "SECURITY.adoc"
check "CONTRIBUTING" ".github/CONTRIBUTING.md"
check "CODE_OF_CONDUCT" "CODE_OF_CONDUCT.adoc"
check "CHANGELOG" "CHANGELOG.adoc"
check "MAINTAINERS" "MAINTAINERS.adoc"
check "GOVERNANCE" "GOVERNANCE.adoc"
check "ABI-FFI README" "ABI-FFI-README.adoc"
check "SETUP Guide" "docs/SETUP.adoc"
check "AI Installation Guide" "docs/AI_INSTALLATION_GUIDE.adoc"

echo ""
echo "--- DEED v1.2.0 & K9 Coordination ---"
check "Canonical repo deed" "befunge93-vault-cracker_chora.deed"
check "Coordination K9" "coordination.k9"
check "AI manifest deed" ".machine_readable/0-AI-MANIFEST.deed"
check "Provisioning praxis deed" ".machine_readable/descriptiles/provisioning_praxis.deed"
check "Launcher praxis deed" ".machine_readable/descriptiles/befunge93-vault-cracker.launcher_praxis.deed"
check "Instantiated K9 service" ".machine_readable/svc/k9/vault-cracker-svc.k9.ncl"
check "Must contractile" ".machine_readable/contractiles/must/must.k9.ncl"
check "Trust contractile" ".machine_readable/contractiles/trust/trust.k9.ncl"
check "Intend contractile" ".machine_readable/contractiles/intend/intend.k9.ncl"
check "Adjust contractile" ".machine_readable/contractiles/adjust/adjust.k9.ncl"
check "Dust contractile" ".machine_readable/contractiles/dust/dust.k9.ncl"
check "Bust contractile" ".machine_readable/contractiles/bust/bust.k9.ncl"
check_absent "Retired 6a2 directory" ".machine_readable/6a2"
check_absent "Retired self-validating directory" ".machine_readable/self-validating"

echo ""
echo "--- Vue 3 + Bun Runtime & Provisioning ---"
check "package.json" "package.json"
check "bun.lock" "bun.lock"
check "deno.lock" "deno.lock"
check "pnpm-lock.yaml" "pnpm-lock.yaml"
check "index.html" "index.html"
check "server.js" "server.js"
check "Vue root App.vue" "src/App.vue"
check "launcher.sh" "launcher.sh"
check "Justfile" "Justfile"
check "Containerfile" "Containerfile"
check "mise.toml" "mise.toml"
check "mise.lock" "mise.lock"
check "guix.scm" "guix.scm"
check "manifest.scm" "manifest.scm"
check "channels.scm" "channels.scm"
check_absent "Disguised .res JSX file" "src/Bf93-vault-cracker.res"
check_absent "Duplicate .mise.toml" ".mise.toml"

echo ""
echo "--- ABI & FFI Layer ---"
check "Idris2 ipkg" "befunge93-vault-cracker.ipkg"
check "ABI Types.idr" "src/abi/Types.idr"
check "ABI Layout.idr" "src/abi/Layout.idr"
check "ABI Foreign.idr" "src/abi/Foreign.idr"
check "ABI VaultProofs.idr" "src/abi/VaultProofs.idr"
check "FFI build.zig" "ffi/zig/build.zig"
check "FFI C header" "ffi/zig/include/befunge93_vault_cracker.h"
check "FFI main.zig" "ffi/zig/src/main.zig"
check "FFI integration tests" "ffi/zig/test/integration_test.zig"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
