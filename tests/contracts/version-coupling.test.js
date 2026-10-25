// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Category 18 (Coupling / Drift-Freedom): the repository version is declared in
 * exactly one place -- `package.json` -- and every other coupled declaration must
 * agree with it.
 *
 * WHY THIS EXISTS
 * ---------------
 * Version drift here is not cosmetic: `.machine_readable/descriptiles/
 * provisioning_praxis.deed` is the file `hp__deed version` reads, so a stale
 * `:version` there makes `./launcher.sh --version` report the wrong release to
 * users and to `just check-launcher`. That field sat at `0.2.0` through the
 * `0.4.0` and `0.4.1` releases while `package.json`, `Justfile`, the ipkg and the
 * chora deed were all bumped -- two separate release cycles bumped four of five
 * coupled fields and silently missed the fifth.
 *
 * A release checklist cannot catch that. This gate can: it fails the suite the
 * moment any coupled field disagrees, and the negative mutants below prove the
 * detector actually detects rather than passing vacuously.
 *
 * Per `hyperpolymath/proven-tests-and-benches` Rule R10, every negative fixture
 * is synthesized IN MEMORY from the real file contents at test runtime. No broken
 * file is committed, so estate scanners never false-positive on test data.
 */

import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

/** `package.json` is the single source of truth for the repository version. */
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const CANONICAL = pkg.version;

/**
 * Every file that must declare the same version as `package.json`.
 *
 * `extract` returns `null` when the field is ABSENT -- which the gate treats as a
 * failure, not as a pass. A missing version field must never be able to look like
 * a matching one.
 */
const COUPLED = [
  {
    path: "Justfile",
    field: "`version := \"...\"` variable",
    extract: (text) => /^version := "([^"]+)"$/m.exec(text)?.[1] ?? null,
  },
  {
    path: "befunge93-vault-cracker.ipkg",
    field: "`version = ...` ipkg key",
    extract: (text) => /^version = ([^\s#]+)$/m.exec(text)?.[1] ?? null,
  },
  {
    path: "befunge93-vault-cracker_chora.deed",
    field: "`:version \"...\"` deed key",
    extract: (text) => /:version "([^"]+)"/.exec(text)?.[1] ?? null,
  },
  {
    path: ".machine_readable/descriptiles/provisioning_praxis.deed",
    field: "`:version \"...\"` descriptile key (read by `hp__deed version`)",
    extract: (text) => /^\s*:version "([^"]+)"$/m.exec(text)?.[1] ?? null,
  },
  {
    path: "ROADMAP.adoc",
    field: "`== Current Status (`v...`)` heading",
    extract: (text) => /^== Current Status \(`v([^`]+)`\)$/m.exec(text)?.[1] ?? null,
  },
  {
    path: "CHANGELOG.adoc",
    field: "newest `== [...]` release entry",
    extract: (text) => /^== \[([^\]]+)\]/m.exec(text)?.[1] ?? null,
  },
  {
    path: "launcher.sh",
    field: "`(artefact :type \"launcher\" :version \"...\")` header comment",
    extract: (text) =>
      /\(artefact :type "launcher" :version "([^"]+)"/.exec(text)?.[1] ?? null,
  },
];

const read = (path) => readFileSync(path, "utf8");

describe("Category 18 (Coupling / Drift-Freedom): single-source repository version", () => {
  test(`every coupled declaration agrees with package.json (${CANONICAL})`, () => {
    const drifted = [];
    for (const { path, field, extract } of COUPLED) {
      const found = extract(read(path));
      if (found !== CANONICAL) {
        drifted.push(`${path}: ${field} = ${JSON.stringify(found)} != ${JSON.stringify(CANONICAL)}`);
      }
    }
    // Report every drift at once, not just the first, so a release bump that
    // missed three files surfaces all three in one run.
    expect(drifted).toEqual([]);
  });

  test("no coupled field is merely absent (absence must not pass as agreement)", () => {
    const missing = [];
    for (const { path, field, extract } of COUPLED) {
      if (extract(read(path)) === null) {
        missing.push(`${path}: ${field} not found`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("package.json declares a parseable semantic version", () => {
    expect(typeof CANONICAL).toBe("string");
    expect(CANONICAL).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  test("R10 negative mutants: a drifted version in any coupled file is detected", () => {
    // Synthesize drift IN MEMORY from the real file contents. Each mutant must be
    // (a) different from the original and (b) rejected by the same extractor the
    // positive gate uses -- otherwise the gate proves nothing.
    const DRIFT = "0.0.1-drifted";

    for (const { path, field, extract } of COUPLED) {
      const original = read(path);
      const real = extract(original);
      expect(real, `${path}: expected a real version before mutating`).toBe(CANONICAL);

      // Replace the canonical version with a drifted one. For the CHANGELOG the
      // newest entry heading is what carries it, so a plain replace is correct.
      const mutant = original.replace(real, DRIFT);
      expect(mutant, `${path}: mutation produced no change`).not.toBe(original);

      const detected = extract(mutant);
      expect(
        detected === CANONICAL,
        `${path}: ${field} drift was NOT detected (extractor still returned the canonical version)`,
      ).toBe(false);
      expect(detected).toBe(DRIFT);
    }
  });

  test("R10 negative mutants: deleting a version field is detected, not passed", () => {
    // A deletion is the nastier drift mode: the field is gone entirely. The
    // extractor must return null so the gate fails loudly.
    const chora = read("befunge93-vault-cracker_chora.deed");
    const stripped = chora.replace(/:version "[^"]+"\n/, "");
    expect(stripped).not.toBe(chora);
    expect(COUPLED.find((c) => c.path.endsWith("_chora.deed")).extract(stripped)).toBeNull();

    const justfile = read("Justfile");
    const noVar = justfile.replace(/^version := "[^"]+"$/m, "# version removed");
    expect(noVar).not.toBe(justfile);
    expect(COUPLED.find((c) => c.path === "Justfile").extract(noVar)).toBeNull();
  });

  for (const { path, extract } of COUPLED) {
    test(`R10 deletion: ${path} cannot retain agreement after its declaration is removed`, () => {
      const original = read(path);
      const lines = original.split("\n");
      const declarationIndex = lines.findIndex((line) => extract(line) === CANONICAL);
      expect(declarationIndex).toBeGreaterThanOrEqual(0);

      lines.splice(declarationIndex, 1);
      const mutant = lines.join("\n");
      expect(mutant).not.toBe(original);
      expect(extract(mutant)).not.toBe(CANONICAL);

      // A changelog retains older release headings; the other files have one
      // repository-version declaration. Schema and compliance versions remain.
      if (path !== "CHANGELOG.adoc") expect(extract(mutant)).toBeNull();
    });

    test(`${path} extracts a future release without truncating its version`, () => {
      const original = read(path);
      const declaration = original.split("\n").find((line) => extract(line) === CANONICAL);
      expect(declaration).toBeDefined();

      // Derive boundary mutants from the current release so these tests also
      // survive a version bump. The first two retain it as a prefix.
      const [major] = CANONICAL.split(".").map(Number);
      for (const version of [`${CANONICAL}0`, `${CANONICAL}-rc.1`, `${major + 1}.0.0`]) {
        const mutant = original.replace(declaration, declaration.replace(CANONICAL, version));
        expect(mutant).not.toBe(original);
        expect(extract(mutant)).toBe(version);
        expect(extract(mutant)).not.toBe(CANONICAL);
      }
    });
  }

  test("the changelog checks the newest release even when an older entry agrees", () => {
    const extract = COUPLED.find((c) => c.path === "CHANGELOG.adoc").extract;
    const original = read("CHANGELOG.adoc");
    const major = Number(CANONICAL.split(".")[0]);
    const future = `${major + 1}.0.0`;
    const heading = `== [${future}] - 2099-01-01\n\n`;
    const mutant = original.replace(/^== \[/m, `${heading}== [`);

    expect(mutant).not.toBe(original);
    expect(mutant).toContain(`== [${CANONICAL}]`);
    expect(extract(mutant)).toBe(future);
  });

  test("historical changelog versions do not cause current-release drift", () => {
    const extract = COUPLED.find((c) => c.path === "CHANGELOG.adoc").extract;
    const original = read("CHANGELOG.adoc");
    const historical = [...original.matchAll(/^== \[([^\]]+)\]/gm)].slice(1);
    expect(historical.length).toBeGreaterThan(0);

    let mutant = original;
    for (const [heading] of historical) mutant = mutant.replace(heading, "== [0.0.1-history]");
    expect(mutant).not.toBe(original);
    expect(extract(mutant)).toBe(CANONICAL);
  });

  test("changelog prose mentioning the current release is not a release heading", () => {
    const extract = COUPLED.find((c) => c.path === "CHANGELOG.adoc").extract;
    const original = read("CHANGELOG.adoc");
    const mutant = original.replace(/^== \[[^\]]+\].*$/gm, "");

    expect(mutant).not.toBe(original);
    expect(extract(`${mutant}\nSee release [${CANONICAL}].\n`)).toBeNull();
  });

  test("schema and launcher-standard versions cannot substitute for a repository version", () => {
    for (const path of [
      "befunge93-vault-cracker_chora.deed",
      ".machine_readable/descriptiles/provisioning_praxis.deed",
      "launcher.sh",
    ]) {
      const extract = COUPLED.find((c) => c.path === path).extract;
      const original = read(path);
      const lines = original.split("\n");
      const declarationIndex = lines.findIndex((line) => extract(line) === CANONICAL);
      expect(declarationIndex).toBeGreaterThanOrEqual(0);

      // Leave the version value in place under a different key: a broad search
      // for a semver or the canonical string would still find it and pass.
      lines[declarationIndex] = lines[declarationIndex].replace(":version", ":release");
      const mutant = lines.join("\n");
      expect(mutant).not.toBe(original);
      expect(mutant).toContain(CANONICAL);
      expect(mutant).toContain(":schema-version");
      expect(extract(mutant)).toBeNull();
    }
  });

  test("the documented exclusions are excluded for a real reason, not to hide drift", () => {
    // examples/web-project-bun.json is an INDEPENDENT canonical example manifest
    // for a different package (`example-bun-vue-app`), used to exercise RFC 8785
    // JCS canonicalization. Its own version and dependency pins are deliberately
    // unrelated to this repository's. Assert the reason holds rather than merely
    // omitting the file -- so that if it were ever repurposed into a coupled
    // manifest, this test would say so.
    const example = JSON.parse(read("examples/web-project-bun.json"));
    expect(example.name).toBe("example-bun-vue-app");
    expect(example.name).not.toBe(pkg.name);

    // The lockfiles carry DEPENDENCY versions, not the repository version, so they
    // are out of scope for the coupling gate above -- but their dependency pins
    // ARE coupled to `package.json`, and that coupling is worth asserting here
    // because the estate's one-manifest policy depends on it.
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const bunPackages = Bun.JSONC.parse(read("bun.lock")).packages;
    const pnpmImporter = Bun.YAML.parse(read("pnpm-lock.yaml")).importers["."];
    const pnpmDeps = { ...pnpmImporter.dependencies, ...pnpmImporter.devDependencies };
    for (const [name, version] of Object.entries(deps)) {
      expect(
        bunPackages[name]?.[0],
        `bun.lock does not pin ${name}@${version} declared by package.json`,
      ).toBe(`${name}@${version}`);
      expect(
        pnpmDeps[name]?.version,
        `pnpm-lock.yaml does not pin ${name}@${version} declared by package.json`,
      ).toBe(version);
    }

    // The hygiene report's `:repo-version:` names the release the REPORT describes
    // (a point-in-time audit artefact), not the live repository version, so it is
    // intentionally not coupled -- bumping it without re-auditing would make the
    // report claim to describe a release it never measured.
    const report = read("docs/reports/ai-engineering-hygiene-v0.4.0.adoc");
    const reportVersion = /^:repo-version: (\S+)$/m.exec(report)?.[1] ?? null;
    expect(reportVersion).not.toBeNull();
    expect(reportVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  /**
   * KNOWN DRIFT, deliberately pinned rather than silently ignored.
   *
   * `deno.lock` is stale: it pins `vue@3.5.22` and `happy-dom@17.4.4` while
   * `package.json`, `bun.lock` and `pnpm-lock.yaml` all agree on `vue@3.5.44` and
   * `happy-dom@21.0.4`. This is almost certainly the cause of the long-standing
   * red `governance / JS runtimes -- deno` and `Multi-Runtime Gate / deno` checks
   * ("One manifest, deno"), which enforce exactly this one-manifest consistency.
   *
   * It cannot be fixed from a sandbox without a Deno binary: regenerating a v5
   * lockfile means recomputing integrity hashes for the whole transitive tree, and
   * hand-editing those hashes would produce a lockfile that fails verification --
   * strictly worse than one that is visibly stale.
   *
   * So this test pins the current stale values. That has two effects: the drift
   * cannot get *worse* unnoticed, and whoever regenerates `deno.lock` properly
   * will see this test fail and must then consciously DELETE it (and the matching
   * ROADMAP item) rather than leaving a stale assertion behind.
   */
  test("KNOWN DRIFT (tracked in ROADMAP): deno.lock pins older deps than package.json", () => {
    const deno = read("deno.lock");
    const denoVue = /npm:vue@([\d.]+)/.exec(deno)?.[1] ?? null;
    const denoHappyDom = /npm:happy-dom@([\d.]+)/.exec(deno)?.[1] ?? null;

    // The known-stale pins. If these fail, deno.lock was regenerated -- delete this
    // test and the ROADMAP item, and confirm the two deno CI checks go green.
    expect(denoVue).toBe("3.5.22");
    expect(denoHappyDom).toBe("17.4.4");

    // And assert the drift is real, so this test cannot outlive its own premise.
    expect(denoVue).not.toBe(deps_vue());
    expect(denoHappyDom).not.toBe(deps_happyDom());
  });
});

/** `package.json`'s declared `vue` version -- the value `deno.lock` should match. */
function deps_vue() {
  return JSON.parse(readFileSync("package.json", "utf8")).dependencies.vue;
}

/** `package.json`'s declared `happy-dom` version -- the value `deno.lock` should match. */
function deps_happyDom() {
  return JSON.parse(readFileSync("package.json", "utf8")).devDependencies["happy-dom"];
}
