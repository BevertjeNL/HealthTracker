import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="c-shell c-container">
      <section className="c-empty">
        <h1>Deze pagina bestaat niet.</h1>
        <p>Controleer het adres of ga terug naar je overzicht.</p>
        <Link className="c-button" href="/">Terug naar Vandaag</Link>
      </section>
    </main>
  );
}
