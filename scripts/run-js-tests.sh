#!/bin/sh
# SPDX-License-Identifier: MPL-2.0
# Runtime-polymorphic test entrypoint for `package.json` `scripts.test`
# (hyperpolymath/standards 3-practice/LANGUAGE-POLICY.adoc §1.4: Bun > Deno > pnpm > npm).
set -eu

if [ -f launcher.sh ] && [ ! -x launcher.sh ]; then
  chmod +x launcher.sh
fi

if command -v bun >/dev/null 2>&1; then
  exec bun test
elif command -v deno >/dev/null 2>&1; then
  exec deno run --allow-read=. scripts/runtime-smoke-test.js
elif command -v node >/dev/null 2>&1; then
  exec node scripts/runtime-smoke-test.js
else
  echo "run-js-tests: no JS runtime (bun, deno, node) found on PATH" >&2
  exit 2
fi
