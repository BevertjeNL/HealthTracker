import assert from "node:assert/strict";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  BACKUP_FORMAT_VERSION,
  BackupFormatError,
  MAX_BACKUP_BYTES,
  MAX_BACKUP_JSON_BYTES,
  MAX_BACKUP_ROWS_PER_TABLE,
  openBackup,
  sealBackup,
} from "../src/lib/backup-format.ts";

const PASSPHRASE = "long synthetic test passphrase";

function sampleData() {
  return {
    activities: [{
      id: 3,
      strava_id: "1234567890123456789",
      name: "Synthetic morning run",
      type: "Run",
      start_date: "2026-11-17T06:45:00.000Z",
      distance_m: 5000.5,
      moving_time_s: 1800,
      elapsed_time_s: 1850,
      elevation_gain_m: 12.5,
      avg_heart_rate: 145,
      max_heart_rate: 164,
      avg_pace_min_per_km: 6,
      avg_cadence: 170,
      suffer_score: null,
      kind_override: "easy",
      raw: { splits_metric: [{ distance: 1000, elapsed_time: 360 }], _coach_detail_loaded: true },
      created_at: "2026-11-17T07:30:00.000Z",
    }],
    health_metrics: [{
      id: 7,
      date: "2026-11-17",
      resting_heart_rate: 52,
      hrv_ms: 55,
      cardio_recovery_1m: null,
      walking_heart_rate_average: null,
      vo2_max: null,
      sleep_hours: 7.5,
      sleep_score: null,
      steps: 0,
      active_energy_kcal: 0,
      weight_kg: null,
      oxygen_saturation_pct: null,
      respiratory_rate: null,
      exercise_minutes: null,
      daylight_minutes: null,
      walking_speed_kmh: null,
      walking_steadiness_pct: null,
      six_minute_walk_distance_m: null,
      running_power_w: null,
      running_stride_length_m: null,
      running_vertical_oscillation_cm: null,
      running_ground_contact_time_ms: null,
      raw: null,
      created_at: "2026-11-17T23:00:00.000Z",
    }],
    training_goals: [{
      id: 1,
      distance_m: 10000,
      race_date: "2026-10-01", // Historical goals must survive a restore.
      target_pace_sec_per_km: 320,
      updated_at: "2026-09-01T10:00:00.000Z",
    }],
  };
}

test("encrypted JSON archive round-trips every portable table and keeps private data inside ciphertext", async () => {
  const data = sampleData();
  const first = await sealBackup(data, PASSPHRASE);
  const second = await sealBackup(data, PASSPHRASE);
  const archiveText = new TextDecoder().decode(first);
  const envelope = JSON.parse(archiveText);

  assert.deepEqual(Object.keys(envelope).sort(), ["ciphertext", "iv", "salt", "tag", "version"]);
  assert.equal(envelope.version, BACKUP_FORMAT_VERSION);
  assert.equal(archiveText.includes("Synthetic morning run"), false);
  assert.equal(archiveText.includes("createdAt"), false);
  assert.notDeepEqual(first, second); // Random salt and IV on each seal.

  const restored = await openBackup(first, PASSPHRASE);
  assert.match(restored.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(restored.data, data);
});

test("wrong passphrase, tampering and unsupported version fail with the same safe error", async () => {
  const archive = await sealBackup(sampleData(), PASSPHRASE);
  const expected = (error) => error instanceof BackupFormatError && error.code === "INVALID_BACKUP" &&
    error.message === "Invalid backup or passphrase";

  await assert.rejects(openBackup(archive, "a different long passphrase"), expected);

  const tampered = JSON.parse(new TextDecoder().decode(archive));
  tampered.ciphertext = `${tampered.ciphertext[0] === "A" ? "B" : "A"}${tampered.ciphertext.slice(1)}`;
  await assert.rejects(openBackup(new TextEncoder().encode(JSON.stringify(tampered)), PASSPHRASE), expected);

  tampered.version = 2;
  await assert.rejects(openBackup(new TextEncoder().encode(JSON.stringify(tampered)), PASSPHRASE), expected);
});

test("archive and expanded-size limits reject oversized input before decryption", async () => {
  await assert.rejects(openBackup(new Uint8Array(MAX_BACKUP_BYTES + 1), PASSPHRASE),
    (error) => error instanceof BackupFormatError && error.code === "INVALID_BACKUP");

  const tooLarge = sampleData();
  tooLarge.activities[0].name = "x".repeat(MAX_BACKUP_JSON_BYTES);
  await assert.rejects(sealBackup(tooLarge, PASSPHRASE),
    (error) => error instanceof BackupFormatError && error.code === "SIZE_LIMIT");
});

test("authenticated compressed input cannot expand beyond the plaintext limit", async () => {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(PASSPHRASE, salt, 32, { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.concat([Buffer.from([BACKUP_FORMAT_VERSION]), salt, iv]));
  const compressed = gzipSync(Buffer.alloc(MAX_BACKUP_JSON_BYTES + 1, 0x61));
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const archive = new TextEncoder().encode(JSON.stringify({
    version: BACKUP_FORMAT_VERSION,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  }));
  key.fill(0);
  await assert.rejects(openBackup(archive, PASSPHRASE),
    (error) => error instanceof BackupFormatError && error.code === "INVALID_BACKUP");
});

test("schema, identity and passphrase validation rejects unsafe backups", async () => {
  const badPassphrase = sealBackup(sampleData(), "short");
  await assert.rejects(badPassphrase,
    (error) => error instanceof BackupFormatError && error.code === "INVALID_PASSPHRASE");

  const cases = [];
  const withToken = sampleData();
  withToken.strava_tokens = [];
  cases.push(withToken);
  const missingField = sampleData();
  delete missingField.health_metrics[0].weight_kg;
  cases.push(missingField);
  const shiftedDate = sampleData();
  shiftedDate.health_metrics[0].date = new Date("2026-11-17T00:00:00Z");
  cases.push(shiftedDate);
  const invalidDate = sampleData();
  invalidDate.health_metrics[0].date = "2026-02-30";
  cases.push(invalidDate);
  const duplicateActivity = sampleData();
  duplicateActivity.activities.push({ ...duplicateActivity.activities[0], id: 4 });
  cases.push(duplicateActivity);
  const nonFinite = sampleData();
  nonFinite.health_metrics[0].hrv_ms = Number.NaN;
  cases.push(nonFinite);
  const tooManyRows = sampleData();
  tooManyRows.activities = Array(MAX_BACKUP_ROWS_PER_TABLE + 1).fill(tooManyRows.activities[0]);
  cases.push(tooManyRows);

  for (const data of cases) {
    await assert.rejects(sealBackup(data, PASSPHRASE),
      (error) => error instanceof BackupFormatError && error.code === "INVALID_DATA");
  }
});
