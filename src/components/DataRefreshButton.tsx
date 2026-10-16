"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncRunsAction } from "@/app/runs/actions";

type RefreshStatus = "idle" | "running" | "done" | "error";

const STEPS = ["Strava ophalen", "Apple Health lezen", "Advies herberekenen"];
const MIN_STEP_MS = 650;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function DataRefreshButton({
  healthNeedsSync,
  lastHealthDate,
}: {
  healthNeedsSync: boolean;
  lastHealthDate: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<RefreshStatus>("idle");
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [synced, setSynced] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const running = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function refreshData() {
    if (running.current) return;
    running.current = true;
    setStatus("running");
    setStep(0);
    setError("");
    setSynced(null);

    try {
      // Stap 1: Strava synchroniseren op de server.
      const [result] = await Promise.all([syncRunsAction(), wait(MIN_STEP_MS)]);
      if (!mounted.current) return;
      setSynced(result.synced ?? null);
      if (result.error) setError(result.error);

      // Stap 2 en 3: de pagina opnieuw laden leest de laatst ontvangen Health-data en rekent het advies opnieuw uit.
      setStep(1);
      const refreshed = new Promise<void>((resolve) => startTransition(() => { router.refresh(); resolve(); }));
      await Promise.all([refreshed, wait(MIN_STEP_MS)]);
      if (!mounted.current) return;
      setStep(2);
      await wait(MIN_STEP_MS);
      if (!mounted.current) return;
      setStatus(result.error ? "error" : "done");
    } catch {
      if (mounted.current) {
        setError("Verversen is mislukt. Probeer het later opnieuw.");
        setStatus("error");
      }
    } finally {
      running.current = false;
    }
  }

  const isBusy = status === "running";
  const healthText = healthNeedsSync
    ? `Apple Health loopt achter${lastHealthDate ? ` (laatste dag ${lastHealthDate})` : ""}. Je iPhone levert nieuwe gegevens automatisch aan.`
    : "Apple Health is bijgewerkt tot en met gisteren.";
  const message = status === "error"
    ? error
    : status === "done"
      ? `Strava is bijgewerkt${synced != null ? ` · ${synced} runs gecontroleerd` : ""}. ${healthText}`
      : healthText;

  return (
    <div className="data-refresh-control">
      <button
        type="button"
        className={`refresh-button ${healthNeedsSync ? "needs-sync" : ""} ${isBusy ? "is-running" : ""}`}
        onClick={refreshData}
        disabled={isBusy}
        aria-describedby="refresh-status"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 7v5h-5" />
          <path d="M4 17v-5h5" />
          <path d="M6.1 9a7 7 0 0 1 11.5-2.6L20 9" />
          <path d="m4 15 2.4 2.6A7 7 0 0 0 17.9 15" />
        </svg>
        {isBusy ? `${STEPS[step]}…` : healthNeedsSync ? "Gegevens bijwerken" : "Gegevens verversen"}
      </button>
      {isBusy && <ol className="refresh-steps" aria-hidden>
        {STEPS.map((label, index) => <li key={label} className={index < step ? "done" : index === step ? "active" : ""}><i />{label}</li>)}
      </ol>}
      <span id="refresh-status" className={`refresh-status ${status === "error" ? "error" : ""}`} aria-live="polite">
        {isBusy ? STEPS[step] : message}
      </span>
    </div>
  );
}
