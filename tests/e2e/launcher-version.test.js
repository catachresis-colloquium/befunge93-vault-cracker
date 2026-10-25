// SPDX-License-Identifier: MPL-2.0

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

describe("Launcher release-version regression", () => {
  for (const flag of ["--version", "-V"]) {
    test(`${flag} reports the exact package version from outside the checkout`, () => {
      const outside = mkdtempSync(join(tmpdir(), "bf93-version-"));
      try {
        // Invoke bash so this read-only check also works with launcher.sh's
        // tracked 0644 mode, without changing the checkout's permissions.
        const output = execFileSync("bash", [join(repoRoot, "launcher.sh"), flag], {
          cwd: outside,
          encoding: "utf8",
          timeout: 5_000,
          env: {
            ...process.env,
            XDG_RUNTIME_DIR: join(outside, "run"),
            XDG_STATE_HOME: join(outside, "state"),
            XDG_DATA_HOME: join(outside, "share"),
            LAUNCHER_NO_OPEN: "1",
          },
        });

        expect(output.trim().split("\n")).toHaveLength(1);
        const [name, version] = output.trim().split(/\s+/);
        expect(name).toBe(`${pkg.name}-launcher`);
        // Compare the complete token: a prefix check could accept 0.4.20 for
        // 0.4.2 or a prerelease when the manifest declares a stable release.
        expect(version).toBe(pkg.version);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  }
});
