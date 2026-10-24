// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Single authoritative Vue 3 + Bun client bundler used by both `bun run build`
 * (`dist/`) and `server.js` (when `dist/app.js` has not been prebuilt).
 */

import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { vueSfcPlugin } from "./vue-sfc-plugin.js";

const rootDir = resolve(import.meta.dir, "..");
const outDir = resolve(rootDir, "dist");

export async function compileClientJavaScript({ minify = true } = {}) {
  const result = await Bun.build({
    entrypoints: [resolve(rootDir, "src/main.js")],
    target: "browser",
    format: "esm",
    minify,
    define: {
      __VUE_OPTIONS_API__: "false",
      __VUE_PROD_DEVTOOLS__: "false",
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
    },
    plugins: [vueSfcPlugin],
  });

  if (!result.success || result.outputs.length === 0) {
    for (const log of result.logs) {
      console.error(log);
    }
    throw new Error("Bun.build failed for src/main.js");
  }

  return await result.outputs[0].text();
}

if (import.meta.main) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const jsText = await compileClientJavaScript({ minify: true });
  writeFileSync(resolve(outDir, "app.js"), jsText, "utf8");
  copyFileSync(resolve(rootDir, "index.html"), resolve(outDir, "index.html"));
  copyFileSync(resolve(rootDir, "src/styles/vault.css"), resolve(outDir, "vault.css"));
  console.log(`Built Vue 3 + Bun bundle -> ${outDir}`);
}
