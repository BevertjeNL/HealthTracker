import { readBackupData } from "@/lib/backup-db";
import {
  BACKUP_MAX_FILE_BYTES,
  backupError,
  backupHeaders,
  requireBackupAccess,
  requireBackupPassword,
  signBackupFlowToken,
} from "@/lib/backup-http";
import { BackupFormatError, sealBackup } from "@/lib/backup-format";
import { InvalidJsonBodyError, readJsonBodyWithLimit, RequestBodyTooLargeError } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const accessError = await requireBackupAccess(request);
  if (accessError) return accessError;

  let input: unknown;
  try {
    input = await readJsonBodyWithLimit(request, 4096);
  } catch (error) {
    return error instanceof RequestBodyTooLargeError
      ? backupError("Aanvraag is te groot.", 413)
      : backupError("Ongeldige aanvraag.", error instanceof InvalidJsonBodyError ? 400 : 500);
  }
  if (!input || typeof input !== "object") return backupError("Ongeldige aanvraag.", 400);
  const { appPassword, passphrase } = input as Record<string, unknown>;
  const passwordError = await requireBackupPassword(appPassword);
  if (passwordError) return passwordError;
  if (typeof passphrase !== "string" || Array.from(passphrase).length < 16 || Buffer.byteLength(passphrase) > 1024 || passphrase === appPassword) {
    return backupError("Kies een aparte back-upwachtzin van minstens 16 tekens.", 400);
  }

  try {
    const { data, snapshotDigest } = await readBackupData();
    const archive = await sealBackup(data, passphrase);
    if (archive.byteLength > BACKUP_MAX_FILE_BYTES) {
      return backupError("De gegevens passen niet meer in één download. Neem contact op voor een grotere export.", 413);
    }
    const date = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(archive).buffer, {
      headers: {
        ...backupHeaders,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="pulse-gegevens-${date}.pulsebackup"`,
        "X-Backup-Safety-Token": signBackupFlowToken("safety", snapshotDigest),
      },
    });
  } catch (error) {
    if (error instanceof BackupFormatError && error.code === "SIZE_LIMIT") {
      return backupError("De gegevens passen niet meer in één download. Neem contact op voor een grotere export.", 413);
    }
    return backupError("Back-up maken is mislukt. Probeer het later opnieuw.", 500);
  }
}
