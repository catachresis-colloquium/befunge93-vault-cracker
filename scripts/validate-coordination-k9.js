// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Conformance validator for `coordination.k9` against
 * `hyperpolymath/standards/2-protocols/k9-coordination/spec/abnf/coordination-k9-grammar_v1.2.abnf`.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const SECTION_ORDER = Object.freeze([
  "metadata",
  "project",
  "build_commands",
  "invariants",
  "protected",
  "architecture",
  "innervation",
  "do_not_create",
  "terminology",
  "ecosystem",
  "coordination",
]);

const REQUIRED_SECTIONS = Object.freeze(["metadata", "project", "invariants"]);

export function validateCoordinationK9(text, options = {}) {
  const errors = [];
  const checkDeedRefExists = options.checkDeedRefExists ?? false;
  const repoRoot = options.repoRoot ?? ".";

  if (text.includes("\t")) {
    errors.push("Tab character forbidden by coordination-k9-grammar_v1.2.abnf (Note 1)");
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length < 4 || lines[0] !== "K9!") {
    errors.push('Line 1 MUST be exact magic number "K9!" with no leading/trailing spaces');
  }

  let idx = 1;
  let spdxCount = 0;
  while (idx < lines.length && lines[idx].startsWith("# SPDX-")) {
    spdxCount += 1;
    idx += 1;
  }
  if (spdxCount === 0) {
    errors.push('At least one "# SPDX-..." header line MUST immediately follow "K9!"');
  }

  const seenSections = [];
  let currentSection = null;
  let sectionLineCount = 0;
  let pendingGapSinceSectionBody = false;
  let metadataSchema = null;
  let metadataVersion = null;
  let deedRef = null;

  for (; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const lineNo = idx + 1;

    if (line.trim() === "" || line.startsWith("#")) {
      if (currentSection !== null && sectionLineCount > 0) {
        pendingGapSinceSectionBody = true;
      }
      continue;
    }

    const topMatch = /^([a-z_]+):$/.exec(line);
    if (topMatch) {
      const sec = topMatch[1];
      if (!SECTION_ORDER.includes(sec)) {
        errors.push(`Line ${lineNo}: unknown top-level section "${sec}:"`);
      } else {
        if (seenSections.includes(sec)) {
          errors.push(`Line ${lineNo}: duplicate section "${sec}:"`);
        }
        if (seenSections.length > 0) {
          const prev = seenSections[seenSections.length - 1];
          if (SECTION_ORDER.indexOf(sec) < SECTION_ORDER.indexOf(prev)) {
            errors.push(
              `Line ${lineNo}: section "${sec}:" out of order after "${prev}:" (expected ABNF v1.2.0 order)`,
            );
          }
        }
        seenSections.push(sec);
      }
      currentSection = sec;
      sectionLineCount = 0;
      pendingGapSinceSectionBody = false;
      continue;
    }

    if (currentSection === null) {
      errors.push(`Line ${lineNo}: unexpected content before first section: ${line}`);
      continue;
    }

    if (pendingGapSinceSectionBody) {
      errors.push(
        `Line ${lineNo}: blank lines or column-0 comments are not permitted inside section "${currentSection}:" (Note 8)`,
      );
      pendingGapSinceSectionBody = false;
    }

    const leadingSpaces = line.length - line.trimStart().length;
    if (leadingSpaces === 0 || leadingSpaces % 2 !== 0) {
      errors.push(`Line ${lineNo}: indentation must be a non-zero multiple of 2 spaces (got ${leadingSpaces})`);
    }
    sectionLineCount += 1;

    if (currentSection === "metadata") {
      const m = /^  (schema|schema_version|generated_by|last_updated): (.+)$/.exec(line);
      if (!m) {
        errors.push(`Line ${lineNo}: invalid metadata field: ${line}`);
      } else {
        if (m[1] === "schema") metadataSchema = m[2].replace(/^"|"$/g, "");
        if (m[1] === "schema_version") metadataVersion = m[2].replace(/^"|"$/g, "");
        if (m[1] === "last_updated" && !/^\d{4}-\d{2}-\d{2}/.test(m[2])) {
          errors.push(`Line ${lineNo}: metadata.last_updated must be ISO 8601 date`);
        }
      }
    }

    if (currentSection === "project") {
      const dm = /^  deed_ref: ([A-Za-z0-9._-]+\.deed)$/.exec(line);
      if (dm) {
        deedRef = dm[1];
      }
    }

    if (currentSection === "invariants") {
      const sm = /^    severity: (.+)$/.exec(line);
      if (sm && !["critical", "high", "moderate"].includes(sm[1])) {
        errors.push(`Line ${lineNo}: invalid invariant severity "${sm[1]}"`);
      }
    }
  }

  for (const req of REQUIRED_SECTIONS) {
    if (!seenSections.includes(req)) {
      errors.push(`Missing required section "${req}:"`);
    }
  }

  if (metadataSchema !== "k9-coordination") {
    errors.push(`metadata.schema must be "k9-coordination" (got ${JSON.stringify(metadataSchema)})`);
  }
  if (metadataVersion !== "1.2.0") {
    errors.push(`metadata.schema_version must be "1.2.0" (got ${JSON.stringify(metadataVersion)})`);
  }
  if (checkDeedRefExists && deedRef) {
    const full = resolve(repoRoot, deedRef);
    if (!existsSync(full)) {
      errors.push(`project.deed_ref "${deedRef}" does not exist at ${full}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    sections: seenSections,
    deedRef,
  };
}

if (import.meta.main || (process.argv[1] && process.argv[1].endsWith("validate-coordination-k9.js"))) {
  const target = process.argv[2] ?? "coordination.k9";
  const content = readFileSync(target, "utf8");
  const res = validateCoordinationK9(content, { checkDeedRefExists: true, repoRoot: "." });
  if (!res.ok) {
    for (const err of res.errors) {
      console.error(`FAIL ${target}: ${err}`);
    }
    process.exit(1);
  }
  console.log(`OK   ${target} (k9-coordination v1.2.0, ${res.sections.length} sections, deed_ref=${res.deedRef})`);
}
