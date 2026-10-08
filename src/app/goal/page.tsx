import Link from "next/link";
import { desc, eq, gte, sql } from "drizzle-orm";
import { CoachNav } from "@/components/CoachNav";
import { GoalEditor } from "@/components/GoalEditor";
import { db } from "@/db";
import { activities, healthMetrics, trainingGoals } from "@/db/schema";
import { buildCoachToday, buildPostRunCoach, postRunPlanWarning } from "@/lib/coach";
import { addDays, buildGoalPlan, dateText, goalDate } from "@/lib/goal-plan";

export const dynamic = "force-dynamic";

export default async function GoalPage() {
  const now = new Date();
  const today = goalDate(now);
  const [runs, health, saved] = await Promise.all([
    db.select().from(activities).where(gte(activities.startDate, sql<Date>`CURRENT_TIMESTAMP - INTERVAL '400 days'`)).orderBy(desc(activities.startDate)),
    db.select().from(healthMetrics).where(gte(healthMetrics.date, sql<string>`CURRENT_DATE - 400`)),
    db.select().from(trainingGoals).where(eq(trainingGoals.id, 1)).limit(1),
  ]);
  const goal = saved[0] ?? null;
  const coach = buildCoachToday(runs, health, now);
  const review = coach.lastRun ? buildPostRunCoach(coach.lastRun, runs, health) : null;
  const plan = goal ? buildGoalPlan(goal, runs, { recoveryScore: coach.recovery.score, loadChangePct: coach.load.changePct, generalAdvice: coach.advice, lastRunWarning: coach.lastRun && review ? postRunPlanWarning(review, coach.lastRun.startDate) : null }, now) : null;
  return <div className="c-shell"><main className="c-container"><CoachNav active="goal" />
    <header className="c-page-head g-page-head"><div><span className="c-overline">JOUW VOLGENDE WEDSTRIJD</span><h1>Een doel geeft<br /><em>richting.</em></h1><p>Stel afstand, datum en doeltempo in. Je schema verandert mee met je Strava-runs en beschikbare Apple Health-hersteldata.</p></div><Link href="/" className="g-back-link">← Advies voor vandaag</Link></header>
    <section className="g-setup" aria-labelledby="goal-setup-title"><div className="g-setup-copy"><span className="c-overline">DOEL INSTELLEN</span><h2 id="goal-setup-title">{goal ? "Pas je wedstrijd aan." : "Maak je wedstrijd concreet."}</h2><p>{goal ? "Je schema wordt opnieuw berekend zodra je afstand, datum of tempo opslaat." : "Voor jouw voorbeeld staan een halve marathon over vier weken en 5:20/km alvast ingevuld."}</p></div><GoalEditor goal={goal} defaultDate={addDays(today, 28)} minDate={addDays(today, 1)} /></section>
    {plan && <>
      <section className="g-target" aria-label="Wedstrijddoel"><div><span className="c-overline">JE DOEL</span><h2>{plan.distanceLabel}</h2><p>{dateText(goal!.raceDate)} · {plan.daysUntilRace < 0 ? "datum voorbij" : `${plan.daysUntilRace} dagen te gaan`}</p></div><div className="g-target-numbers"><span><small>Doeltempo</small><strong>{plan.targetPace} /km</strong></span><span><small>Richttijd</small><strong>{plan.finishTime}</strong></span></div></section>
      {plan.daysUntilRace < 0 ? <p className="g-expired">Deze datum is voorbij. Kies hierboven je volgende wedstrijd om een nieuw schema te zien.</p> : <>
        <section className="g-assessment"><div><span className="c-overline">WAT JE BASIS NU TOELAAT</span><h2>{plan.level}</h2><p>{plan.assessment}</p></div><ul>{plan.evidence.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section className="g-today"><div><span className="c-overline">VANDAAG · {dateText(today).toUpperCase()}</span><h2>{plan.today.label}</h2><p>{plan.today.detail}</p><small>{plan.today.coach}</small></div>{plan.nextSession && <aside><span>VOLGENDE GEPLANDE TRAINING</span><strong>{plan.nextSession.title}</strong><p>{dateText(plan.nextSession.date)} · {plan.nextSession.detail}</p></aside>}</section>
        <section className="g-schedule" aria-labelledby="goal-schedule-title"><div className="c-section-heading"><div><span className="c-overline">JE SCHEMA</span><h2 id="goal-schedule-title">Van vandaag tot de start.</h2></div></div><p className="g-schedule-intro">Elke run uit Strava verschijnt als gelogd in het schema. Een gelogde run bewijst niet automatisch dat je precies de geplande intensiteit hebt uitgevoerd. Bij zware belasting of weinig herstel vervangt de coach de training van vandaag door herstel.</p>
          <div className="g-weeks">{plan.weeks.map((week) => <section className="g-week" key={week.label}><div className="g-week-head"><h3>{week.label}</h3><span>{dateText(week.days[0].date)} – {dateText(week.days.at(-1)!.date)}</span></div><ol>{week.days.map((day) => <li className={`g-day ${day.tone} ${day.status}`} key={day.date}><div><time dateTime={day.date}>{dateText(day.date)}</time><strong>{day.title}</strong>{day.status === "run-recorded" || day.status === "extra-run" ? <span className="g-done">Run gelogd · {day.actualKm?.toFixed(1).replace(".", ",")} km</span> : day.status === "adjusted" ? <span className="g-adjusted">Vandaag aangepast</span> : null}</div><p>{day.detail}</p></li>)}</ol></section>)}</div>
        </section>
        <section className="g-race"><span className="c-overline">WEDSTRIJDDAG</span><div><h2>{dateText(plan.raceDay.date)} · {plan.raceDay.title}</h2><p>{plan.raceDay.detail}</p></div><strong>{plan.targetPace} /km</strong></section>
      </>}
    </>}
    <footer className="c-footer">PULSE / JOUW HARDLOOPCOACH <span>Strava × Apple Health</span></footer>
  </main></div>;
}
