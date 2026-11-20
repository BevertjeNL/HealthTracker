"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Counts = { activities: number; health_metrics: number; training_goals: number };
type Preview = { createdAt: string; archiveCounts: Counts; currentCounts: Counts; inspectionToken: string };
type Message = { text: string; error: boolean } | null;
type Busy = "export" | "inspect" | "safety" | "restore" | null;

const MAX_FILE_BYTES = 3_500_000;

async function responseError(response: Response): Promise<string> {
  try {
    const result = await response.json() as { error?: unknown };
    if (typeof result.error === "string") return result.error;
  } catch { /* The generic error below is safe to show. */ }
  return "De aanvraag is mislukt. Probeer het opnieuw.";
}

async function postBackup(path: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function downloadEncryptedBackup(appPassword: string, passphrase: string, prefix: string): Promise<string> {
  const response = await postBackup("/api/backup/export", { appPassword, passphrase });
  if (!response.ok) throw new Error(await responseError(response));
  const safetyToken = response.headers.get("x-backup-safety-token");
  if (!safetyToken) throw new Error("De download kon niet worden bevestigd.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.pulsebackup`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return safetyToken;
}

function CountRows({ counts }: { counts: Counts }) {
  return <dl className="b-counts">
    <div><dt>Runs</dt><dd>{counts.activities}</dd></div>
    <div><dt>Health-dagen</dt><dd>{counts.health_metrics}</dd></div>
    <div><dt>Wedstrijddoelen</dt><dd>{counts.training_goals}</dd></div>
  </dl>;
}

export function BackupManager() {
  const router = useRouter();
  const previewRef = useRef<HTMLHeadingElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [exportAppPassword, setExportAppPassword] = useState("");
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [exportRepeat, setExportRepeat] = useState("");
  const [exportMessage, setExportMessage] = useState<Message>(null);
  const [restoreAppPassword, setRestoreAppPassword] = useState("");
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [safetyToken, setSafetyToken] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<Message>(null);

  useEffect(() => { if (preview) previewRef.current?.focus(); }, [preview]);

  function resetPreview() {
    setPreview(null);
    setSafetyToken(null);
    setConfirmed(false);
    setRestoreMessage(null);
  }

  async function exportBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExportMessage(null);
    if (Array.from(exportPassphrase).length < 16 || new TextEncoder().encode(exportPassphrase).length > 1024 || exportPassphrase === exportAppPassword || exportPassphrase !== exportRepeat) {
      setExportMessage({ text: "Gebruik een wachtzin van minstens 16 tekens en maximaal 1024 bytes; voer die twee keer gelijk in.", error: true });
      return;
    }
    setBusy("export");
    try {
      await downloadEncryptedBackup(exportAppPassword, exportPassphrase, "pulse-gegevens");
      setExportMessage({ text: "De versleutelde back-up is gedownload. Bewaar het bestand en de wachtzin apart en veilig.", error: false });
      setExportAppPassword("");
      setExportPassphrase("");
      setExportRepeat("");
    } catch (error) {
      setExportMessage({ text: error instanceof Error ? error.message : "Back-up maken is mislukt.", error: true });
    } finally {
      setBusy(null);
    }
  }

  async function inspectBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetPreview();
    if (!file || file.size > MAX_FILE_BYTES) {
      setRestoreMessage({ text: "Kies een Pulse-back-upbestand van maximaal 3,5 MB.", error: true });
      return;
    }
    setBusy("inspect");
    try {
      const response = await postBackup("/api/backup/inspect", {
        appPassword: restoreAppPassword,
        passphrase: restorePassphrase,
        archive: await file.text(),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setPreview(await response.json() as Preview);
    } catch (error) {
      setRestoreMessage({ text: error instanceof Error ? error.message : "Back-up controleren is mislukt.", error: true });
    } finally {
      setBusy(null);
    }
  }

  async function downloadSafetyBackup() {
    setRestoreMessage(null);
    setBusy("safety");
    try {
      const token = await downloadEncryptedBackup(restoreAppPassword, restorePassphrase, "pulse-voor-herstel");
      setSafetyToken(token);
      setRestoreMessage({ text: "De veiligheidkopie van je huidige gegevens is gedownload. Bewaar dit bestand voordat je doorgaat.", error: false });
    } catch (error) {
      setRestoreMessage({ text: error instanceof Error ? error.message : "Veiligheidkopie maken is mislukt.", error: true });
    } finally {
      setBusy(null);
    }
  }

  async function restoreBackup() {
    if (!file || !preview || !safetyToken || !confirmed) return;
    setRestoreMessage(null);
    setBusy("restore");
    try {
      const response = await postBackup("/api/backup/restore", {
        appPassword: restoreAppPassword,
        passphrase: restorePassphrase,
        archive: await file.text(),
        inspectionToken: preview.inspectionToken,
        safetyToken,
        confirmation: "VERVANG",
      });
      if (!response.ok) throw new Error(await responseError(response));
      setPreview(null);
      setSafetyToken(null);
      setConfirmed(false);
      setFile(null);
      setFileKey((key) => key + 1);
      setRestoreAppPassword("");
      setRestorePassphrase("");
      setRestoreMessage({ text: "Herstel gelukt. Je runs, Health-metingen en doel zijn teruggezet.", error: false });
      router.refresh();
    } catch (error) {
      setRestoreMessage({ text: error instanceof Error ? error.message : "Herstellen is mislukt.", error: true });
    } finally {
      setBusy(null);
    }
  }

  return <div className="b-grid">
    <section className="b-card" aria-labelledby="b-export-title">
      <span className="p-overline">STAP 1 · BEWAREN</span>
      <h2 id="b-export-title">Versleutelde back-up maken</h2>
      <p>Je ontvangt één bestand met alle opgeslagen runs, Health-metingen en je wedstrijddoel, inclusief handmatige aanpassingen. De app bewaart dit bestand niet voor je.</p>
      <form onSubmit={exportBackup} className="b-form">
        <label>App-wachtwoord<input type="password" autoComplete="current-password" required value={exportAppPassword} onChange={(event) => setExportAppPassword(event.target.value)} /></label>
        <label>Nieuwe back-upwachtzin<input type="password" autoComplete="new-password" minLength={16} maxLength={1024} required value={exportPassphrase} onChange={(event) => setExportPassphrase(event.target.value)} /></label>
        <label>Herhaal back-upwachtzin<input type="password" autoComplete="new-password" minLength={16} maxLength={1024} required value={exportRepeat} onChange={(event) => setExportRepeat(event.target.value)} /></label>
        <p className="b-hint">Kies een andere wachtzin dan je app-wachtwoord. Zonder deze wachtzin kan niemand het bestand openen, ook jij niet.</p>
        <button type="submit" className="b-primary" disabled={busy !== null}>{busy === "export" ? "Back-up wordt gemaakt…" : "Download back-up"}</button>
      </form>
      {exportMessage && <p className={exportMessage.error ? "b-message b-error" : "b-message"} role={exportMessage.error ? "alert" : "status"}>{exportMessage.text}</p>}
      <p className="b-fine">Strava-koppeling en app-wachtwoord staan niet in de kopie. Dit is een handmatige download: maak regelmatig een nieuwe en bewaar die op een tweede veilige plek.</p>
    </section>

    <section className="b-card" aria-labelledby="b-restore-title">
      <span className="p-overline">STAP 2 · TERUGZETTEN</span>
      <h2 id="b-restore-title">Back-up herstellen</h2>
      <p>Controleer eerst het bestand. Daarna download je een veiligheidkopie van de huidige stand en bevestig je het herstel.</p>
      <form onSubmit={inspectBackup} className="b-form">
        <label>Pulse-back-upbestand<input key={fileKey} type="file" accept=".pulsebackup,application/octet-stream" required onChange={(event) => { setFile(event.target.files?.[0] ?? null); resetPreview(); }} /></label>
        <label>App-wachtwoord<input type="password" autoComplete="current-password" required value={restoreAppPassword} onChange={(event) => { setRestoreAppPassword(event.target.value); resetPreview(); }} /></label>
        <label>Back-upwachtzin<input type="password" autoComplete="off" required value={restorePassphrase} onChange={(event) => { setRestorePassphrase(event.target.value); resetPreview(); }} /></label>
        <button type="submit" className="b-secondary" disabled={busy !== null}>{busy === "inspect" ? "Bestand wordt gecontroleerd…" : "Controleer back-up"}</button>
      </form>

      {preview && <div className="b-preview" aria-live="polite">
        <h3 ref={previewRef} tabIndex={-1}>Dit wordt hersteld</h3>
        <p>Back-up gemaakt op {new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short" }).format(new Date(preview.createdAt))}.</p>
        <div className="b-preview-columns"><div><h4>In back-up</h4><CountRows counts={preview.archiveCounts} /></div><div><h4>Nu in de app</h4><CountRows counts={preview.currentCounts} /></div></div>
        <p className="b-warning">De huidige runs, Health-metingen en doelen worden volledig vervangen door de inhoud van dit bestand. Je huidige Strava-koppeling blijft bestaan.</p>
        <button type="button" className="b-secondary" disabled={busy !== null} onClick={downloadSafetyBackup}>{busy === "safety" ? "Veiligheidkopie wordt gemaakt…" : "Download eerst huidige gegevens"}</button>
        {safetyToken && <>
          <label className="b-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Ik heb de veiligheidkopie opgeslagen en begrijp dat de huidige gegevens worden vervangen.</label>
          <button type="button" className="b-danger" disabled={busy !== null || !confirmed} onClick={restoreBackup}>{busy === "restore" ? "Gegevens worden hersteld…" : "Herstel deze back-up"}</button>
        </>}
      </div>}
      {restoreMessage && <p className={restoreMessage.error ? "b-message b-error" : "b-message"} role={restoreMessage.error ? "alert" : "status"}>{restoreMessage.text}</p>}
    </section>
  </div>;
}
