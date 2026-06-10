import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeReviewer, parseReviewVerdict } from "../src/reviewer.js";
import { task } from "./helpers.js";

test("FakeReviewer approves by default and records review calls", async () => {
  const r = new FakeReviewer();
  const t1 = task("run1");
  const t2 = task("run1");

  const v1 = await r.review(t1, "/tmp/ws");
  const v2 = await r.review(t2, "/tmp/ws");

  assert.deepEqual(v1, { approved: true, notes: "ok" });
  assert.deepEqual(v2, { approved: true, notes: "ok" });
  assert.deepEqual(r.reviewed, [t1.id, t2.id]);
});

test("FakeReviewer rejects listed task ids with the configured note", async () => {
  const bad = task("run1");
  const good = task("run1");
  const r = new FakeReviewer({ reject: { [bad.id]: "missing null check in parser" } });

  const rejected = await r.review(bad, "/tmp/ws");
  const approved = await r.review(good, "/tmp/ws");

  assert.deepEqual(rejected, { approved: false, notes: "missing null check in parser" });
  assert.deepEqual(approved, { approved: true, notes: "ok" });
  assert.deepEqual(r.reviewed, [bad.id, good.id]);
});

test("parseReviewVerdict: APPROVE on the final line approves", () => {
  const v = parseReviewVerdict("The change looks correct and matches acceptance.\nVERDICT: APPROVE");
  assert.equal(v.approved, true);
});

test("parseReviewVerdict: APPROVE is case-insensitive", () => {
  const v = parseReviewVerdict("fine by me\nverdict: approve");
  assert.equal(v.approved, true);
});

test("parseReviewVerdict: REJECT carries the one-line reason as notes", () => {
  const v = parseReviewVerdict("Found a problem.\nVERDICT: REJECT: off-by-one in pagination loop");
  assert.equal(v.approved, false);
  assert.equal(v.notes, "off-by-one in pagination loop");
});

test("parseReviewVerdict: REJECT without a colon/reason still rejects", () => {
  const v = parseReviewVerdict("VERDICT: REJECT");
  assert.equal(v.approved, false);
  assert.ok(v.notes.length > 0, "notes should explain the rejection");
});

test("parseReviewVerdict: garbage reply is rejected as unparseable (never silently approve)", () => {
  const v = parseReviewVerdict("I am a teapot, short and stout.");
  assert.deepEqual(v, { approved: false, notes: "unparseable review reply" });
});

test("parseReviewVerdict: empty reply is rejected as unparseable", () => {
  const v = parseReviewVerdict("");
  assert.deepEqual(v, { approved: false, notes: "unparseable review reply" });
});

test("parseReviewVerdict: reply containing both verdicts fails safe to reject", () => {
  const v = parseReviewVerdict("VERDICT: APPROVE\nwait, actually\nVERDICT: REJECT: regression in auth flow");
  assert.equal(v.approved, false);
  assert.equal(v.notes, "regression in auth flow");
});
