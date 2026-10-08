import type { RunLesson } from "@/lib/run-lesson";

export function RunLessonCard({ lesson, compact = false }: { lesson: RunLesson; compact?: boolean }) {
  return <article className={`c-run-lesson ${lesson.tone}${compact ? " compact" : ""}`}>
    <span className="c-overline">DE LES VAN DEZE LOOP</span>
    <h3>{lesson.headline}</h3>
    <p>{lesson.meaning}</p>
    <div className="c-run-lesson-grid">
      <div className="keep"><strong>Blijf dit doen</strong><p>{lesson.keep}</p></div>
      <div className="improve"><strong>Verbeter dit</strong><p>{lesson.improve}</p></div>
    </div>
    <p className="c-run-lesson-next"><strong>Je volgende loop:</strong> {lesson.nextRun}</p>
  </article>;
}
