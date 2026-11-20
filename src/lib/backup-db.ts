import { neon } from "@neondatabase/serverless";
import type { BackupData } from "@/lib/backup-format";
import { BACKUP_READ_SQL, restoreQueries } from "@/lib/backup-sql";

function connection() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Database is not configured");
  return neon(url);
}

/** One PostgreSQL statement gives all three tables and its digest the same MVCC snapshot. */
export async function readBackupData(): Promise<{ data: BackupData; snapshotDigest: string }> {
  const sql = connection();
  const [result] = await sql.query(BACKUP_READ_SQL);
  if (!result?.data || typeof result.snapshot_digest !== "string") {
    throw new Error("Could not read backup data");
  }
  return { data: result.data as BackupData, snapshotDigest: result.snapshot_digest };
}

export type BackupCounts = { activities: number; health_metrics: number; training_goals: number };

export async function readBackupCounts(): Promise<BackupCounts> {
  const sql = connection();
  const [result] = await sql`
    SELECT
      (SELECT count(*)::int FROM activities) AS activities,
      (SELECT count(*)::int FROM health_metrics) AS health_metrics,
      (SELECT count(*)::int FROM training_goals) AS training_goals
  `;
  return result as BackupCounts;
}

export class BackupStateChangedError extends Error {
  constructor() {
    super("Database changed since the safety backup");
    this.name = "BackupStateChangedError";
  }
}

/** Replace only durable app data. PostgreSQL rolls back every table if any insert fails. */
export async function restoreBackupData(data: BackupData, expectedSnapshotDigest: string): Promise<void> {
  const sql = connection();
  const queries = restoreQueries(data, expectedSnapshotDigest).map(({ text, params }) => sql.query(text, params));
  try {
    // READ COMMITTED takes a fresh snapshot for the guard after the table locks
    // have been acquired. Earlier snapshots could miss writes that committed
    // while the lock statement was waiting.
    await sql.transaction(queries, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "22012") {
      throw new BackupStateChangedError();
    }
    throw error;
  }
}
