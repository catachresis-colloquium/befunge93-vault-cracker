// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) + I-JSON (RFC 7493) serializer & checker.
 * Used to keep `package.json` byte-for-byte compatible with `standards/tools/js-runtimes`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

function compareUtf16CodeUnits(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const diff = a.charCodeAt(i) - b.charCodeAt(i);
    if (diff !== 0) return diff;
  }
  return a.length - b.length;
}

export function jcsSerialize(value) {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("I-JSON / JCS forbids NaN and Infinity");
    }
    if (Object.is(value, -0)) {
      return "0";
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => jcsSerialize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort(compareUtf16CodeUnits);
    const props = keys.map((k) => `${JSON.stringify(k)}:${jcsSerialize(value[k])}`);
    return `{${props.join(",")}}`;
  }
  throw new TypeError(`Unsupported JCS value type: ${typeof value}`);
}

export function checkJcsBytes(rawText) {
  const parsed = JSON.parse(rawText);
  const canonical = `${jcsSerialize(parsed)}\n`;
  const stripped = rawText.endsWith("\n") ? rawText.slice(0, -1) : rawText;
  const ok = stripped === jcsSerialize(parsed);
  return { ok, canonical };
}

const isEntry =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  process.argv[1].endsWith("jcs-canon.js");

if (isEntry) {
  const mode = process.argv[2] ?? "--check";
  const targets = process.argv.length > 3 ? process.argv.slice(3) : ["package.json"];
  let failed = false;
  for (const target of targets) {
    const raw = readFileSync(target, "utf8");
    const { ok, canonical } = checkJcsBytes(raw);
    if (mode === "--write") {
      if (!ok || !raw.endsWith("\n")) {
        writeFileSync(target, canonical, "utf8");
      }
      console.log(`jcs-canon: canonicalized ${target}`);
    } else if (!ok) {
      console.error(`jcs-canon: ${target} is NOT RFC 8785 JCS canonical`);
      failed = true;
    } else {
      console.log(`jcs-canon: ${target} is I-JSON + RFC 8785 JCS canonical`);
    }
  }
  if (failed) {
    process.exit(1);
  }
}
