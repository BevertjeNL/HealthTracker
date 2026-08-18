"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/login/actions";

const INITIAL_STATE: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, INITIAL_STATE);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          Wachtwoord
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          className="w-full rounded-lg px-3 py-2 outline-none focus:ring-2"
          style={{
            color: "var(--text-primary)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm" style={{ color: "var(--status-critical)" }}>
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
        style={{ background: "var(--series-orange)" }}
      >
        {pending ? "Bezig met inloggen…" : "Inloggen"}
      </button>
    </form>
  );
}
