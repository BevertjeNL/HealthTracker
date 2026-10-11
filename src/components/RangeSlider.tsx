"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

type Role = "lo" | "hi" | "pan";

export function RangeSlider({
  orientation,
  min,
  max,
  step,
  minGap,
  value,
  onChange,
  label,
  format,
}: {
  orientation: "horizontal" | "vertical";
  min: number;
  max: number;
  step: number;
  minGap: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  label: string;
  format: (value: number) => string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ role: Role; offset: number } | null>(null);
  const vertical = orientation === "vertical";
  const span = Math.max(max - min, step);
  const [lo, hi] = value;
  const pct = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / span) * 100))}%`;
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const snap = (v: number) => Number((Math.round(v / step) * step).toFixed(4));

  function valueAt(event: PointerEvent) {
    const rect = track.current!.getBoundingClientRect();
    const ratio = vertical ? 1 - (event.clientY - rect.top) / rect.height : (event.clientX - rect.left) / rect.width;
    return min + clamp(ratio, 0, 1) * span;
  }

  function move(role: Role, v: number, offset = 0) {
    if (role === "lo") onChange([clamp(snap(v), min, hi - minGap), hi]);
    else if (role === "hi") onChange([lo, clamp(snap(v), lo + minGap, max)]);
    else {
      const width = hi - lo;
      const start = clamp(snap(v - offset), min, max - width);
      onChange([start, Number((start + width).toFixed(4))]);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-role]")?.dataset.role as Role | undefined;
    const v = valueAt(event);
    const role: Role = target ?? (Math.abs(v - lo) <= Math.abs(v - hi) ? "lo" : "hi");
    drag.current = { role, offset: v - lo };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!target) move(role, v);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    move(drag.current.role, valueAt(event), drag.current.offset);
  }

  function onKey(role: "lo" | "hi") {
    return (event: KeyboardEvent<HTMLDivElement>) => {
      const forward = event.key === "ArrowRight" || event.key === "ArrowUp";
      const backward = event.key === "ArrowLeft" || event.key === "ArrowDown";
      if (!forward && !backward) return;
      event.preventDefault();
      const delta = (forward ? 1 : -1) * step * (event.shiftKey ? 10 : 1);
      move(role, (role === "lo" ? lo : hi) + delta);
    };
  }

  const size = vertical ? "height" : "width";
  const from = vertical ? "bottom" : "left";
  return <div ref={track} className={`rs rs-${orientation}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    <div className="rs-rail" />
    <div className="rs-band" data-role="pan" style={{ [from]: pct(lo), [size]: `calc(${pct(hi)} - ${pct(lo)})` }} />
    {(["lo", "hi"] as const).map((role) => {
      const current = role === "lo" ? lo : hi;
      return <div key={role} className="rs-handle" data-role={role} role="slider" tabIndex={0} aria-orientation={orientation}
        aria-label={`${label} ${role === "lo" ? (vertical ? "ondergrens" : "begin") : (vertical ? "bovengrens" : "einde")}`}
        aria-valuemin={role === "lo" ? min : lo + minGap} aria-valuemax={role === "lo" ? hi - minGap : max} aria-valuenow={current} aria-valuetext={format(current)}
        style={{ [from]: pct(current) }} onKeyDown={onKey(role)} />;
    })}
  </div>;
}
