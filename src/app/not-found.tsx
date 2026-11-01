import Link from "next/link";
import { CoachNav } from "@/components/CoachNav";

export default function NotFound() {
  return <div className="c-shell"><main className="c-container"><CoachNav />
    <section className="c-empty"><span className="c-overline">NIET GEVONDEN</span><h2>Deze pagina bestaat niet (meer).</h2><p>De run of pagina die je zocht is niet gevonden. Misschien is hij op Strava verwijderd.</p><Link href="/" className="c-button">Naar vandaag</Link></section>
  </main></div>;
}
