// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Executable ProvenTests & Taxonomy Registry for `befunge93-vault-cracker`.
 *
 * Mirrors the core Idris2 modules of `hyperpolymath/proven-tests-and-benches`
 * (`ProvenTests.Types`, `ProvenTests.Taxonomy`, `ProvenTests.Zigzag`, `ProvenTests.Baton`)
 * and `hyperpolymath/standards/3-practice/testing-and-benchmarking/TESTING-TAXONOMY.adoc`.
 */

export const PROVEN_STATUS = Object.freeze({
  ACTUALLY_PROVEN: "Actually-Proven",
  PROVISIONALLY_PROVEN: "Provisionally-Proven",
  UNPROVEN: "Unproven",
});

export const TEST_CATEGORIES = Object.freeze([
  "UnitTest",
  "PointToPoint",
  "EndToEnd",
  "BuildTest",
  "ExecutionRuntime",
  "ReflexiveTest",
  "LifecycleTest",
  "SmokeTest",
  "PropertyBasedTest",
  "MutationTest",
  "FuzzTest",
  "ContractInvariantTest",
  "RegressionTest",
  "ChaosResilienceTest",
  "CompatibilityTest",
  "ProofRegressionTest",
  "TypeSafeTest",
  "CouplingDriftTest",
]);

export const TEST_ASPECTS = Object.freeze([
  "Dependability",
  "Security",
  "Usability",
  "Interoperability",
  "Safety",
  "Performance",
  "Functionality",
  "Versability",
  "Accessibility",
  "Maintainability",
  "Privacy",
  "Observability",
  "Reproducibility",
  "Portability",
]);

/**
 * Classify Zigzag lattice position from `proven-tests-and-benches/src/ProvenTests/Zigzag.idr`.
 */
export function classifyZigzag(category, provenance) {
  if (!TEST_CATEGORIES.includes(category)) {
    throw new RangeError(`Unknown TestCategory: ${category}`);
  }
  if (!Object.values(PROVEN_STATUS).includes(provenance)) {
    throw new RangeError(`Unknown ProvenStatus: ${provenance}`);
  }
  const formalAxis =
    category === "ProofRegressionTest" ||
    category === "TypeSafeTest" ||
    category === "ContractInvariantTest" ||
    category === "CouplingDriftTest" ||
    category === "PropertyBasedTest";

  return {
    category,
    provenance,
    pole: formalAxis ? "zig-symbolic" : "zag-empirical",
  };
}

/**
 * Canonical test inventory for `befunge93-vault-cracker` mapped onto the
 * 18-category x 14-aspect taxonomy, with explicit honest justification for
 * non-applicable / deferred cells (per `TESTING-TAXONOMY.adoc` §11: never fake fuzz).
 */
export const VAULT_TEST_MATRIX = Object.freeze([
  Object.freeze({
    id: "suite-unit-vm",
    file: "tests/unit/befunge93-vm.test.js",
    categories: ["UnitTest", "ExecutionRuntime"],
    aspects: ["Functionality", "Safety", "Dependability"],
    provenance: PROVEN_STATUS.PROVISIONALLY_PROVEN,
  }),
  Object.freeze({
    id: "suite-unit-tea-regressions",
    file: "tests/unit/game-state-tea.test.js",
    categories: ["UnitTest", "LifecycleTest", "RegressionTest"],
    aspects: ["Functionality", "Maintainability", "Observability"],
    provenance: PROVEN_STATUS.PROVISIONALLY_PROVEN,
  }),
  Object.freeze({
    id: "suite-vue-dom-game",
    file: "tests/game/vue-components-dom.test.js",
    categories: ["PointToPoint", "EndToEnd", "LifecycleTest"],
    aspects: ["Usability", "Accessibility", "Functionality", "Privacy"],
    provenance: PROVEN_STATUS.UNPROVEN,
  }),
  Object.freeze({
    id: "suite-property-generative",
    file: "tests/property/befunge93-properties.test.js",
    categories: ["PropertyBasedTest", "ChaosResilienceTest"],
    aspects: ["Dependability", "Safety", "Reproducibility"],
    provenance: PROVEN_STATUS.PROVISIONALLY_PROVEN,
  }),
  Object.freeze({
    id: "suite-contracts-r10-coupling",
    file: "tests/contracts/canonical-wrongness-r10.test.js",
    categories: [
      "ContractInvariantTest",
      "CouplingDriftTest",
      "CompatibilityTest",
      "MutationTest",
    ],
    aspects: ["Security", "Interoperability", "Maintainability", "Portability", "Versability"],
    provenance: PROVEN_STATUS.PROVISIONALLY_PROVEN,
  }),
  Object.freeze({
    id: "suite-http-launcher-e2e",
    file: "tests/e2e/server-smoke.test.js",
    categories: ["SmokeTest", "EndToEnd", "ReflexiveTest", "BuildTest"],
    aspects: ["Security", "Observability", "Dependability", "Performance"],
    provenance: PROVEN_STATUS.UNPROVEN,
  }),
  Object.freeze({
    id: "suite-marid-companion-seam",
    file: "tests/e2e/marid-trial-seam.test.js",
    categories: ["ContractInvariantTest", "CompatibilityTest", "PointToPoint", "EndToEnd"],
    aspects: ["Interoperability", "Observability", "Dependability", "Usability"],
    provenance: PROVEN_STATUS.PROVISIONALLY_PROVEN,
  }),
  Object.freeze({
    id: "suite-idris-abi-zig-ffi",
    file: "ffi/zig/test/integration_test.zig",
    categories: ["ProofRegressionTest", "TypeSafeTest", "PointToPoint"],
    aspects: ["Safety", "Interoperability", "Performance", "Portability"],
    provenance: PROVEN_STATUS.ACTUALLY_PROVEN,
  }),
]);

export const HONEST_RESIDUE = Object.freeze({
  FuzzTest:
    "Deferred (no native libFuzzer/cargo-fuzz target; bounded random grid generation is covered under PropertyBasedTest in tests/property/befunge93-properties.test.js — no fake placeholder fuzz target per TESTING-TAXONOMY.adoc §11).",
});

export function evaluateTaxonomyAdequacy() {
  const coveredCategories = new Set();
  const coveredAspects = new Set();

  for (const entry of VAULT_TEST_MATRIX) {
    for (const c of entry.categories) coveredCategories.add(c);
    for (const a of entry.aspects) coveredAspects.add(a);
  }

  const missingCategories = TEST_CATEGORIES.filter(
    (c) => !coveredCategories.has(c) && !Object.prototype.hasOwnProperty.call(HONEST_RESIDUE, c),
  );
  const missingAspects = TEST_ASPECTS.filter((a) => !coveredAspects.has(a));

  return {
    totalCategories: TEST_CATEGORIES.length,
    coveredCategoryCount: coveredCategories.size,
    documentedResidueCount: Object.keys(HONEST_RESIDUE).length,
    totalAspects: TEST_ASPECTS.length,
    coveredAspectCount: coveredAspects.size,
    missingCategories,
    missingAspects,
    adequate: missingCategories.length === 0 && missingAspects.length === 0,
  };
}
