#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# Validate example configuration files in examples/ (syntax + RFC 8785 JCS).

set -euo pipefail

PASS=0
FAIL=0

echo "=== Example Validation ==="
echo ""

for f in examples/*.json; do
    [ -f "$f" ] || continue
    if bun scripts/jcs-canon.js --check "$f" >/dev/null 2>&1; then
        echo "  PASS: $f is valid RFC 8785 JCS JSON"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $f failed RFC 8785 JCS validation"
        FAIL=$((FAIL + 1))
    fi
done

if [ -f examples/rust-Cargo.toml ]; then
    if grep -q '^\[package\]' examples/rust-Cargo.toml && grep -q 'MPL-2.0' examples/rust-Cargo.toml; then
        echo "  PASS: examples/rust-Cargo.toml has [package] and MPL-2.0"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: examples/rust-Cargo.toml missing [package] or MPL-2.0"
        FAIL=$((FAIL + 1))
    fi
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
