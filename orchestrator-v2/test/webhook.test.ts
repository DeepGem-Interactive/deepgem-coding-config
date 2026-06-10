import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { startWebhookServer } from "../src/webhook.js";
import type { WebhookServer } from "../src/webhook.js";

const SECRET = "test-webhook-secret";

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function url(server: WebhookServer, path = "/linear-webhook"): string {
  return `http://127.0.0.1:${server.port}${path}`;
}

test("valid signed POST -> 200 and onEvent called with body.type", async () => {
  const events: string[] = [];
  const server = await startWebhookServer({
    port: 0,
    secret: SECRET,
    onEvent: (eventType) => events.push(eventType),
  });
  try {
    const body = JSON.stringify({ type: "Comment", action: "create" });
    const res = await fetch(url(server), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "linear-signature": sign(body, SECRET),
      },
      body,
    });
    assert.equal(res.status, 200);
    await delay(20); // onEvent fires after the response is flushed
    assert.deepEqual(events, ["Comment"]);
  } finally {
    await server.close();
  }
});

test("bad signature -> 401 and onEvent NOT called", async () => {
  const events: string[] = [];
  const server = await startWebhookServer({
    port: 0,
    secret: SECRET,
    onEvent: (eventType) => events.push(eventType),
  });
  try {
    const body = JSON.stringify({ type: "Issue" });
    const res = await fetch(url(server), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "linear-signature": sign(body, "wrong-secret"),
      },
      body,
    });
    assert.equal(res.status, 401);
    await delay(20);
    assert.deepEqual(events, []);
  } finally {
    await server.close();
  }
});

test("missing signature header with secret configured -> 401", async () => {
  const events: string[] = [];
  const server = await startWebhookServer({
    port: 0,
    secret: SECRET,
    onEvent: (eventType) => events.push(eventType),
  });
  try {
    const res = await fetch(url(server), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "Issue" }),
    });
    assert.equal(res.status, 401);
    await delay(20);
    assert.deepEqual(events, []);
  } finally {
    await server.close();
  }
});

test("no secret configured -> unsigned POST accepted", async () => {
  const events: string[] = [];
  const server = await startWebhookServer({
    port: 0,
    onEvent: (eventType) => events.push(eventType),
  });
  try {
    const res = await fetch(url(server), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "IssueLabel" }),
    });
    assert.equal(res.status, 200);
    await delay(20);
    assert.deepEqual(events, ["IssueLabel"]);
  } finally {
    await server.close();
  }
});

test("GET -> 404", async () => {
  const events: string[] = [];
  const server = await startWebhookServer({
    port: 0,
    onEvent: (eventType) => events.push(eventType),
  });
  try {
    const res = await fetch(url(server), { method: "GET" });
    assert.equal(res.status, 404);
    await delay(20);
    assert.deepEqual(events, []);
  } finally {
    await server.close();
  }
});

test("POST to wrong path -> 404", async () => {
  const events: string[] = [];
  const server = await startWebhookServer({
    port: 0,
    onEvent: (eventType) => events.push(eventType),
  });
  try {
    const res = await fetch(url(server, "/other-path"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "Issue" }),
    });
    assert.equal(res.status, 404);
    await delay(20);
    assert.deepEqual(events, []);
  } finally {
    await server.close();
  }
});

test("malformed JSON body -> 200 and onEvent('unknown')", async () => {
  const events: string[] = [];
  const server = await startWebhookServer({
    port: 0,
    onEvent: (eventType) => events.push(eventType),
  });
  try {
    const res = await fetch(url(server), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json!!",
    });
    assert.equal(res.status, 200);
    await delay(20);
    assert.deepEqual(events, ["unknown"]);
  } finally {
    await server.close();
  }
});

test("JSON body without a string type -> onEvent('unknown')", async () => {
  const events: string[] = [];
  const server = await startWebhookServer({
    port: 0,
    onEvent: (eventType) => events.push(eventType),
  });
  try {
    const res = await fetch(url(server), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create" }),
    });
    assert.equal(res.status, 200);
    await delay(20);
    assert.deepEqual(events, ["unknown"]);
  } finally {
    await server.close();
  }
});

test("custom path option is honored", async () => {
  const events: string[] = [];
  const server = await startWebhookServer({
    port: 0,
    path: "/hooks/linear",
    onEvent: (eventType) => events.push(eventType),
  });
  try {
    const ok = await fetch(url(server, "/hooks/linear"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "Issue" }),
    });
    assert.equal(ok.status, 200);

    const missed = await fetch(url(server), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "Issue" }),
    });
    assert.equal(missed.status, 404);

    await delay(20);
    assert.deepEqual(events, ["Issue"]);
  } finally {
    await server.close();
  }
});

test("onEvent throwing does not kill the server", async () => {
  let calls = 0;
  const server = await startWebhookServer({
    port: 0,
    onEvent: () => {
      calls += 1;
      throw new Error("listener exploded");
    },
  });
  try {
    const first = await fetch(url(server), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "Issue" }),
    });
    assert.equal(first.status, 200);

    const second = await fetch(url(server), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "Comment" }),
    });
    assert.equal(second.status, 200);

    await delay(20);
    assert.equal(calls, 2);
  } finally {
    await server.close();
  }
});
