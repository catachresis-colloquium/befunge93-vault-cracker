// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Native Bun HTTP server for Befunge-93 Vault Cracker.
 * Binds to 0.0.0.0:8000 by default (configurable via HOST / PORT), compiles the
 * Vue 3 SFC bundle in-memory on startup, and exposes `/health` for smoke/doctor checks.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { compileClientJavaScript } from "./scripts/build.js";
import { createMaridTrialRouter } from "./src/marid/local-trial-backend.js";

const rootDir = import.meta.dir;
let cachedAppJsPromise = null;

function latestMtimeMs(targetPath) {
  const st = statSync(targetPath);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = st.mtimeMs;
  for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
    const childMax = latestMtimeMs(resolve(targetPath, entry.name));
    if (childMax > newest) newest = childMax;
  }
  return newest;
}

function isPrebuiltBundleFresh(prebuiltPath) {
  if (!existsSync(prebuiltPath)) return false;
  const bundleMtime = statSync(prebuiltPath).mtimeMs;
  const inputs = [
    resolve(rootDir, "index.html"),
    resolve(rootDir, "scripts/build.js"),
    resolve(rootDir, "scripts/vue-sfc-plugin.js"),
    resolve(rootDir, "src"),
  ];
  return inputs.every((p) => latestMtimeMs(p) <= bundleMtime);
}

const SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'",
});

export async function startVaultServer(options = {}) {
  const hostname = options.hostname ?? process.env.HOST ?? "0.0.0.0";
  const port = Number(options.port ?? process.env.PORT ?? 8000);
  const maridUpstreamUrl =
    options.maridUpstreamUrl ?? process.env.MARID_UPSTREAM_URL ?? "";

  const html = readFileSync(resolve(rootDir, "index.html"), "utf8");
  const css = readFileSync(resolve(rootDir, "src/styles/vault.css"), "utf8");
  const securityTxt = readFileSync(resolve(rootDir, ".well-known/security.txt"), "utf8");
  const prebuiltAppJs = resolve(rootDir, "dist/app.js");

  let appJs;
  if (!options.recompile && isPrebuiltBundleFresh(prebuiltAppJs)) {
    appJs = readFileSync(prebuiltAppJs, "utf8");
  } else {
    if (!cachedAppJsPromise || options.recompile) {
      cachedAppJsPromise = compileClientJavaScript({ minify: true });
    }
    appJs = await cachedAppJsPromise;
  }

  const maridRouter = createMaridTrialRouter({
    upstreamUrl: maridUpstreamUrl,
    securityHeaders: SECURITY_HEADERS,
    maxRuns: options.maxRuns,
    maxBufferedEvents: options.maxBufferedEvents,
    fetchImpl: options.fetchImpl,
  });

  const server = Bun.serve({
    hostname,
    port,
    idleTimeout: 120,
    async fetch(req) {
      const url = new URL(req.url);

      const maridResponse = await maridRouter.handle(req, url);
      if (maridResponse !== null) {
        return maridResponse;
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { ...SECURITY_HEADERS, Allow: "GET, HEAD" },
        });
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(req.method === "HEAD" ? null : html, {
          status: 200,
          headers: {
            ...SECURITY_HEADERS,
            "Content-Type": "text/html; charset=utf-8",
          },
        });
      }

      if (url.pathname === "/vault.css") {
        return new Response(req.method === "HEAD" ? null : css, {
          status: 200,
          headers: {
            ...SECURITY_HEADERS,
            "Content-Type": "text/css; charset=utf-8",
          },
        });
      }

      if (url.pathname === "/app.js") {
        return new Response(req.method === "HEAD" ? null : appJs, {
          status: 200,
          headers: {
            ...SECURITY_HEADERS,
            "Content-Type": "text/javascript; charset=utf-8",
          },
        });
      }

      if (url.pathname === "/.well-known/security.txt") {
        return new Response(req.method === "HEAD" ? null : securityTxt, {
          status: 200,
          headers: {
            ...SECURITY_HEADERS,
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      }

      if (url.pathname === "/health") {
        const body = JSON.stringify({
          service: "befunge93-vault-cracker",
          status: "ok",
          ui: "vue3",
          runtime: "bun",
          maridCompanion: maridUpstreamUrl ? "upstream-proxy" : "local-bun-shim",
        });
        return new Response(req.method === "HEAD" ? null : body, {
          status: 200,
          headers: {
            ...SECURITY_HEADERS,
            "Content-Type": "application/json; charset=utf-8",
          },
        });
      }

      return new Response("Not Found", {
        status: 404,
        headers: {
          ...SECURITY_HEADERS,
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    },
  });

  const origStop = server.stop.bind(server);
  server.stop = (closeActiveConnections = false) => {
    maridRouter.closeAllStreams();
    return origStop(closeActiveConnections);
  };
  server.maridRouter = maridRouter;

  return server;
}

if (import.meta.main) {
  const srv = await startVaultServer();
  console.log(`Befunge-93 Vault Cracker listening on http://${srv.hostname}:${srv.port}`);
}
