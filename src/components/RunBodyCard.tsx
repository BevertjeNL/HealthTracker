import { fmtNum, fmtSigned } from "@/lib/format";
import type { RunBodyContext } from "@/lib/training-health";

function Cell({ label, value, unit, delta, tone }: { label: string; value: string; unit?: string; delta?: string | null; tone?: "good" | "warning" | "neutral" }) {
  return <div className={`p-body-cell ${tone ?? "neutral"}`}><small>{label}</small><strong>{value}{unit && <em>{unit}</em>}</strong>{delta && <span>{delta}</span>}</div>;
}

const toneOf = (hrvDelta: number | null, rhrDelta: number | null): "good" | "warning" | "neutral" => hrvDelta == null && rhrDelta == null ? "neutral" : (hrvDelta != null && hrvDelta <= -10) || (rhrDelta != null && rhrDelta >= 5) ? "warning" : "good";

export function RunBodyCard({ context, loadBasis, compact = false }: { context: RunBodyContext; loadBasis?: "hartslag" | "geschat"; compact?: boolean }) {
  const { before, after, form } = context;
  const hasAny = before.hrv != null || before.rhr != null || after.hrv != null || after.rhr != null || context.load != null;
  const hasForm = Object.values(form).some((value) => value != null);
  if (!hasAny) return <section className="p-body-card"><span className="p-overline">LICHAAM ROND DEZE RUN</span><p className="p-empty">Er zijn geen Apple Health-metingen rond deze dag ontvangen. Synchroniseer Health om te zien hoe je lichaam startte en reageerde.</p></section>;
  return <section className="p-body-card" aria-label="Lichaam rond deze run">
    <div className="p-body-head"><span className="p-overline">LICHAAM ROND DEZE RUN</span><span className={`p-badge p-badge-${context.readiness.tone === "good" ? "better" : context.readiness.tone === "warning" ? "worse" : "unknown"}`}>{context.readiness.label}</span></div>
    <div className="p-body-phases">
      <div className="p-body-phase"><h3>Ervoor</h3><p className="p-body-sub">Ochtend van de run</p><div className="p-body-cells">
        <Cell label="HRV" value={fmtNum(before.hrv)} unit="ms" delta={before.hrv == null ? "geen meting ontvangen" : before.hrvDeltaPct == null ? "geen basislijn" : `${fmtSigned(before.hrvDeltaPct, 0, "%")} t.o.v. basis`} tone={toneOf(before.hrvDeltaPct, null)} />
        <Cell label="Rusthartslag" value={fmtNum(before.rhr)} unit="bpm" delta={before.rhr == null ? "geen meting ontvangen" : before.rhrDeltaPct == null ? "geen basislijn" : `${fmtSigned(before.rhrDeltaPct, 0, "%")} t.o.v. basis`} tone={toneOf(null, before.rhrDeltaPct)} />
        {!compact && before.weightKg != null && <Cell label="Gewicht" value={fmtNum(before.weightKg, 1)} unit="kg" />}
      </div></div>
      <div className="p-body-phase p-body-load"><h3>Tijdens</h3><p className="p-body-sub">Belasting</p><div className="p-body-cells">
        <Cell label="Trainingsbelasting" value={fmtNum(context.load)} delta={loadBasis === "geschat" ? "geschat zonder hartslag" : "uit hartslag en duur"} />
        <Cell label="Aandeel van je week" value={context.loadShareOfWeekPct == null ? "—" : `${context.loadShareOfWeekPct}`} unit="%" delta="van je laatste 7 dagen" />
      </div></div>
      <div className="p-body-phase"><h3>Erna</h3><p className="p-body-sub">Ochtend na de run</p><div className="p-body-cells">
        <Cell label="HRV" value={fmtNum(after.hrv)} unit="ms" delta={after.hrv == null ? "nog niet gemeten" : after.hrvDeltaPct == null ? "geen basislijn" : `${fmtSigned(after.hrvDeltaPct, 0, "%")} t.o.v. basis`} tone={toneOf(after.hrvDeltaPct, null)} />
        <Cell label="Rusthartslag" value={fmtNum(after.rhr)} unit="bpm" delta={after.rhr == null ? "nog niet gemeten" : after.rhrDeltaPct == null ? "geen basislijn" : `${fmtSigned(after.rhrDeltaPct, 0, "%")} t.o.v. basis`} tone={toneOf(null, after.rhrDeltaPct)} />
      </div></div>
    </div>
    {!compact && hasForm && <div className="p-body-form"><h3>Loopvorm uit Apple Watch</h3><div className="p-body-cells">
      {form.powerW != null && <Cell label="Vermogen" value={fmtNum(form.powerW)} unit="W" />}
      {form.strideM != null && <Cell label="Pasbreedte" value={fmtNum(form.strideM, 2)} unit="m" />}
      {form.groundContactMs != null && <Cell label="Grondcontact" value={fmtNum(form.groundContactMs)} unit="ms" />}
      {form.verticalCm != null && <Cell label="Verticale beweging" value={fmtNum(form.verticalCm, 1)} unit="cm" />}
    </div></div>}
  </section>;
}
