import type { RunLesson } from "@/lib/run-lesson";

export function RunLessonCard({ lesson, compact = false }: { lesson: RunLesson; compact?: boolean }) {
  return <article className={`c-run-lesson ${lesson.tone}${compact ? " compact" : ""}`}>
    <span className="c-overline">DE LES</span>
    <h3>{lesson.headline}</h3>
    <p>{lesson.meaning}</p>
    <div className="c-run-lesson-grid">
      <div className="keep"><strong>Houd vast</strong><p>{lesson.keep}</p></div>
      <div className="improve"><strong>Verbeter</strong><p>{lesson.improve}</p></div>
    </div>
  </article>;
}
