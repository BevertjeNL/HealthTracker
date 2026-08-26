import Link from "next/link";
import { LoginForm } from "@/app/login/LoginForm";
import { AppLogo } from "@/components/AppLogo";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section
        className="w-full max-w-sm rounded-2xl p-6 shadow-sm"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
      >
        <Link href="/" className="brand-mark" aria-label="Naar Pulse dashboard">
          <AppLogo />
        </Link>
        <h1 className="mt-2 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Persoonlijke gegevens
        </h1>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
          Log in om je gezondheids- en hardloopgegevens te bekijken.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
