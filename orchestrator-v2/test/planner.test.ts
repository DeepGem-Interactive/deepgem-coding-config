import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson, repairJsonControlChars } from "../src/planner.js";

test("extractJson: plain JSON object", () => {
  assert.deepEqual(extractJson(`{"tasks":[]}`), { tasks: [] });
});

test("extractJson: fenced JSON with prose around it", () => {
  const reply = "Here is the plan:\n```json\n{\"tasks\": [{\"key\": \"T1\"}]}\n```\nDone.";
  assert.deepEqual(extractJson(reply), { tasks: [{ key: "T1" }] });
});

test("extractJson: REPAIRS raw newlines inside string literals (the maiden-voyage crash)", () => {
  // A description string broken across lines — invalid JSON that the live
  // planner actually produced ("Unterminated string").
  const reply = `{
  "tasks": [
    {
      "key": "T1",
      "title": "parser",
      "description": "Build the parser
that handles fenced code blocks
and returns {text, done} items"
    }
  ]
}`;
  const parsed = extractJson(reply) as { tasks: Array<{ description: string }> };
  assert.match(parsed.tasks[0]!.description, /parser\nthat handles/);
});

test("repairJsonControlChars: escapes tabs and CRs in strings, leaves structure alone", () => {
  const bad = `{"a": "x\ty",\n  "b": "p\rq"}`;
  const fixed = repairJsonControlChars(bad);
  const parsed = JSON.parse(fixed) as { a: string; b: string };
  assert.equal(parsed.a, "x\ty");
  assert.equal(parsed.b, "p\rq");
});

test("repairJsonControlChars: does not touch escaped sequences or quotes", () => {
  const good = `{"a": "already\\nescaped \\"quoted\\""}`;
  assert.equal(JSON.parse(repairJsonControlChars(good)).a, 'already\nescaped "quoted"');
});

test("extractJson: garbage still throws", () => {
  assert.throws(() => extractJson("no json here at all"));
});
