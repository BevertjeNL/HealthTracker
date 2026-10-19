"use client";

import { CoachNav } from "@/components/CoachNav";

// Generieke foutpagina: geen stacktrace of databasetekst naar de browser (zie CLAUDE.md).
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <div className="c-shell"><main className="c-container"><CoachNav />
    <section className="c-empty" role="alert"><span className="c-overline">TIJDELIJK NIET BESCHIKBAAR</span><h2>Kon gegevens niet laden.</h2><p>Je data is veilig. Dit is meestal een korte storing bij de database of Strava. Probeer het zo opnieuw.</p><button type="button" className="c-button" onClick={() => retry()}>Opnieuw proberen</button></section>
  </main></div>;
}
