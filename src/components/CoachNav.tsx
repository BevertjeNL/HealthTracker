import Link from "next/link";
import { AppLogo } from "./AppLogo";

export function CoachNav({ active }: { active: "today" | "runs" | "goal" }) {
  return <nav className="c-nav" aria-label="Hoofdnavigatie">
    <Link href="/" className="brand-mark" aria-label="Pulse, naar vandaag"><AppLogo /></Link>
    <div className="c-nav-links"><Link href="/" aria-current={active === "today" ? "page" : undefined}>Vandaag</Link><Link href="/goal" aria-current={active === "goal" ? "page" : undefined}>Mijn doel</Link><Link href="/runs" aria-current={active === "runs" ? "page" : undefined}>Mijn runs</Link></div>
    <span className="c-nav-caption">JOUW HARDLOOPCOACH</span>
  </nav>;
}
