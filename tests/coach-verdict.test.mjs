import test from "node:test";
import assert from "node:assert/strict";
import { goalVerdict, journalAction, loadVerdict, recoveryVerdict, runVerdict } from "../src/lib/coach-verdict.ts";

test("load judgment changes when a new week crosses the existing adjustment boundary", () => {
  assert.equal(loadVerdict(12, 24).tone, "good");
  assert.equal(loadVerdict(31, 31).tone, "critical");
  assert.match(loadVerdict(31, 31).action, /geen extra intensieve/);
  assert.equal(loadVerdict(null, 4).tone, "unknown");
});

test("stale or missing Health measurements cannot produce green advice", () => {
  assert.equal(recoveryVerdict(88, true).tone, "unknown");
  assert.equal(recoveryVerdict(null, false).tone, "unknown");
  assert.equal(recoveryVerdict(55, false).tone, "critical");
  assert.equal(recoveryVerdict(83, false).tone, "good");
});

test("goal and run decisions retain explicit action and uncertainty", () => {
  assert.equal(goalVerdict("basis opbouwen", 28).tone, "critical");
  assert.equal(goalVerdict("gericht voorbereiden", 28).tone, "good");
  assert.equal(runVerdict(null, "later").tone, "unknown");
  const digest = { tone: "watch", verdict: "Tempo viel terug", detail: "Tweede helft vertraagde." };
  const decision = runVerdict(digest, "Begin rustiger.");
  assert.equal(decision.tone, "critical");
  assert.equal(decision.action, "Begin rustiger.");
  assert.match(journalAction({ tone: "watch", hasSplits: true, pattern: "fade" }), /Begin je volgende/);
  assert.match(journalAction({ tone: "good", hasSplits: false, pattern: null }), /tempo waarop je nog kunt praten/);
});
