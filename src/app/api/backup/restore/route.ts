import { createHash } from "node:crypto";
import { BackupStateChangedError, restoreBackupData } from "@/lib/backup-db";
import {
  BACKUP_MAX_FILE_BYTES,
  BACKUP_MAX_REQUEST_BYTES,
  backupError,
  backupHeaders,
  requireBackupAccess,
  requireBackupPassword,
  verifyBackupFlowToken,
  verifiedBackupFlowDigest,
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
  const { appPassword, passphrase, archive, inspectionToken, safetyToken, confirmation } = input as Record<string, unknown>;
  const passwordError = await requireBackupPassword(appPassword);
  if (passwordError) return passwordError;
  if (confirmation !== "VERVANG" || typeof passphrase !== "string" || Array.from(passphrase).length < 16 || Buffer.byteLength(passphrase) > 1024 || typeof archive !== "string" || Buffer.byteLength(archive) > BACKUP_MAX_FILE_BYTES) {
    return backupError("Ongeldige herstelbevestiging.", 400);
  }

  const bytes = Buffer.from(archive, "utf8");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const safetyDigest = verifiedBackupFlowDigest(safetyToken, "safety");
  if (!verifyBackupFlowToken(inspectionToken, "inspect", digest) || !safetyDigest) {
    return backupError("Controleer het bestand opnieuw en download eerst een veiligheidkopie.", 409);
  }

  let data;
  try {
    ({ data } = await openBackup(bytes, passphrase));
  } catch {
    return backupError("Back-upbestand of wachtzin ongeldig, of dit formaat wordt niet ondersteund.", 400);
  }

  try {
    await restoreBackupData(data, safetyDigest);
    return Response.json({
      ok: true,
      restored: {
        activities: data.activities.length,
        health_metrics: data.health_metrics.length,
        training_goals: data.training_goals.length,
      },
    }, { headers: backupHeaders });
  } catch (error) {
    if (error instanceof BackupStateChangedError) {
      return backupError("De huidige gegevens zijn sinds de veiligheidkopie veranderd. Download een nieuwe kopie en probeer opnieuw.", 409);
    }
    return backupError("Herstellen is mislukt. De databasewijziging is teruggedraaid.", 500);
  }
}
