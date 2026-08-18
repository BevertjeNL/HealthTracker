import { logout } from "@/app/login/actions";

export function LogoutButton() {
  return (
    <form action={logout} className="fixed right-4 top-4 z-50">
      <button
        type="submit"
        className="rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm hover:opacity-80"
        style={{
          color: "var(--text-secondary)",
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
        }}
      >
        Uitloggen
      </button>
    </form>
  );
}
