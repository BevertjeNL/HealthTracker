// Pure backup envelope. Strava tokens are deliberately not part of a backup: they are credentials, and a restore
// re-links Strava through the normal OAuth flow.
export const BACKUP_FORMAT = "pulse-backup";
export const BACKUP_VERSION = 1;

export type BackupTables = {
  activities: unknown[];
  healthMetrics: unknown[];
  trainingGoals: unknown[];
};

export function buildBackup(tables: BackupTables, now: Date) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    counts: {
      activities: tables.activities.length,
      healthMetrics: tables.healthMetrics.length,
      trainingGoals: tables.trainingGoals.length,
    },
    tables: {
      activities: tables.activities,
      health_metrics: tables.healthMetrics,
      training_goals: tables.trainingGoals,
    },
  };
}

export function backupFilename(now: Date) {
  return `pulse-backup-${now.toISOString().slice(0, 10)}.json`;
}
