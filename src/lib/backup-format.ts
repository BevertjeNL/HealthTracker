import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";

// Portable application data only. Credentials and transient login throttles are
// intentionally absent; Strava must be connected again after a restore.
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type ActivityBackupRow = {
  id: number;
  strava_id: string;
  name: string | null;
  type: string | null;
  start_date: string;
  distance_m: number | null;
  moving_time_s: number | null;
  elapsed_time_s: number | null;
  elevation_gain_m: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  avg_pace_min_per_km: number | null;
  avg_cadence: number | null;
  suffer_score: number | null;
  kind_override: "race" | "not_race" | "easy" | "long" | "interval" | null;
  raw: JsonValue;
  created_at: string;
};

export type HealthMetricBackupRow = {
  id: number;
  date: string;
  resting_heart_rate: number | null;
  hrv_ms: number | null;
  cardio_recovery_1m: number | null;
  walking_heart_rate_average: number | null;
  vo2_max: number | null;
  sleep_hours: number | null;
  sleep_score: number | null;
  steps: number | null;
  active_energy_kcal: number | null;
  weight_kg: number | null;
  oxygen_saturation_pct: number | null;
  respiratory_rate: number | null;
  exercise_minutes: number | null;
  daylight_minutes: number | null;
  walking_speed_kmh: number | null;
  walking_steadiness_pct: number | null;
  six_minute_walk_distance_m: number | null;
  running_power_w: number | null;
  running_stride_length_m: number | null;
  running_vertical_oscillation_cm: number | null;
  running_ground_contact_time_ms: number | null;
  raw: JsonValue;
  created_at: string;
};

export type TrainingGoalBackupRow = {
  id: number;
  distance_m: number;
  race_date: string;
  target_pace_sec_per_km: number;
  updated_at: string;
};

export type BackupData = {
  activities: ActivityBackupRow[];
  health_metrics: HealthMetricBackupRow[];
  training_goals: TrainingGoalBackupRow[];
};

export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_BYTES = 16 * 1024 * 1024;
export const MAX_BACKUP_JSON_BYTES = 32 * 1024 * 1024;
export const MAX_BACKUP_ROWS_PER_TABLE = 100_000;
export const MIN_BACKUP_PASSPHRASE_LENGTH = 16;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SCRYPT_OPTIONS = { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const;
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const KINDS = new Set(["race", "not_race", "easy", "long", "interval"]);
const HEALTH_NUMBER_FIELDS = [
  "resting_heart_rate", "hrv_ms", "cardio_recovery_1m", "walking_heart_rate_average",
  "vo2_max", "sleep_hours", "sleep_score", "steps", "active_energy_kcal", "weight_kg",
  "oxygen_saturation_pct", "respiratory_rate", "exercise_minutes", "daylight_minutes",
  "walking_speed_kmh", "walking_steadiness_pct", "six_minute_walk_distance_m", "running_power_w",
  "running_stride_length_m", "running_vertical_oscillation_cm", "running_ground_contact_time_ms",
] as const;
const ACTIVITY_NUMBER_FIELDS = [
  "distance_m", "elevation_gain_m", "avg_heart_rate", "max_heart_rate",
  "avg_pace_min_per_km", "avg_cadence", "suffer_score",
] as const;
const ACTIVITY_COLUMNS = [
  "id", "strava_id", "name", "type", "start_date", "distance_m", "moving_time_s",
  "elapsed_time_s", "elevation_gain_m", "avg_heart_rate", "max_heart_rate",
  "avg_pace_min_per_km", "avg_cadence", "suffer_score", "kind_override", "raw", "created_at",
] as const;
const HEALTH_COLUMNS = ["id", "date", ...HEALTH_NUMBER_FIELDS, "raw", "created_at"] as const;
const GOAL_COLUMNS = ["id", "distance_m", "race_date", "target_pace_sec_per_km", "updated_at"] as const;
const ISO_UTC = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?Z$/;

type BackupErrorCode = "INVALID_DATA" | "INVALID_PASSPHRASE" | "SIZE_LIMIT" | "INVALID_BACKUP";

export class BackupFormatError extends Error {
  readonly code: BackupErrorCode;

  constructor(code: BackupErrorCode) {
    super({
      INVALID_DATA: "Invalid backup data",
      INVALID_PASSPHRASE: "Passphrase must be at least 16 characters and at most 1024 bytes",
      SIZE_LIMIT: "Backup exceeds size limit",
      INVALID_BACKUP: "Invalid backup or passphrase",
    }[code]);
    this.name = "BackupFormatError";
    this.code = code;
  }
}

function invalidData(): never {
  throw new BackupFormatError("INVALID_DATA");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_UTC.exec(value);
  return match !== null && isDateOnly(match[1]) && Number(match[2]) <= 23 &&
    Number(match[3]) <= 59 && Number(match[4]) <= 59 && !Number.isNaN(Date.parse(value));
}

function isId(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= 2_147_483_647;
}

function isNullableNumber(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNullableInteger(value: unknown): boolean {
  return value === null || (Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 2_147_483_647);
}

function isJsonValue(value: unknown): value is JsonValue {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (++nodes > 1_000_000 || current.depth > 64) return false;
    const item = current.value;
    if (item === null || typeof item === "string" || typeof item === "boolean") continue;
    if (typeof item === "number") { if (!Number.isFinite(item)) return false; continue; }
    if (typeof item !== "object" || seen.has(item)) return false;
    seen.add(item);
    if (!Array.isArray(item) && !isRecord(item)) return false;
    for (const child of Object.values(item)) stack.push({ value: child, depth: current.depth + 1 });
  }
  return true;
}

function assertBackupData(value: unknown): asserts value is BackupData {
  if (!isRecord(value) || !hasExactKeys(value, ["activities", "health_metrics", "training_goals"])) invalidData();
  const activities = value.activities;
  const healthMetrics = value.health_metrics;
  const trainingGoals = value.training_goals;
  const activityIds = new Set<number>();
  const stravaIds = new Set<string>();
  const healthIds = new Set<number>();
  const healthDates = new Set<string>();
  const goalIds = new Set<number>();
  const goalDates = new Set<string>();

  if (!Array.isArray(activities) || activities.length > MAX_BACKUP_ROWS_PER_TABLE ||
    !Array.isArray(healthMetrics) || healthMetrics.length > MAX_BACKUP_ROWS_PER_TABLE ||
    !Array.isArray(trainingGoals) || trainingGoals.length > 20) invalidData();

  for (const row of activities) {
    if (!isRecord(row) || !hasExactKeys(row, ACTIVITY_COLUMNS) || !isId(row.id) ||
      typeof row.strava_id !== "string" || row.strava_id.length === 0 || row.strava_id.length > 128 ||
      row.strava_id.trim() !== row.strava_id ||
      (row.name !== null && typeof row.name !== "string") ||
      (row.type !== null && typeof row.type !== "string") ||
      !isUtcTimestamp(row.start_date) || !isUtcTimestamp(row.created_at) ||
      !isNullableInteger(row.moving_time_s) || !isNullableInteger(row.elapsed_time_s) ||
      !ACTIVITY_NUMBER_FIELDS.every((field) => isNullableNumber(row[field])) ||
      (row.kind_override !== null && (typeof row.kind_override !== "string" || !KINDS.has(row.kind_override))) ||
      !isJsonValue(row.raw) || activityIds.has(row.id) || stravaIds.has(row.strava_id)) invalidData();
    activityIds.add(row.id);
    stravaIds.add(row.strava_id);
  }

  for (const row of healthMetrics) {
    if (!isRecord(row) || !hasExactKeys(row, HEALTH_COLUMNS) || !isId(row.id) ||
      !isDateOnly(row.date) || !isUtcTimestamp(row.created_at) ||
      !HEALTH_NUMBER_FIELDS.every((field) => isNullableNumber(row[field])) ||
      !isJsonValue(row.raw) || healthIds.has(row.id) || healthDates.has(row.date)) invalidData();
    healthIds.add(row.id);
    healthDates.add(row.date);
  }

  for (const row of trainingGoals) {
    if (!isRecord(row) || !hasExactKeys(row, GOAL_COLUMNS) || !isId(row.id) || goalIds.has(row.id) ||
      !Number.isInteger(row.distance_m) || Number(row.distance_m) <= 0 || Number(row.distance_m) > 2_147_483_647 ||
      !isDateOnly(row.race_date) || goalDates.has(row.race_date) ||
      !Number.isInteger(row.target_pace_sec_per_km) || Number(row.target_pace_sec_per_km) <= 0 || Number(row.target_pace_sec_per_km) > 2_147_483_647 ||
      !isUtcTimestamp(row.updated_at)) invalidData();
    goalIds.add(row.id);
    goalDates.add(row.race_date);
  }
}

function validPassphrase(passphrase: unknown): passphrase is string {
  return typeof passphrase === "string" && Array.from(passphrase).length >= MIN_BACKUP_PASSPHRASE_LENGTH &&
    Buffer.byteLength(passphrase, "utf8") <= 1024;
}

function encodeBase64(value: Buffer): string { return value.toString("base64"); }

function decodeBase64(value: unknown, expectedLength?: number): Buffer | null {
  if (typeof value !== "string" || value.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64");
  return decoded.toString("base64") === value && (expectedLength === undefined || decoded.length === expectedLength)
    ? decoded : null;
}

function aad(salt: Buffer, iv: Buffer): Buffer {
  return Buffer.concat([Buffer.from([BACKUP_FORMAT_VERSION]), salt, iv]);
}

function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(passphrase, salt, 32, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error); else resolve(key as Buffer);
    });
  });
}

/** JSON UTF-8 archive containing only version and cryptographic parameters in the clear. */
export async function sealBackup(data: BackupData, passphrase: string): Promise<Uint8Array> {
  if (!validPassphrase(passphrase)) throw new BackupFormatError("INVALID_PASSPHRASE");
  assertBackupData(data);

  let plaintext: Buffer;
  try {
    plaintext = Buffer.from(JSON.stringify({ createdAt: new Date().toISOString(), data }), "utf8");
  } catch {
    return invalidData();
  }
  if (plaintext.length > MAX_BACKUP_JSON_BYTES) {
    plaintext.fill(0);
    throw new BackupFormatError("SIZE_LIMIT");
  }

  let compressed: Buffer | undefined;
  let key: Buffer | undefined;
  try {
    compressed = await gzipAsync(plaintext);
    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    key = await deriveKey(passphrase, salt);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aad(salt, iv));
    const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
    const archive = Buffer.from(JSON.stringify({
      version: BACKUP_FORMAT_VERSION,
      salt: encodeBase64(salt),
      iv: encodeBase64(iv),
      tag: encodeBase64(cipher.getAuthTag()),
      ciphertext: encodeBase64(ciphertext),
    }), "utf8");
    if (archive.length > MAX_BACKUP_BYTES) throw new BackupFormatError("SIZE_LIMIT");
    return archive;
  } finally {
    plaintext.fill(0);
    compressed?.fill(0);
    key?.fill(0);
  }
}

/** Every malformed, wrong-password or modified archive has the same safe error. */
export async function openBackup(bytes: Uint8Array, passphrase: string): Promise<{ createdAt: string; data: BackupData }> {
  const invalid = () => new BackupFormatError("INVALID_BACKUP");
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_BACKUP_BYTES || !validPassphrase(passphrase)) throw invalid();

  let key: Buffer | undefined;
  let compressed: Buffer | undefined;
  let plaintext: Buffer | undefined;
  try {
    const envelope: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!isRecord(envelope) || !hasExactKeys(envelope, ["version", "salt", "iv", "tag", "ciphertext"]) ||
      envelope.version !== BACKUP_FORMAT_VERSION) throw invalid();
    const salt = decodeBase64(envelope.salt, SALT_BYTES);
    const iv = decodeBase64(envelope.iv, IV_BYTES);
    const tag = decodeBase64(envelope.tag, TAG_BYTES);
    const ciphertext = decodeBase64(envelope.ciphertext);
    if (!salt || !iv || !tag || !ciphertext) throw invalid();

    key = await deriveKey(passphrase, salt);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad(salt, iv));
    decipher.setAuthTag(tag);
    compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    plaintext = await gunzipAsync(compressed, { maxOutputLength: MAX_BACKUP_JSON_BYTES });
    if (plaintext.length > MAX_BACKUP_JSON_BYTES) throw invalid();
    const payload: unknown = JSON.parse(plaintext.toString("utf8"));
    if (!isRecord(payload) || !hasExactKeys(payload, ["createdAt", "data"]) || !isUtcTimestamp(payload.createdAt)) throw invalid();
    assertBackupData(payload.data);
    return { createdAt: payload.createdAt, data: payload.data };
  } catch {
    throw invalid();
  } finally {
    key?.fill(0);
    compressed?.fill(0);
    plaintext?.fill(0);
  }
}
