// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Native Bun Single-File Component (.vue) compiler plugin backed by `vue/compiler-sfc`.
 * Compiles `<script setup>` / `<script>` + `<template>` into pure ESM JavaScript
 * for both `bun test` (preload) and `Bun.build` (bundler) without Vite/Node overhead.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { compileScript, compileTemplate, parse } from "vue/compiler-sfc";

export function compileVueSfcSource(source, filename) {
  const id = basename(filename).replace(/[^a-zA-Z0-9]/g, "_");
  const { descriptor, errors } = parse(source, { filename });
  if (errors.length > 0) {
    throw new SyntaxError(`Vue SFC parse error in ${filename}: ${errors[0].message}`);
  }

  let scriptCode = "const __sfc__ = {};";
  let bindings;

  if (descriptor.script || descriptor.scriptSetup) {
    const compiledScript = compileScript(descriptor, {
      id,
      inlineTemplate: Boolean(descriptor.scriptSetup && descriptor.template),
    });
    bindings = compiledScript.bindings;
    scriptCode = compiledScript.content.replace(
      /export\s+default\s+/,
      "const __sfc__ = ",
    );
  }

  let templateCode = "";
  let attachRender = "";
  if (descriptor.template && !descriptor.scriptSetup) {
    const compiledTemplate = compileTemplate({
      id,
      filename,
      source: descriptor.template.content,
      compilerOptions: { bindingMetadata: bindings },
    });
    if (compiledTemplate.errors.length > 0) {
      throw new SyntaxError(
        `Vue SFC template error in ${filename}: ${compiledTemplate.errors[0]}`,
      );
    }
    templateCode = compiledTemplate.code;
    attachRender = "__sfc__.render = render;";
  }

  return `${scriptCode}\n${templateCode}\n${attachRender}\n__sfc__.__file = ${JSON.stringify(basename(filename))};\nexport default __sfc__;\n`;
}

export const vueSfcPlugin = {
  name: "befunge93-vue-sfc",
  setup(build) {
    build.onLoad({ filter: /\.vue$/ }, ({ path }) => {
      const source = readFileSync(path, "utf8");
      const contents = compileVueSfcSource(source, path);
      return {
        contents,
        loader: "js",
      };
    });
  },
};

if (typeof Bun !== "undefined" && typeof Bun.plugin === "function") {
  Bun.plugin(vueSfcPlugin);
}
