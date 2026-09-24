import assert from "node:assert/strict";
import test from "node:test";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { activities } from "../src/db/schema.ts";
import { preserveDetailedRaw } from "../src/lib/activity-raw.ts";

// Only builds SQL via toSQL(); no query is ever sent.
const db = drizzle(neon("postgresql://user:pass@localhost/db"));

function syncUpsertSql() {
  const values = { stravaId: "1", startDate: new Date("2026-01-01T00:00:00Z"), raw: { id: 1 } };
  return db
    .insert(activities)
    .values(values)
    .onConflictDoUpdate({ target: activities.stravaId, set: { ...values, raw: preserveDetailedRaw(activities.raw) } })
    .toSQL().sql;
}

test("sync upsert does not blindly overwrite raw with the summary activity", () => {
  const sql = syncUpsertSql();
  const rawSet = sql.slice(sql.indexOf('"raw" = CASE'));
  assert.ok(rawSet.startsWith('"raw" = CASE'), "raw must be set through the preserving CASE expression");
  assert.doesNotMatch(sql, /"raw" = \$\d+/, "raw must not be set to the plain summary parameter");
});

test("existing detail with splits_metric is merged, otherwise the summary wins", () => {
  const sql = syncUpsertSql();
  assert.match(sql, /"activities"\."raw" \? 'splits_metric'/);
  assert.match(sql, /THEN "activities"\."raw" \|\| excluded\.raw/);
  assert.match(sql, /ELSE excluded\.raw\s+END/);
  assert.match(sql, /jsonb_typeof\("activities"\."raw"\) = 'object'/);
});
