import Link from "next/link";
import { AppLogo } from "./AppLogo";

export function CoachNav({ active }: { active: "today" | "runs" }) {
  return <nav className="c-nav" aria-label="Hoofdnavigatie">
    <Link href="/" className="brand-mark" aria-label="Pulse, naar vandaag"><AppLogo /></Link>
    <div className="c-nav-links"><Link href="/" aria-current={active === "today" ? "page" : undefined}>Vandaag</Link><Link href="/runs" aria-current={active === "runs" ? "page" : undefined}>Mijn runs</Link></div>
    <span className="c-nav-caption">JOUW HARDLOOPCOACH</span>
  </nav>;
}
