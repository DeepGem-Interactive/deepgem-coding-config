/**
 * Linear webhook intake.
 *
 * A tiny node:http server whose only job is to WAKE the engine — verdict
 * logic lives elsewhere. The webhook is a poke; the poller dedupes. We
 * therefore respond fast, verify the signature when a secret is configured,
 * and never let a handler exception take the server down.
 */
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

import { log } from "./logger.js";

export interface WebhookServer {
  port: number;
  close(): Promise<void>;
}

export interface WebhookOptions {
  port: number;
  secret?: string;
  path?: string;
  onEvent: (eventType: string) => void;
}

const DEFAULT_PATH = "/linear-webhook";

/** Compare two hex signature strings without leaking timing information. */
function signatureMatches(expectedHex: string, actualHeader: string): boolean {
  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(expectedHex, "hex");
    actual = Buffer.from(actualHeader, "hex");
  } catch {
    return false;
  }
  if (expected.length === 0 || actual.length !== expected.length) return false;
  return timingSafeEqual(expected, actual);
}

function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function startWebhookServer(opts: WebhookOptions): Promise<WebhookServer> {
  const path = opts.path ?? DEFAULT_PATH;

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // Strip any query string before matching the path.
    const reqPath = (req.url ?? "").split("?")[0];
    if (req.method !== "POST" || reqPath !== path) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }

    const raw = await readRawBody(req);

    if (opts.secret !== undefined) {
      const expected = createHmac("sha256", opts.secret).update(raw).digest("hex");
      const provided = req.headers["linear-signature"];
      const providedStr = Array.isArray(provided) ? provided[0] : provided;
      if (typeof providedStr !== "string" || !signatureMatches(expected, providedStr)) {
        log.warn("webhook: signature mismatch", { path });
        res.writeHead(401, { "content-type": "text/plain" });
        res.end("invalid signature");
        return;
      }
    }

    // Respond 200 quickly — Linear retries non-2xx, and the poller dedupes,
    // so even an unparseable body is acknowledged.
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");

    let eventType = "unknown";
    try {
      const body: unknown = JSON.parse(raw.toString("utf8"));
      if (
        typeof body === "object" &&
        body !== null &&
        "type" in body &&
        typeof (body as { type: unknown }).type === "string"
      ) {
        eventType = (body as { type: string }).type;
      }
    } catch {
      // Malformed JSON: already acked with 200; wake with "unknown".
    }

    try {
      opts.onEvent(eventType);
    } catch (err) {
      // onEvent is a poke, not a pipeline — never let it kill the server.
      log.error("webhook: onEvent threw", { error: String(err) });
    }
  };

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      log.error("webhook: handler error", { error: String(err) });
      try {
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "text/plain" });
        }
        res.end("internal error");
      } catch {
        // Socket already gone — nothing left to do.
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, () => {
      server.removeListener("error", reject);
      const address = server.address();
      const port =
        address !== null && typeof address === "object" ? address.port : opts.port;
      log.info("webhook: listening", { port, path });
      resolve({
        port,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((err) => (err ? rejectClose(err) : resolveClose()));
          }),
      });
    });
  });
}
