"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { syncRunsAction } from "@/app/runs/actions";

const THRESHOLD = 72;
const MAX_PULL = 120;
const MIN_SPINNER_MS = 700;
// A full Strava sync is not needed on every pull; within this window only the page data is re-read.
const SYNC_COOLDOWN_MS = 2 * 60_000;
// Elements that scroll or drag on their own must keep their gesture.
const OWN_GESTURE = "input, select, textarea, [role='slider'], .rs, .st-heat-scroll, .st-months-wrap, .an-table-wrap, .p-coverage, .recharts-wrapper";

type Phase = "idle" | "pulling" | "ready" | "loading";

// Standalone web apps on iOS have no native pull-to-refresh. This one syncs Strava (rate limited) and re-reads the page.
export function PullToRefresh() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const indicator = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("idle");
  const lastSync = useRef(0);

  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    let startY = 0;
    let startX = 0;
    let tracking = false;
    let pull = 0;

    const setPull = (value: number) => {
      pull = value;
      indicator.current?.style.setProperty("--ptr", `${value}px`);
      indicator.current?.style.setProperty("--ptr-p", String(Math.min(1, value / THRESHOLD)));
    };
    const setPhaseBoth = (next: Phase) => {
      if (phaseRef.current === next) return;
      phaseRef.current = next;
      setPhase(next);
    };

    async function refresh() {
      setPhaseBoth("loading");
      setPull(THRESHOLD * 0.8);
      const started = Date.now();
      try {
        if (started - lastSync.current > SYNC_COOLDOWN_MS) {
          lastSync.current = started;
          await syncRunsAction();
        }
        router.refresh();
      } catch {
        // The page keeps showing the data it already has.
      }
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, MIN_SPINNER_MS - (Date.now() - started))));
      setPull(0);
      setPhaseBoth("idle");
    }

    function onStart(event: TouchEvent) {
      if (phaseRef.current === "loading" || window.scrollY > 0 || event.touches.length !== 1) return;
      if ((event.target as Element | null)?.closest(OWN_GESTURE)) return;
      startY = event.touches[0].clientY;
      startX = event.touches[0].clientX;
      tracking = true;
    }

    function onMove(event: TouchEvent) {
      if (!tracking) return;
      const dy = event.touches[0].clientY - startY;
      const dx = Math.abs(event.touches[0].clientX - startX);
      if (window.scrollY > 0 || dy <= 0 || dx > dy) {
        if (phaseRef.current !== "idle") { setPull(0); setPhaseBoth("idle"); }
        if (dy <= 0 || window.scrollY > 0) tracking = false;
        return;
      }
      // Rubber-band resistance, like the native control.
      setPull(Math.min(MAX_PULL, dy * 0.5));
      setPhaseBoth(pull >= THRESHOLD ? "ready" : "pulling");
    }

    function onEnd() {
      if (!tracking) return;
      tracking = false;
      if (phaseRef.current === "ready") void refresh();
      else { setPull(0); setPhaseBoth("idle"); }
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  return <div ref={indicator} className={`ptr ptr-${phase}`} role="status" aria-live="polite" aria-hidden={phase === "idle"}>
    <span className="ptr-chip">
      {phase === "loading"
        ? <svg className="ptr-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.55" /></svg>
        : <svg className="ptr-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14m0 0-5-5m5 5 5-5" /></svg>}
      <span>{phase === "loading" ? "Verversen…" : phase === "ready" ? "Loslaten om te verversen" : "Trek om te verversen"}</span>
    </span>
  </div>;
}
