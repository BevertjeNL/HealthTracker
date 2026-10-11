import assert from "node:assert/strict";
import test from "node:test";
import { parseWeightCorrection } from "../src/lib/weight-correction.ts";

test("weight correction accepts a valid replacement or removal", () => {
  assert.deepEqual(parseWeightCorrection("2026-10-12", "save", "70,25"), { date: "2026-10-12", weightKg: 70.25 });
  assert.deepEqual(parseWeightCorrection("2026-10-12", "remove", ""), { date: "2026-10-12", weightKg: null });
});

test("weight correction rejects invalid dates, operations, and values", () => {
  assert.equal(parseWeightCorrection("2026-02-30", "remove", ""), null);
  assert.equal(parseWeightCorrection("2026-10-12", "save", ""), null);
  assert.equal(parseWeightCorrection("2026-10-12", "save", "19"), null);
  assert.equal(parseWeightCorrection("2026-10-12", "save", "70.123"), null);
  assert.equal(parseWeightCorrection("2026-10-12", "other", "70"), null);
});
