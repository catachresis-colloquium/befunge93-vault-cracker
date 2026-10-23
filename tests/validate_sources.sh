#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# Validate Vue 3 SFCs, ESM JavaScript modules, Idris2 ABI, and SPDX headers.

set -euo pipefail

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== Source Validation ==="
echo ""

echo "--- Banned Source Extensions ---"
BAD_EXT="$(find src scripts tests benches -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.res' -o -name '*.jsx' \) 2>/dev/null || true)"
if [ -z "$BAD_EXT" ]; then
    pass "Zero .ts/.tsx/.jsx/.res source files in src/, scripts/, tests/, benches/"
else
    fail "Banned source extensions present: $BAD_EXT"
fi

echo ""
echo "--- Vue 3 Single-File Components ---"
for vue_file in src/App.vue src/components/*.vue; do
    if grep -q "<template>" "$vue_file" && grep -q "<script setup>" "$vue_file"; then
        pass "$vue_file has <script setup> and <template>"
    else
        fail "$vue_file missing <script setup> or <template>"
    fi
    if grep -q "SPDX-License-Identifier: MPL-2.0" "$vue_file"; then
        pass "$vue_file has MPL-2.0 SPDX header"
    else
        fail "$vue_file missing MPL-2.0 SPDX header"
    fi
done

echo ""
echo "--- JavaScript Modules ---"
for js_file in server.js src/main.js src/engine/*.js src/composables/*.js src/marid/*.js scripts/*.js; do
    if grep -q "SPDX-License-Identifier:" "$js_file"; then
        pass "$js_file has SPDX header"
    else
        fail "$js_file missing SPDX header"
    fi
done

echo ""
echo "--- Idris2 ABI Sources ---"
for idr_file in src/abi/*.idr; do
    if grep -q "^module " "$idr_file" && grep -q "%default total" "$idr_file"; then
        pass "$idr_file declares module and %default total"
    else
        fail "$idr_file missing module or %default total"
    fi
done

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
