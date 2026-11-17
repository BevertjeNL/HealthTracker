import assert from "node:assert/strict";
import test from "node:test";
import { stravaObjectId } from "../src/lib/strava-id.ts";

test("uses Strava's exact string ID when the numeric ID loses precision", () => {
  const activity = JSON.parse('{"id":9007199254740993,"id_str":"9007199254740993"}');
  assert.equal(stravaObjectId(activity), "9007199254740993");
  assert.notEqual(String(activity.id), activity.id_str);
});

test("accepts an older safe numeric ID", () => {
  assert.equal(stravaObjectId({ id: 123456789 }), "123456789");
});

test("rejects unsafe or invalid IDs before synchronization can reconcile rows", () => {
  assert.throws(() => stravaObjectId({ id: 9007199254740992 }), /no safe ID/);
  assert.throws(() => stravaObjectId({ id_str: "", id: 123 }), /invalid string ID/);
  assert.throws(() => stravaObjectId({ id_str: "123.0" }), /invalid string ID/);
});
