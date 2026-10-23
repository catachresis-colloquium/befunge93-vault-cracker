// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { startVaultServer } from "../../server.js";

describe("HTTP Server Smoke, Security Headers & Launcher Lifecycle E2E (Categories 3, 6, 8)", () => {
  test("Bun HTTP server serves HTML, CSS, compiled Vue bundle, health JSON, and CSP headers", async () => {
    const srv = await startVaultServer({ hostname: "127.0.0.1", port: 0 });
    const base = `http://127.0.0.1:${srv.port}`;

    try {
      const rootRes = await fetch(`${base}/`);
      expect(rootRes.status).toBe(200);
      expect(rootRes.headers.get("content-type")).toContain("text/html");
      expect(rootRes.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(rootRes.headers.get("x-content-type-options")).toBe("nosniff");
      const html = await rootRes.text();
      expect(html).toContain('<div id="app"></div>');

      const jsRes = await fetch(`${base}/app.js`);
      expect(jsRes.status).toBe(200);
      expect(jsRes.headers.get("content-type")).toContain("text/javascript");
      const jsBody = await jsRes.text();
      expect(jsBody).toContain("Befunge-93 Vault Cracker");
      expect(jsBody).toContain("98261047");

      const cssRes = await fetch(`${base}/vault.css`);
      expect(cssRes.status).toBe(200);
      expect(await cssRes.text()).toContain(".bf-tempo");

      const healthRes = await fetch(`${base}/health`);
      expect(healthRes.status).toBe(200);
      expect(await healthRes.json()).toEqual({
        service: "befunge93-vault-cracker",
        status: "ok",
        ui: "vue3",
        runtime: "bun",
        maridCompanion: "local-bun-shim",
      });

      const secTxtRes = await fetch(`${base}/.well-known/security.txt`);
      expect(secTxtRes.status).toBe(200);
      expect(secTxtRes.headers.get("content-type")).toContain("text/plain");
      expect(await secTxtRes.text()).toContain("Contact:");

      const notFound = await fetch(`${base}/missing-route`);
      expect(notFound.status).toBe(404);

      const badMethod = await fetch(`${base}/`, { method: "POST" });
      expect(badMethod.status).toBe(405);
      expect(badMethod.headers.get("allow")).toBe("GET, HEAD");

      // Saturation: HEAD requests return 200 with empty bodies and strict CSP headers (no unsafe-inline)
      for (const route of ["/", "/app.js", "/vault.css", "/health", "/.well-known/security.txt"]) {
        const headRes = await fetch(`${base}${route}`, { method: "HEAD" });
        expect(headRes.status).toBe(200);
        const csp = headRes.headers.get("content-security-policy") ?? "";
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("style-src 'self'");
        expect(csp.includes("unsafe-inline")).toBe(false);
        expect(await headRes.text()).toBe("");
      }

      // Multi-level Marid verification: Level 3 self-modifying (g/p) grid verified by JS + Zig C-ABI
      const lvl3Res = await fetch(`${base}/api/vault/runs`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          levelId: "self-mod-cipher",
          passcode: "68025714",
          stagesCompleted: 20,
          attempts: 1,
          tempo: "brisk",
          callsign: "self-mod-tester",
        }),
      });
      expect(lvl3Res.status).toBe(200);
      const lvl3Body = await lvl3Res.json();
      expect(lvl3Body.accepted).toBe(true);
      expect(lvl3Body.run.levelId).toBe("self-mod-cipher");
    } finally {
      srv.stop(true);
    }
  });

  test("launcher.sh --help, --version, --start, --status, --stop, --integ, --disinteg lifecycle", () => {
    const xdgRoot = mkdtempSync(join(tmpdir(), "bf93-xdg-"));
    // Pick an ephemeral high port unlikely to collide
    const testPort = String(18400 + Math.floor(Math.random() * 1000));
    const env = {
      ...process.env,
      XDG_RUNTIME_DIR: join(xdgRoot, "run"),
      XDG_DATA_HOME: join(xdgRoot, "share"),
      PORT: testPort,
      HOST: "127.0.0.1",
      LAUNCHER_NO_OPEN: "1",
    };

    try {
      const helpOut = execFileSync("./launcher.sh", ["--help"], { env, encoding: "utf8" });
      expect(helpOut).toContain("launcher-standard 0.6.0");
      expect(helpOut).toContain("--start");

      const verOut = execFileSync("./launcher.sh", ["--version"], { env, encoding: "utf8" });
      expect(verOut).toContain("befunge93-vault-cracker-launcher 0.2.0");

      const startOut = execFileSync("./launcher.sh", ["--start"], { env, encoding: "utf8" });
      expect(startOut).toContain("started");

      const statusOut = execFileSync("./launcher.sh", ["--status"], { env, encoding: "utf8" });
      expect(statusOut).toContain("RUNNING");

      const integOut = execFileSync("./launcher.sh", ["--integ"], { env, encoding: "utf8" });
      expect(integOut).toContain(".desktop");
      const disintegOut = execFileSync("./launcher.sh", ["--disinteg"], { env, encoding: "utf8" });
      expect(disintegOut).toContain("Removed desktop entry");
    } finally {
      try {
        execFileSync("./launcher.sh", ["--stop"], { env, encoding: "utf8" });
      } catch {
        // ignore cleanup error
      }
      rmSync(xdgRoot, { recursive: true, force: true });
    }
  });
});
