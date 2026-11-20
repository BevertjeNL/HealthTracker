import type { Metadata } from "next";
import { BackupManager } from "@/components/BackupManager";
import { CoachNav } from "@/components/CoachNav";
import { requirePageSession } from "@/lib/page-auth";
import "./backup.css";

export const metadata: Metadata = { title: "Back-up | Pulse" };
export const dynamic = "force-dynamic";

export default async function BackupPage() {
  await requirePageSession();
  return <div className="c-shell"><main id="main-content" className="c-container">
    <CoachNav />
    <header className="p-head b-head">
      <div><span className="p-overline">JOUW GEGEVENS</span><h1>Back-up</h1><p>Bewaar een versleutelde kopie van je runs, Health-metingen en wedstrijddoel op een plek die jij kiest.</p></div>
    </header>
    <BackupManager />
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
