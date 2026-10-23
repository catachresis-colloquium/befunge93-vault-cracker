// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 Jonathan D.A. Jewell (hyperpolymath) <j.d.a.jewell@open.ac.uk>

/**
 * Drop-in wire-compatible client matching `@metadatastician/marid-client` (`web/client/src/index.js`).
 *
 * Why this seam exists:
 * - Speaks Marid's exact wire conventions today (JSON + `Accept: application/json, application/problem+json`,
 *   RFC 9457 Problem Details error classes, and SSE `/events?topic=<t>&last_event_id=<seq>` with
 *   `marid.sync.resync_required` recovery) without pulling unpublished external workspace packages
 *   or forcing architectural lock-in on either repository.
 * - Uses relative paths (`/api/...`) by default so browser requests work identically against the
 *   built-in Bun shim, a reverse-proxied Julia `Marid` upstream (`MARID_UPSTREAM_URL`), or Arena previews.
 */

export class MaridError extends Error {
  constructor(message, status = 500, details = {}) {
    super(message);
    this.name = "MaridError";
    this.status = status;
    this.details = details;
  }

  static fromProblemDetails(pd = {}, fallbackStatus = 500) {
    const status = typeof pd.status === "number" ? pd.status : fallbackStatus;
    const msg = pd.detail || pd.title || "Marid API Error";
    if (status === 404) return new NotFoundError(msg, pd);
    if (status === 400 || status === 422) return new ValidationError(msg, status, pd);
    if (status === 409) return new ConflictError(msg, pd);
    if (status === 401 || status === 403) return new UnauthorizedError(msg, status, pd);
    if (status === 504 || status === 408) return new TimeoutError(msg, status, pd);
    return new MaridError(msg, status, pd);
  }
}

export class NotFoundError extends MaridError {
  constructor(message, details = {}) {
    super(message, 404, details);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends MaridError {
  constructor(message, status = 400, details = {}) {
    super(message, status, details);
    this.name = "ValidationError";
  }
}

export class ConflictError extends MaridError {
  constructor(message, details = {}) {
    super(message, 409, details);
    this.name = "ConflictError";
  }
}

export class UnauthorizedError extends MaridError {
  constructor(message, status = 401, details = {}) {
    super(message, status, details);
    this.name = "UnauthorizedError";
  }
}

export class TimeoutError extends MaridError {
  constructor(message, status = 504, details = {}) {
    super(message, status, details);
    this.name = "TimeoutError";
  }
}

export function stripTrailingSlashes(s) {
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 47) end -= 1;
  return s.slice(0, end);
}

export class MaridWireClient {
  constructor(config = {}) {
    this.baseUrl = stripTrailingSlashes(config.baseUrl || "");
    this.eventsPath = config.eventsPath || "/api/marid/events";
    this.fetchImpl =
      config.fetch || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    this.headers = config.headers || {};
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 8000;
    this.lastSequenceByTopic = new Map();
  }

  resolveUrl(path) {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}${normalizedPath}`;
  }

  async fetchJson(path, options = {}) {
    if (!this.fetchImpl) {
      throw new MaridError("No fetch implementation available", 503);
    }

    const url = this.resolveUrl(path);
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    let timeoutId = null;

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort(options.signal.reason);
      } else {
        options.signal.addEventListener("abort", () => controller.abort(options.signal.reason), {
          once: true,
        });
      }
    }

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        controller.abort(new TimeoutError(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    try {
      const headers = {
        Accept: "application/json, application/problem+json",
        ...this.headers,
        ...(options.headers || {}),
      };

      let body;
      if (options.body !== undefined) {
        if (typeof options.body === "string") {
          body = options.body;
        } else {
          headers["Content-Type"] = headers["Content-Type"] || "application/json";
          body = JSON.stringify(options.body);
        }
      }

      const res = await this.fetchImpl(url, {
        method: options.method || "GET",
        headers,
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        const rawText = await res.text().catch(() => "");
        let errBody = null;
        if (rawText) {
          try {
            errBody = JSON.parse(rawText);
          } catch {
            errBody = { title: res.statusText || "HTTP Error", status: res.status, detail: rawText };
          }
        } else {
          errBody = { title: res.statusText || "HTTP Error", status: res.status };
        }
        throw MaridError.fromProblemDetails(errBody, res.status);
      }

      if (res.status === 204) return null;
      return await res.json();
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  }

  subscribe(topic, callbacks = {}, options = {}) {
    if (!this.fetchImpl) {
      throw new MaridError("No fetch implementation available for SSE", 503);
    }

    let closed = false;
    let reconnectTimer = null;
    let abortController = new AbortController();
    const { onOpen, onEvent, onError, onResyncRequired } = callbacks;
    const autoReconnect = options.autoReconnect ?? false;
    const reconnectIntervalMs = options.reconnectIntervalMs ?? 1500;
    let lastSeq =
      options.lastEventId !== undefined
        ? Number(options.lastEventId)
        : (this.lastSequenceByTopic.get(topic) ?? 0);

    const connect = async () => {
      if (closed) return;
      abortController = new AbortController();
      const query = `topic=${encodeURIComponent(topic)}&last_event_id=${encodeURIComponent(String(lastSeq))}`;
      const url = this.resolveUrl(`${this.eventsPath}?${query}`);

      try {
        const response = await this.fetchImpl(url, {
          headers: {
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            ...this.headers,
          },
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          throw new MaridError(`SSE HTTP error: ${response.status}`, response.status);
        }

        onOpen?.();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            if (!block.trim() || block.startsWith(":")) continue;
            let eventType = "message";
            let eventId = null;
            const dataLines = [];

            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("id:")) {
                eventId = line.slice(3).trim();
              } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trimStart());
              }
            }

            if (dataLines.length === 0) continue;
            const parsed = JSON.parse(dataLines.join("\n"));
            const seqCandidate =
              typeof parsed.sequence === "number"
                ? parsed.sequence
                : eventId !== null && /^\d+$/.test(eventId)
                  ? Number(eventId)
                  : null;
            if (seqCandidate !== null) {
              lastSeq = seqCandidate;
              this.lastSequenceByTopic.set(topic, lastSeq);
            }

            if (parsed.type === "marid.sync.resync_required" || eventType === "resync_required") {
              onResyncRequired?.(parsed);
            } else {
              onEvent?.(parsed);
            }
          }
        }
      } catch (err) {
        if (!closed) {
          onError?.(err);
          if (autoReconnect) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              if (!closed) connect();
            }, reconnectIntervalMs);
          }
        }
      }
    };

    connect();

    const close = () => {
      closed = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      abortController.abort();
    };

    return {
      topic,
      get isClosed() {
        return closed;
      },
      unsubscribe: close,
      cancel: close,
    };
  }
}
