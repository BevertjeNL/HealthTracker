import test from "node:test";
import assert from "node:assert/strict";
import { backupFilename, buildBackup } from "../src/lib/backup.ts";

const now = new Date("2026-03-05T10:00:00Z");

test("backup bundles all tables with counts and no token table", () => {
  const backup = buildBackup({ activities: [{ id: 1 }, { id: 2 }], healthMetrics: [{ id: 1 }], trainingGoals: [] }, now);
  assert.equal(backup.format, "pulse-backup");
  assert.equal(backup.exportedAt, "2026-03-05T10:00:00.000Z");
  assert.deepEqual(backup.counts, { activities: 2, healthMetrics: 1, trainingGoals: 0 });
  assert.deepEqual(Object.keys(backup.tables), ["activities", "health_metrics", "training_goals"]);
});

test("backup filename carries the export date", () => {
  assert.equal(backupFilename(now), "pulse-backup-2026-03-05.json");
});
