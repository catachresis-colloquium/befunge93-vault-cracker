#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# Validate Zig FFI sources, C header integrity, and unrendered template absence.

set -euo pipefail

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== FFI Validation ==="
echo ""

for f in ffi/zig/build.zig ffi/zig/include/befunge93_vault_cracker.h ffi/zig/src/main.zig ffi/zig/test/integration_test.zig ffi/zig/bench/bench.zig; do
    if [ -s "$f" ]; then
        pass "$f exists and is non-empty"
    else
        fail "$f missing or empty"
    fi
    if ! grep -q '{{' "$f"; then
        pass "$f has zero unrendered template placeholders"
    else
        fail "$f still contains unrendered {{...}} placeholders"
    fi
done

if grep -q "export fn befunge93_vault_cracker_run_vault" ffi/zig/src/main.zig; then
    pass "Zig FFI exports C-ABI vault execution symbol"
else
    fail "Zig FFI missing befunge93_vault_cracker_run_vault export"
fi

if command -v zig >/dev/null 2>&1; then
    ZIG_TMP_CACHE="$(mktemp -d)"
    ZIG_TMP_PREFIX="$(mktemp -d)"
    if (cd ffi/zig && zig build test --cache-dir "$ZIG_TMP_CACHE" -p "$ZIG_TMP_PREFIX"); then
        pass "zig build test passed all unit & C-ABI integration suites"
        rm -rf "$ZIG_TMP_CACHE" "$ZIG_TMP_PREFIX"
    else
        rm -rf "$ZIG_TMP_CACHE" "$ZIG_TMP_PREFIX"
        fail "zig build test failed"
    fi
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
