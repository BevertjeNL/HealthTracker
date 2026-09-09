"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { syncRunsAction } from "@/app/runs/actions";

const HEALTH_SHORTCUT_URL = "shortcuts://run-shortcut?name=Pulse%20Health-sync";

type RefreshStatus = "idle" | "syncing" | "opening-health" | "checking" | "done" | "error";

function isAppleMobileDevice() {
  const navigatorWithTouch = navigator as Navigator & { maxTouchPoints?: number };
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && (navigatorWithTouch.maxTouchPoints ?? 0) > 1);
}

export function DataRefreshButton({
  healthNeedsSync,
  lastHealthDate,
}: {
  healthNeedsSync: boolean;
  lastHealthDate: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<RefreshStatus>("idle");
  const [message, setMessage] = useState("");
  const waitingForShortcut = useRef(false);
  const shortcutWasOpened = useRef(false);

  useEffect(() => {
    const checkAfterShortcut = async () => {
      if (document.visibilityState === "hidden" && waitingForShortcut.current) {
        shortcutWasOpened.current = true;
        return;
      }
      if (!waitingForShortcut.current || !shortcutWasOpened.current || document.visibilityState !== "visible") return;
      waitingForShortcut.current = false;
      shortcutWasOpened.current = false;
      setStatus("checking");
      setMessage("Apple Health en Strava controleren…");
      const result = await syncRunsAction();
      router.refresh();
      setStatus(result.error ? "error" : "done");
      setMessage(result.error
        ? `Apple Health is opnieuw ingelezen. ${result.error}`
        : "Apple Health en Strava zijn bijgewerkt.");
    };

    document.addEventListener("visibilitychange", checkAfterShortcut);
    return () => {
      document.removeEventListener("visibilitychange", checkAfterShortcut);
    };
  }, [router]);

  async function refreshData() {
    if (isAppleMobileDevice()) {
      waitingForShortcut.current = true;
      shortcutWasOpened.current = false;
      setStatus("opening-health");
      setMessage("Pulse Health-sync wordt geopend. Keer daarna terug naar Pulse.");
      window.location.assign(HEALTH_SHORTCUT_URL);
      return;
    }

    setStatus("syncing");
    setMessage("Strava en de laatst ontvangen gegevens controleren…");

    const result = await syncRunsAction();
    router.refresh();
    if (result.error) {
      setStatus("error");
      setMessage(result.error);
      return;
    }

    setStatus(healthNeedsSync ? "error" : "done");
    setMessage(healthNeedsSync
      ? "Strava is bijgewerkt. Open Pulse op je iPhone om Apple Health opnieuw te versturen."
      : `Gegevens bijgewerkt${result.synced != null ? ` · ${result.synced} runs gecontroleerd` : ""}.`);
  }

  const isBusy = status === "syncing" || status === "checking";
  const buttonLabel = status === "syncing"
    ? "Gegevens ophalen…"
    : status === "checking"
      ? "Health-data controleren…"
      : healthNeedsSync
        ? "Gegevens bijwerken"
        : "Gegevens verversen";

  return (
    <div className="data-refresh-control">
      <button
        type="button"
        className={`refresh-button ${healthNeedsSync ? "needs-sync" : ""}`}
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
        {buttonLabel}
      </button>
      <span id="refresh-status" className={`refresh-status ${status === "error" ? "error" : ""}`} aria-live="polite">
        {message || (healthNeedsSync
          ? `Apple Health loopt achter${lastHealthDate ? ` (laatste dag ${lastHealthDate})` : ""}.`
          : "Apple Health is bijgewerkt tot en met gisteren.")}
      </span>
    </div>
  );
}
