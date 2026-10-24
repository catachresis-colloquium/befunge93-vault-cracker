# SPDX-License-Identifier: MPL-2.0
# Sealed OCI Containerfile for befunge93-vault-cracker (Podman / Svalinn compatible)
# Multi-stage build: compiles both the native Zig C-ABI oracle library and the Vue 3 + Bun bundle.

FROM docker.io/alpine:3.21 AS zig-builder
RUN apk add --no-cache zig musl-dev
WORKDIR /app/ffi/zig
COPY ffi/zig ./
RUN zig build -Doptimize=ReleaseSafe --cache-dir /tmp/zig-cache -p /app/_build/ffi

FROM docker.io/oven/bun:1.4.2-slim AS web-builder
WORKDIR /app
COPY package.json bun.lock bunfig.toml index.html server.js ./
COPY .well-known ./.well-known
COPY scripts ./scripts
COPY src ./src
RUN bun install --frozen-lockfile && bun run build

FROM docker.io/oven/bun:1.4.2-slim AS runtime
WORKDIR /app

ENV HOST=0.0.0.0
ENV PORT=8000

COPY --from=web-builder /app/package.json /app/bun.lock /app/bunfig.toml /app/index.html /app/server.js ./
COPY --from=web-builder /app/.well-known ./.well-known
COPY --from=web-builder /app/node_modules ./node_modules
COPY --from=web-builder /app/scripts ./scripts
COPY --from=web-builder /app/src ./src
COPY --from=web-builder /app/dist ./dist
COPY --from=zig-builder /app/_build/ffi ./_build/ffi

USER bun
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["bun", "-e", "const r = await fetch('http://127.0.0.1:8000/health'); if (!r.ok) process.exit(1);"]

CMD ["bun", "run", "server.js"]
