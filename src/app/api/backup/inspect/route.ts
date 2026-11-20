import { createHash } from "node:crypto";
import { readBackupCounts } from "@/lib/backup-db";
import {
  BACKUP_MAX_FILE_BYTES,
  BACKUP_MAX_REQUEST_BYTES,
  backupError,
  backupHeaders,
  requireBackupAccess,
  requireBackupPassword,
  signBackupFlowToken,
} from "@/lib/backup-http";
import { openBackup } from "@/lib/backup-format";
import { InvalidJsonBodyError, readJsonBodyWithLimit, RequestBodyTooLargeError } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const accessError = await requireBackupAccess(request);
  if (accessError) return accessError;

  let input: unknown;
  try {
    input = await readJsonBodyWithLimit(request, BACKUP_MAX_REQUEST_BYTES);
  } catch (error) {
    return error instanceof RequestBodyTooLargeError
      ? backupError("Bestand is te groot.", 413)
      : backupError("Ongeldige aanvraag.", error instanceof InvalidJsonBodyError ? 400 : 500);
  }
  if (!input || typeof input !== "object") return backupError("Ongeldige aanvraag.", 400);
  const { appPassword, passphrase, archive } = input as Record<string, unknown>;
  const passwordError = await requireBackupPassword(appPassword);
  if (passwordError) return passwordError;
  if (typeof passphrase !== "string" || typeof archive !== "string" || Buffer.byteLength(archive) > BACKUP_MAX_FILE_BYTES) {
    return backupError("Bestand of wachtzin ongeldig.", 400);
  }

  const bytes = Buffer.from(archive, "utf8");
  let backup;
  try {
    backup = await openBackup(bytes, passphrase);
  } catch {
    return backupError("Back-upbestand of wachtzin ongeldig, of dit formaat wordt niet ondersteund.", 400);
  }
  try {
    const current = await readBackupCounts();
    const digest = createHash("sha256").update(bytes).digest("hex");
    return Response.json({
      createdAt: backup.createdAt,
      archiveCounts: {
        activities: backup.data.activities.length,
        health_metrics: backup.data.health_metrics.length,
        training_goals: backup.data.training_goals.length,
      },
      currentCounts: current,
      inspectionToken: signBackupFlowToken("inspect", digest),
    }, { headers: backupHeaders });
  } catch {
    return backupError("De huidige gegevens konden niet worden gelezen. Probeer het later opnieuw.", 503);
  }
}
