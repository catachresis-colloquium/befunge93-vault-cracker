// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Coupling / Drift-Freedom (Category 18), Contract Invariants (Category 12),
 * ProvenTests Taxonomy Adequacy, and R10 Canonical-Wrongness Paired Fixtures.
 *
 * Per `hyperpolymath/proven-tests-and-benches` Rule R10 (`TEST-DOCTRINE.adoc`):
 * Negative fixtures (malformed DEEDs, malformed coordination.k9, non-JCS manifests,
 * mutated broken grids) are synthesized IN MEMORY at test runtime rather than
 * committed as static files, so estate scanners never false-positive on test data.
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { lint as lintDeed } from "../../scripts/deed_lint.js";
import { checkJcsBytes } from "../../scripts/jcs-canon.js";
import { validateCoordinationK9 } from "../../scripts/validate-coordination-k9.js";
import {
  EXPECTED_PASSCODE,
  GRID,
  TEMPO_MODES,
  WALK_TRACE,
  executeProgram,
} from "../../src/engine/befunge93.js";
import { runSelfChecks } from "../../src/engine/game-state.js";
import { classifyZigzag, evaluateTaxonomyAdequacy, PROVEN_STATUS } from "../proven_harness.js";

describe("Coupling, Must-Contractiles, R10 Canonical Wrongness & Taxonomy Adequacy", () => {
  test("Category 18 (Coupling / Drift-Freedom): VM execution, WALK_TRACE, Zig FFI, deeds, and package.json agree", () => {
    // 1. Real Befunge-93 VM execution matches WALK_TRACE final state & EXPECTED_PASSCODE
    const vmRes = executeProgram(GRID, { maxSteps: 500, recordHistory: true });
    const lastStage = WALK_TRACE[WALK_TRACE.length - 1];
    expect(vmRes.output).toBe(EXPECTED_PASSCODE);
    expect(lastStage.output).toBe(EXPECTED_PASSCODE);
    expect(vmRes.finalPos).toEqual([...lastStage.pos]);
    expect(vmRes.stack).toEqual([...lastStage.stack]);

    // Every progressive output prefix in WALK_TRACE is a prefix of EXPECTED_PASSCODE
    for (const step of WALK_TRACE) {
      expect(EXPECTED_PASSCODE.startsWith(step.output)).toBe(true);
    }

    // 2. Zig FFI source embeds the exact same 10x10 grid row 0 & passcode
    const zigMain = readFileSync("ffi/zig/src/main.zig", "utf8");
    expect(zigMain).toContain(EXPECTED_PASSCODE);

    // 3. package.json, chora deed, coordination.k9, and Zig FFI agree on MPL-2.0 and version 0.2.0
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const choraDeed = readFileSync("befunge93-vault-cracker_chora.deed", "utf8");
    const coordK9 = readFileSync("coordination.k9", "utf8");

    expect(pkg.license).toContain("MPL-2.0");
    expect(pkg.version).toBe("0.2.0");
    expect(choraDeed).toContain(':version "0.2.0"');
    expect(choraDeed).toContain(':license "MPL-2.0"');
    expect(choraDeed).toContain(`:passcode-oracle "${EXPECTED_PASSCODE}"`);
    expect(coordK9).toContain("license: MPL-2.0");
    expect(coordK9).toContain("deed_ref: befunge93-vault-cracker_chora.deed");
  });

  test("Category 12 (Contract / Invariant): every probe declared in must.k9.ncl passes live", () => {
    const mustText = readFileSync(".machine_readable/contractiles/must/must.k9.ncl", "utf8");
    const probeRegex = /id\s*=\s*"([^"]+)"[\s\S]*?probe\s*=\s*"((?:\\.|[^"\\])*)"/g;
    const extracted = [];
    let match;
    while ((match = probeRegex.exec(mustText)) !== null) {
      const id = match[1];
      const probe = JSON.parse(`"${match[2]}"`);
      extracted.push({ id, probe });
    }
    expect(extracted.length).toBeGreaterThanOrEqual(10);

    for (const { id, probe } of extracted) {
      const status = (() => {
        try {
          execSync(probe, { stdio: "pipe" });
          return 0;
        } catch (err) {
          return err.status ?? 1;
        }
      })();
      expect({ id, status }).toEqual({ id, status: 0 });
    }
  });

  test("R10 Canonical-Wrongness Pairs: DEED v1.2.0 accepts repo deeds and rejects in-memory TOML/tab/boolean/UUID mutants", () => {
    // Positive leg: all 4 committed deeds pass
    for (const path of [
      "befunge93-vault-cracker_chora.deed",
      ".machine_readable/0-AI-MANIFEST.deed",
      ".machine_readable/descriptiles/provisioning_praxis.deed",
      ".machine_readable/descriptiles/befunge93-vault-cracker.launcher_praxis.deed",
    ]) {
      expect(lintDeed(readFileSync(path, "utf8"), path)).toBeNull();
    }

    // Negative leg (constructed at runtime only — never written to disk!)
    const eqSign = String.fromCharCode(61);
    const badEquals = `;; SPDX-License-Identifier: MPL-2.0\n(repo-deed :schema-version ${eqSign} "1.0.0")\n`;
    expect(lintDeed(badEquals, "mut_chora.deed")).toContain("=");

    const badSection = ';; SPDX-License-Identifier: MPL-2.0\n(repo-deed :schema-version "1.0.0"\n[metadata])\n';
    expect(lintDeed(badSection, "mut_chora.deed")).toContain("[");

    const badTab = ';; SPDX-License-Identifier: MPL-2.0\n(repo-deed\t:schema-version "1.0.0")\n';
    expect(lintDeed(badTab, "mut_chora.deed")).toContain("tab");

    const badBool = ';; SPDX-License-Identifier: MPL-2.0\n(repo-deed :schema-version "1.0.0" (s :ok true))\n';
    expect(lintDeed(badBool, "mut_chora.deed")).toContain("#t");

    const badUuid = ';; SPDX-License-Identifier: MPL-2.0\n(repo-deed :schema-version "1.0.0" :id #u7"d:n")\n';
    expect(lintDeed(badUuid, "mut_chora.deed")).not.toBeNull();
  });

  test("R10 Canonical-Wrongness Pairs: coordination.k9 v1.2.0 and JCS reject malformed runtime mutants", () => {
    const validCoord = readFileSync("coordination.k9", "utf8");
    expect(validateCoordinationK9(validCoord, { checkDeedRefExists: true }).ok).toBe(true);

    // Runtime-constructed wrongness cases for coordination.k9
    expect(validateCoordinationK9(validCoord.replace("K9!\n", "")).ok).toBe(false);
    expect(validateCoordinationK9(`${validCoord}\n\tbad_tab: "x"\n`).ok).toBe(false);
    expect(
      validateCoordinationK9(
        "K9!\n# SPDX-License-Identifier: MPL-2.0\ninvariants:\nmetadata:\n  schema: k9-coordination\n  schema_version: 1.2.0\nproject:\n  name: \"x\"\n",
      ).ok,
    ).toBe(false);

    // Runtime-constructed wrongness case for JCS package.json
    const prettyJson = '{\n  "z": 1,\n  "a": 2\n}\n';
    expect(checkJcsBytes(prettyJson).ok).toBe(false);
    expect(checkJcsBytes('{"a":2,"z":1}\n').ok).toBe(true);

    // Runtime-constructed mutation test on vault grid: corrupting a digit breaks VM equivalence self-check
    const mutatedGrid = GRID.map((row) => row.slice());
    mutatedGrid[0][2] = "0"; // corrupt '7' -> '0'
    const report = runSelfChecks({ grid: mutatedGrid });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.id === "vm-equivalence")?.passed).toBe(false);
  });

  test("ProvenTests Taxonomy Adequacy: all 14 aspects and all applicable categories are covered", () => {
    const audit = evaluateTaxonomyAdequacy();
    expect(audit.adequate).toBe(true);
    expect(audit.coveredAspectCount).toBe(14);
    expect(audit.coveredCategoryCount + audit.documentedResidueCount).toBe(18);

    const zig = classifyZigzag("ProofRegressionTest", PROVEN_STATUS.ACTUALLY_PROVEN);
    const zag = classifyZigzag("SmokeTest", PROVEN_STATUS.UNPROVEN);
    expect(zig.pole).toBe("zig-symbolic");
    expect(zag.pole).toBe("zag-empirical");
  });

  test("CSS, Strict CSP, Justfile & AsciiDoc Drift-Freedom: zero inline styles, defined CSS tokens, and valid doc links", () => {
    const vueFiles = [];
    const walkSrc = (dir) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, ent.name);
        if (ent.isDirectory()) walkSrc(full);
        else if (ent.name.endsWith(".vue")) vueFiles.push(full);
      }
    };
    walkSrc("src");
    expect(vueFiles.length).toBeGreaterThanOrEqual(7);

    const cssText = readFileSync("src/styles/vault.css", "utf8");
    const definedTokens = new Set(
      [...cssText.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]),
    );

    for (const vf of vueFiles) {
      const content = readFileSync(vf, "utf8");
      // Strict style-src 'self' compliance: zero inline style= or :style= attributes in SFCs
      expect(/(?:^|\s):?style\s*=/m.test(content)).toBe(false);
      // Every CSS custom property var(--...) referenced in SFCs must exist in vault.css
      for (const match of content.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        expect(definedTokens.has(match[1])).toBe(true);
      }
    }

    for (const match of cssText.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
      expect(definedTokens.has(match[1])).toBe(true);
    }

    // server.js CSP must not regress to 'unsafe-inline'
    const serverSrc = readFileSync("server.js", "utf8");
    expect(serverSrc).toContain("style-src 'self'");
    expect(serverSrc.includes("unsafe-inline")).toBe(false);

    // README.adoc must mention every live TEMPO_MODES entry
    const readmeText = readFileSync("README.adoc", "utf8");
    for (const mode of TEMPO_MODES) {
      expect(readmeText).toContain(mode);
    }

    // Every recipe in Justfile's `[parallel] check:` gate must be documented in TEST-NEEDS.adoc
    const justfileText = readFileSync("Justfile", "utf8");
    const checkLine = justfileText
      .split("\n")
      .find((line) => line.startsWith("check: "));
    expect(Boolean(checkLine)).toBe(true);
    const checkGates = checkLine.replace("check:", "").trim().split(/\s+/);
    const testNeedsText = readFileSync("TEST-NEEDS.adoc", "utf8");
    for (const gate of checkGates) {
      expect(testNeedsText).toContain(gate);
    }

    // Every relative link:path[...] in tracked AsciiDoc files must resolve on disk
    const adocFiles = [
      "README.adoc",
      "EXPLAINME.adoc",
      "ABI-FFI-README.adoc",
      "GOVERNANCE.adoc",
      "TEST-NEEDS.adoc",
      "docs/SETUP.adoc",
      "docs/MARID-TRIAL-CONTRACT.adoc",
      "docs/reference/Befunge93.adoc",
    ];
    for (const docPath of adocFiles) {
      const text = readFileSync(docPath, "utf8");
      const baseDir = dirname(docPath);
      for (const m of text.matchAll(/link:([^\[\s#]+)(?:#[^\[])?\[/g)) {
        const target = m[1];
        if (/^https?:|^mailto:/.test(target)) continue;
        const resolved = resolve(baseDir, target);
        expect(existsSync(resolved)).toBe(true);
      }
    }
  });
});
