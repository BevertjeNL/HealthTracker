import { CoachNav } from "@/components/CoachNav";

// Shown instantly on every tab change so a tap gives feedback while the server renders the real page.
export default function Loading() {
  return <div className="c-shell"><main className="c-container" aria-busy="true" aria-label="Pagina wordt geladen">
    <CoachNav />
    <div className="sk-head"><i className="sk sk-line sk-w30" /><i className="sk sk-title" /><i className="sk sk-line sk-w60" /></div>
    <i className="sk sk-hero" />
    <div className="sk-tiles"><i className="sk sk-tile" /><i className="sk sk-tile" /><i className="sk sk-tile" /><i className="sk sk-tile" /></div>
    <i className="sk sk-chart" />
  </main></div>;
}
