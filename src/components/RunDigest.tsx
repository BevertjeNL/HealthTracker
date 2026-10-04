"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPaceSec, formatTime, KIND_LABEL, type RunKind, type Tone } from "@/lib/run-analysis";

export type DigestView = { id: number; name: string; date: string; kind: RunKind; distanceKm: number; timeS: number; paceSec: number | null; avgHr: number | null; tone: Tone; verdict: string; detail: string; paceVsSimilarSec: number | null; efficiencyVsSimilarPct: number | null; hasSplits: boolean };

const PAGE = 30;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });

export function RunDigest({ rows }: { rows: DigestView[] }) {
  const [kind, setKind] = useState<"all" | RunKind>("all");
  const [attention, setAttention] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const filtered = rows.filter((row) => (kind === "all" || row.kind === kind) && (!attention || row.tone === "watch" || row.tone === "action"));
  const counts = { watch: rows.filter((row) => row.tone === "watch" || row.tone === "action").length, good: rows.filter((row) => row.tone === "good").length };

  return <div className="an-digest">
    <div className="an-digest-bar">
      <div className="an-toggle" role="group" aria-label="Type">{(["all", "race", "long", "interval", "easy"] as const).map((key) => <button type="button" key={key} aria-pressed={kind === key} onClick={() => { setKind(key); setShown(PAGE); }}>{key === "all" ? "Alles" : KIND_LABEL[key]}</button>)}</div>
      <label className="an-check"><input type="checkbox" checked={attention} onChange={(event) => { setAttention(event.target.checked); setShown(PAGE); }} /> Alleen aandachtspunten ({counts.watch})</label>
    </div>
    <p className="an-hint">{counts.good} runs met een sterk punt, {counts.watch} met een aandachtspunt. Klik een run voor de analyse per kilometer.</p>
    <div className="an-digest-list">{filtered.slice(0, shown).map((row) => <Link href={`/runs/${row.id}`} key={row.id} className={`an-digest-row ${row.tone}`}>
      <div><strong>{row.name}</strong><small>{fmtDate(row.date)} · {KIND_LABEL[row.kind]}</small></div>
      <span>{row.distanceKm.toFixed(1)} km<small>{formatTime(row.timeS)}</small></span>
      <span>{formatPaceSec(row.paceSec)}<small>{row.avgHr ? `${Math.round(row.avgHr)} bpm` : "/km"}</small></span>
      <p><b>{row.verdict}</b>{row.detail}</p>
    </Link>)}</div>
    {filtered.length === 0 && <p className="an-empty">Geen runs binnen deze selectie.</p>}
    {filtered.length > shown && <button type="button" className="an-more" onClick={() => setShown(shown + PAGE)}>Toon meer ({filtered.length - shown} te gaan)</button>}
  </div>;
}
