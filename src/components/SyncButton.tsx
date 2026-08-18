"use client";

import { useActionState } from "react";
import { syncRunsAction } from "@/app/runs/actions";

type State = { synced?: number; error?: string };

export function SyncButton() {
  const [state, formAction, isPending] = useActionState<State>(
    async () => syncRunsAction(),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-60"
        style={{ background: "var(--series-orange)", color: "#fff" }}
      >
        {isPending ? "Bezig met synchroniseren…" : "Sync met Strava"}
      </button>
      {state.synced != null && (
        <span className="text-xs" style={{ color: "var(--delta-good)" }}>
          {state.synced} runs gesynct
        </span>
      )}
      {state.error && (
        <span className="text-xs" style={{ color: "var(--status-critical)" }}>
          Fout: {state.error}
        </span>
      )}
    </form>
  );
}
