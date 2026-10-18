"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { logout } from "@/app/login/actions";
import { AppLogo } from "./AppLogo";

export type NavKey = "today" | "form" | "body" | "runs" | "stats" | "goal";

const ICONS: Record<NavKey, string> = {
  today: "M12 3l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1V9.5L12 3z",
  form: "M4 19V9m5 10V5m5 14v-8m5 8V7",
  body: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  runs: "M13 4a1.6 1.6 0 1 1 0 3.2A1.6 1.6 0 0 1 13 4zM9 21l2.5-6L9 12.5l3-3 3 2.5h3M8 12l-3 1.5",
  stats: "M5 20V10m5 10V4m5 16v-7m5 7V8M3 20h18",
  goal: "M5 21V4m0 1h12l-2.5 4L17 13H5",
};
const LINKS: { key: NavKey; href: string; label: string }[] = [
  { key: "today", href: "/", label: "Vandaag" },
  { key: "form", href: "/vorm", label: "Vorm" },
  { key: "body", href: "/lichaam", label: "Lichaam" },
  { key: "runs", href: "/runs", label: "Runs" },
  { key: "stats", href: "/stats", label: "Cijfers" },
  { key: "goal", href: "/goal", label: "Doel" },
];

function Icon({ name }: { name: NavKey }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

// Used while a page is still loading (loading.tsx), when the page itself has not told us which tab is active yet.
function activeFromPath(pathname: string): NavKey {
  const match = LINKS.filter((link) => link.href !== "/").find((link) => pathname === link.href || pathname.startsWith(`${link.href}/`));
  return match?.key ?? "today";
}

export function CoachNav({ active }: { active?: NavKey }) {
  const pathname = usePathname();
  const current = active ?? activeFromPath(pathname);

  // iOS convention: tapping the tab you are already on scrolls back to the top instead of reloading the page.
  function onTabClick(event: MouseEvent<HTMLAnchorElement>, key: NavKey, href: string) {
    if (key !== current || pathname !== href) return;
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  return <>
    <nav className="p-nav" aria-label="Hoofdnavigatie">
      <Link href="/" className="brand-mark" aria-label="Pulse, naar vandaag"><AppLogo /></Link>
      <div className="p-nav-links">{LINKS.map((link) => <Link key={link.key} href={link.href} aria-current={current === link.key ? "page" : undefined}>{link.label}</Link>)}</div>
      <form action={logout} className="p-nav-logout"><button type="submit">Uitloggen</button></form>
    </nav>
    <nav className="p-tabbar" aria-label="Hoofdnavigatie mobiel">{LINKS.map((link) => <Link key={link.key} href={link.href} aria-current={current === link.key ? "page" : undefined} onClick={(event) => onTabClick(event, link.key, link.href)}><Icon name={link.key} /><span>{link.label}</span></Link>)}</nav>
  </>;
}
