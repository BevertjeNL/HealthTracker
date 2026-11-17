"use client";

import Link from "next/link";

export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main id="main-content" className="c-shell c-container">
      <section className="c-empty" role="alert">
        <h1>Deze pagina kon niet worden geladen.</h1>
        <p>Controleer je verbinding en probeer het opnieuw.</p>
        <button className="c-button" type="button" onClick={retry}>Opnieuw proberen</button>
        <p><Link href="/">Terug naar Vandaag</Link></p>
      </section>
    </main>
  );
}
