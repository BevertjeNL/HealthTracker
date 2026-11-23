import type { Metadata } from "next";
import { desc, gte, sql } from "drizzle-orm";
import { CoachNav } from "@/components/CoachNav";
import { GoalEditor } from "@/components/GoalEditor";
import { deleteTrainingGoalAction } from "@/app/goal/actions";
import { db } from "@/db";
import { activities, healthMetrics, trainingGoals } from "@/db/schema";
import { buildCoachToday, buildPostRunCoach, postRunPlanWarning } from "@/lib/coach";
import { addDays, buildGoalPlan, dateText, daysBetween, goalDate, upcomingRaces } from "@/lib/goal-plan";
import { requirePageSession } from "@/lib/page-auth";

export const metadata: Metadata = { title: "Doel | Pulse" };
export const dynamic = "force-dynamic";

export default async function GoalPage() {
  await requirePageSession();
  const now = new Date();
  const today = goalDate(now);
  const [runs, health, saved] = await Promise.all([
    db.select().from(activities).where(gte(activities.startDate, sql<Date>`CURRENT_TIMESTAMP - INTERVAL '400 days'`)).orderBy(desc(activities.startDate)),
    db.select().from(healthMetrics).where(gte(healthMetrics.date, sql<string>`CURRENT_DATE - 400`)),
    db.select().from(trainingGoals).orderBy(trainingGoals.raceDate),
  ]);
  const upcoming = upcomingRaces(saved, today);
  const goal = upcoming[0] ?? null;
  const past = saved.filter((race) => race.raceDate < today);
  const coach = buildCoachToday(runs, health, now);
  const review = coach.lastRun ? buildPostRunCoach(coach.lastRun, runs, health) : null;
  const plan = goal ? buildGoalPlan(goal, runs, { recoveryScore: coach.recovery.score, loadChangePct: coach.load.changePct, generalAdvice: coach.advice, lastRunWarning: coach.lastRun && review ? postRunPlanWarning(review, coach.lastRun.startDate) : null }, now) : null;
  return <div className="c-shell"><main id="main-content" className="c-container"><CoachNav active="goal" />
    <header className="p-head"><div><span className="p-overline">DE WEDSTRIJDAGENDA</span><h1>Op weg naar de start</h1><p>Je eerstvolgende wedstrijd bepaalt het schema. De rest blijft in beeld.</p></div></header>
    {goal && plan && <section className="g-countdown" aria-label="Aftellen naar de eerstvolgende wedstrijd"><div className="g-count-main"><span className="c-overline">EERSTVOLGENDE START</span><div className="g-count-hero"><div className="g-count-number"><strong>{plan.daysUntilRace}</strong><span>{plan.daysUntilRace === 1 ? "dag" : "dagen"}</span></div><div><h2>{plan.distanceLabel}</h2><time dateTime={goal.raceDate}>{dateText(goal.raceDate)}</time><p>{plan.phase === "aanloop" ? `Gerichte voorbereiding vanaf ${dateText(plan.preparationStart)}` : plan.daysUntilRace <= 7 ? "Raceweek. Frisheid gaat nu voor extra kilometers." : "Je voorbereiding loopt. De winst komt uit herhalen én herstellen."}</p></div></div></div><div className="g-count-queue"><span className="c-overline">DAARNA</span>{upcoming.length > 1 ? <ol>{upcoming.slice(1).map((race) => <li key={race.id}><span className="g-count-pin" aria-hidden="true" /><span><strong>{race.distanceM === 21097 ? "Halve marathon" : `${race.distanceM / 1000} kilometer`}</strong><time dateTime={race.raceDate}>{dateText(race.raceDate)}</time></span><b>{daysBetween(race.raceDate, today)} d</b></li>)}</ol> : <p>Geen andere wedstrijden gepland.</p>}</div></section>}
    <section className="g-setup" aria-labelledby="goal-setup-title"><div className="g-setup-copy"><span className="c-overline">WEDSTRIJD TOEVOEGEN</span><h2 id="goal-setup-title">Zet hem op de kalender.</h2><p>Een datum, afstand en richttempo zijn genoeg. Je kunt een wedstrijd hieronder altijd aanpassen.</p></div><GoalEditor goal={null} defaultDate={addDays(today, 28)} minDate={addDays(today, 1)} maxDate={addDays(today, 365)} /></section>
    {upcoming.length > 0 && <section className="g-calendar" aria-labelledby="g-calendar-title"><div className="c-section-heading"><div><span className="c-overline">JOUW KALENDER</span><h2 id="g-calendar-title">{upcoming.length} {upcoming.length === 1 ? "wedstrijd" : "wedstrijden"}</h2></div></div><ol>{upcoming.map((race, index) => <li key={race.id} className={index === 0 ? "is-next" : ""}><div className="g-calendar-date"><time dateTime={race.raceDate}>{dateText(race.raceDate)}</time><span>{index === 0 ? "Eerstvolgende" : `Over ${daysBetween(race.raceDate, today)} dagen`}</span></div><div className="g-calendar-info"><strong>{race.distanceM === 21097 ? "Halve marathon" : `${race.distanceM / 1000} kilometer`}</strong><span>Doeltempo {Math.floor(race.targetPaceSecPerKm / 60)}:{String(race.targetPaceSecPerKm % 60).padStart(2, "0")}/km</span></div><details className="g-calendar-edit"><summary>Wijzig</summary><div className="g-calendar-edit-inner"><GoalEditor goal={race} defaultDate={race.raceDate} minDate={addDays(today, 1)} maxDate={addDays(today, 365)} /><form action={deleteTrainingGoalAction}><input type="hidden" name="id" value={race.id} /><button type="submit" className="g-delete">Verwijder wedstrijd</button></form></div></details></li>)}</ol></section>}
    {past.length > 0 && <details className="g-past"><summary>Eerdere geplande wedstrijden ({past.length})</summary><ul>{past.map((race) => <li key={race.id}><span>{dateText(race.raceDate)} · {race.distanceM === 21097 ? "Halve marathon" : `${race.distanceM / 1000} kilometer`}</span><form action={deleteTrainingGoalAction}><input type="hidden" name="id" value={race.id} /><button type="submit">Verwijder</button></form></li>)}</ul></details>}
    {plan && <>
      <section className="g-target" aria-label="Wedstrijddoel"><div><span className="c-overline">RICHTPUNT · EERSTVOLGENDE WEDSTRIJD</span><h2>{plan.distanceLabel}</h2><p>{dateText(goal!.raceDate)}</p></div><div className="g-target-numbers"><span><small>Doeltempo</small><strong>{plan.targetPace} /km</strong></span><span><small>Richttijd, geen voorspelling</small><strong>{plan.finishTime}</strong></span></div></section>
      {plan.phase === "aanloop" ? <section className="g-wait"><span className="c-overline">NU NOG GEEN WEDSTRIJDSCHEMA</span><h2>De echte voorbereiding begint {dateText(plan.preparationStart)}.</h2><p>Voor deze {plan.distanceLabel.toLowerCase()} is {plan.preparationWeeks} weken gericht trainen een zinnige aanloop met jouw huidige loopbasis. Tot dan: volg je normale loopritme, houd het plezierig en bouw geen kilometers of tempo op om alvast een vinkje te zetten. Je dagelijkse coach blijft je eerstvolgende passende run kiezen.</p><span>Nog {daysBetween(plan.preparationStart, today)} dagen tot de start van de voorbereiding.</span></section> : <>
        <section className="g-assessment"><div><span className="c-overline">WAT JE BASIS NU TOELAAT</span><h2>{plan.level}</h2><p>{plan.assessment}</p></div><ul>{plan.evidence.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section className="g-schedule" aria-labelledby="goal-schedule-title"><div className="c-section-heading"><div><span className="c-overline">JE SCHEMA</span><h2 id="goal-schedule-title">{plan.daysUntilRace > 28 ? "De komende vier weken." : "Van vandaag tot de start."}</h2></div></div><p className="g-schedule-intro">{plan.weeks.some((week) => week.days.some((day) => day.tone === "quality")) ? "Per week een tempotraining, een rustige lange loop en herstel ertussen. De laatste week is lichter, met een korte tempoprikkel." : "Eerst rustige loopdagen en korte versnellingen. Lange blokken op wedstrijdtempo komen later."} Gemiste training? Sla hem over, niet inhalen. Je Strava-runs verschijnen vanzelf in het schema.</p>
          <div className="g-weeks">{plan.weeks.map((week) => <section className="g-week" key={week.label}><div className="g-week-head"><h3>{week.label}</h3><span>{dateText(week.days[0].date)} – {dateText(week.days.at(-1)!.date)}</span></div><ol>{week.days.map((day) => <li className={`g-day ${day.tone} ${day.status}`} key={day.date}><div><time dateTime={day.date}>{dateText(day.date)}</time><span className={`g-session-label ${day.tone}`}>{day.tone === "quality" ? "TEMPO" : day.tone === "long" ? "LANGE LOOP" : day.tone === "easy" ? "RUSTIG" : day.tone === "race" ? "WEDSTRIJD" : "HERSTEL"}</span>{!(day.tone === "rest" && day.title === "Herstel") && <strong>{day.title}</strong>}{day.status === "run-recorded" || day.status === "extra-run" ? <span className="g-done">Run gelogd · {day.actualKm?.toFixed(1).replace(".", ",")} km</span> : day.status === "adjusted" ? <span className="g-adjusted">Vandaag aangepast</span> : null}</div><p>{day.detail}</p></li>)}</ol></section>)}</div>
        </section>
        {plan.daysUntilRace <= 28 && <section className="g-race"><span className="c-overline">WEDSTRIJDDAG</span><div><h2>{plan.raceDay.title}</h2><p>{plan.raceDay.detail}</p></div></section>}
      </>}
    </>}
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
