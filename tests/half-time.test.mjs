import assert from "node:assert/strict";
import test from "node:test";
import { estimateHalfMarathonTime, HALF_MARATHON_M } from "../src/lib/half-time.ts";

// Synthetische kilometertijden: 300 s per km, op de laatste (gedeeltelijke) split anders.
const splitsFor = (distanceM, secondsPerKm = 300) => {
  const out = [];
  let left = distanceM;
  for (let i = 1; left > 0; i++) {
    const d = Math.min(1000, left);
    out.push({ split: i, distance: d, moving_time: (d / 1000) * secondsPerKm });
    left -= d;
  }
  return out;
};

test("a run longer than the half marathon reads the time at 21.0975 km from the splits", () => {
  const run = { distanceM: 21_700, movingTimeS: (21_700 / 1000) * 300, raw: { splits_metric: splitsFor(21_700) } };
  const result = estimateHalfMarathonTime(run);
  assert.equal(result.method, "splits");
  assert.equal(result.timeS, Math.round((HALF_MARATHON_M / 1000) * 300));
  assert.ok(result.deltaM > 0);
});

test("the splits method follows a fading pace instead of the average", () => {
  const first = splitsFor(10_000, 280);
  const second = splitsFor(11_700, 320).map((s, i) => ({ ...s, split: 11 + i }));
  const run = { distanceM: 21_700, movingTimeS: 10 * 280 + 11.7 * 320, raw: { splits_metric: [...first, ...second] } };
  const result = estimateHalfMarathonTime(run);
  const average = run.movingTimeS * (HALF_MARATHON_M / 21_700);
  assert.equal(result.method, "splits");
  assert.ok(result.timeS < average, "a fading run reached 21.0975 km faster than its average pace suggests");
});

test("a run that was a bit too short is scaled up and labelled as an estimate", () => {
  const result = estimateHalfMarathonTime({ distanceM: 20_800, movingTimeS: 6240, raw: { splits_metric: splitsFor(20_800) } });
  assert.equal(result.method, "geschat");
  assert.ok(result.deltaM < 0);
  assert.ok(result.timeS > 6240);
  // Riegel zet de ontbrekende 297,5 m op een iets lager tempo dan het gemiddelde.
  assert.ok(result.timeS > 6240 * (HALF_MARATHON_M / 20_800));
  assert.match(result.note, /te kort/);
});

test("without usable splits a longer run falls back to the scaled estimate", () => {
  const withoutSplits = estimateHalfMarathonTime({ distanceM: 21_300, movingTimeS: 6669, raw: {} });
  assert.equal(withoutSplits.method, "geschat");
  assert.ok(withoutSplits.timeS < 6669);
  const broken = estimateHalfMarathonTime({ distanceM: 21_300, movingTimeS: 6669, raw: { splits_metric: [{ distance: 1000, moving_time: 300 }, { distance: "x" }] } });
  assert.equal(broken.method, "geschat");
  const tooShortSplits = estimateHalfMarathonTime({ distanceM: 21_300, movingTimeS: 6669, raw: { splits_metric: splitsFor(15_000) } });
  assert.equal(tooShortSplits.method, "geschat");
});

test("exactly the half marathon distance returns the moving time", () => {
  const result = estimateHalfMarathonTime({ distanceM: HALF_MARATHON_M, movingTimeS: 6600, raw: {} });
  assert.equal(result.timeS, 6600);
});

test("runs far from the half marathon distance or without a time get no estimate", () => {
  assert.equal(estimateHalfMarathonTime({ distanceM: 10_000, movingTimeS: 3000, raw: {} }), null);
  assert.equal(estimateHalfMarathonTime({ distanceM: 19_900, movingTimeS: 6000, raw: {} }), null);
  assert.equal(estimateHalfMarathonTime({ distanceM: 22_600, movingTimeS: 7000, raw: {} }), null);
  assert.equal(estimateHalfMarathonTime({ distanceM: 21_000, movingTimeS: 0, raw: {} }), null);
});
