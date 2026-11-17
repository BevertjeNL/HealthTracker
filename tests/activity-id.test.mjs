import assert from "node:assert/strict";
import test from "node:test";
import { parseActivityId } from "../src/lib/activity-id.ts";

test("accepts only canonical IDs inside the PostgreSQL serial range", () => {
  assert.equal(parseActivityId("1"), 1);
  assert.equal(parseActivityId("2147483647"), 2_147_483_647);
  for (const id of ["0", "01", "1e3", "2147483648", "999999999999", "-1"]) {
    assert.equal(parseActivityId(id), null, id);
  }
});
