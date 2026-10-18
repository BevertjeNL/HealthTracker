import { pearson, type LinkInsight } from "@/lib/training-health";

export function ScatterLink({ link }: { link: LinkInsight }) {
  const pts = link.points;
  const body = pts.length < 3 ? null : (() => {
    const w = 320; const h = 150; const pad = 10;
    const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
    const sx = (v: number) => pad + ((v - x0) / (x1 - x0 || 1)) * (w - pad * 2);
    const sy = (v: number) => h - pad - ((v - y0) / (y1 - y0 || 1)) * (h - pad * 2);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length; const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const sxx = xs.reduce((a, b) => a + (b - mx) ** 2, 0);
    const slope = sxx ? pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx : 0;
    const showFit = link.verdict === "verband" && pearson(pts) != null;
    return <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${link.title}: ${pts.length} runs`}>
      {pts.map((p, index) => <circle key={`${p.date}-${index}`} cx={sx(p.x)} cy={sy(p.y)} r="3.6" fill="var(--series-hrv)" fillOpacity=".5" vectorEffect="non-scaling-stroke" />)}
      {showFit && <line x1={sx(x0)} x2={sx(x1)} y1={sy(my + slope * (x0 - mx))} y2={sy(my + slope * (x1 - mx))} stroke="var(--series-run)" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
    </svg>;
  })();
  return <article className={`p-link p-link-${link.verdict}`}>
    <div className="p-link-top"><h3>{link.title}</h3><span className="p-badge">{link.verdict === "verband" ? "Verband gevonden" : link.verdict === "geen-verband" ? "Geen verband" : "Te weinig data"}</span></div>
    {body && <figure>{body}<figcaption><span>↔ {link.xLabel}</span><span>↕ {link.yLabel}</span></figcaption></figure>}
    <p>{link.text}</p>
    <small>{link.pairs} gekoppelde runs{link.r != null ? ` · r = ${link.r.toLocaleString("nl-NL")}` : ""}</small>
  </article>;
}
