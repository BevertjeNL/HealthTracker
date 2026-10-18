import { fmtSigned } from "@/lib/format";
import type { ResponseProfile } from "@/lib/training-health";

// HRV en rusthartslag de ochtend na een run, per belastingklasse, t.o.v. je eigen basislijn.
export function ResponseBars({ profile }: { profile: ResponseProfile }) {
  if (!profile.enough) return <p className="p-empty">{profile.summary}</p>;
  const biggest = Math.max(5, ...profile.buckets.flatMap((b) => [Math.abs(b.hrvDeltaPct ?? 0), Math.abs(b.rhrDeltaPct ?? 0)]));
  const row = (value: number | null, samples: number, cls: string) => <div className={`p-resp-bar ${cls}`}>{value == null ? <span className="p-resp-na">te weinig metingen ({samples})</span> : <><span className="p-resp-track"><i style={{ width: `${Math.min(100, (Math.abs(value) / biggest) * 100)}%` }} data-neg={value < 0 ? "1" : "0"} /></span><b>{fmtSigned(value, 1, "%")}</b></>}</div>;
  return <div className="p-resp">
    <div className="p-resp-grid" role="table" aria-label="Reactie van je lichaam per belasting">
      <div className="p-resp-head" role="row"><span role="columnheader">Belasting</span><span role="columnheader">HRV de ochtend erna</span><span role="columnheader">Rusthartslag de ochtend erna</span></div>
      {profile.buckets.map((b) => <div className="p-resp-row" role="row" key={b.label}><span role="cell"><strong>{b.label}</strong><small>{b.runs} dagen</small></span><div role="cell">{row(b.hrvDeltaPct, b.hrvSamples, "hrv")}</div><div role="cell">{row(b.rhrDeltaPct, b.rhrSamples, "rhr")}</div></div>)}
    </div>
    <p className="p-resp-summary">{profile.summary}{profile.recoveryDays != null && <> Na een zware run is je HRV meestal na <b>{profile.recoveryDays > 5 ? "meer dan 5" : profile.recoveryDays} dag{profile.recoveryDays === 1 ? "" : "en"}</b> terug op niveau.</>}</p>
  </div>;
}
