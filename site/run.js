// The day's run as one sitting: reviews due today, then the new problems,
// then the extra. Each part knows what is done; the practice page walks the
// items in order and the Run done page sums them up.
import { state, todayRun, dayKey, today, XP_PROBLEM, XP_REVIEW } from "./progress.js";
import * as reviews from "./reviews.js";

export function runPlan() {
  const run = todayRun();
  const q = reviews.dueToday();
  const doneReview = new Set(q.doneToday.map((r) => r.problem_id));
  const reviewIds = [...q.doneToday.map((r) => r.problem_id), ...q.pending.map((r) => r.problem_id)];
  const parts = [
    { kind: "review", title: "Reviews", ids: reviewIds, done: reviewIds.filter((id) => doneReview.has(id)).length, xpEach: XP_REVIEW },
    { kind: "new", title: run.topicTitle ? `${run.topicTitle} · new` : "New problems", ids: run.newIds, done: run.newIds.filter((id) => state.solved[id]).length, xpEach: XP_PROBLEM },
    { kind: "extra", title: "One more", ids: run.extraId ? [run.extraId] : [], done: run.extraId && state.solved[run.extraId] ? 1 : 0, xpEach: XP_PROBLEM },
  ];
  const items = parts.flatMap((p) => p.ids.map((id) => ({ id, kind: p.kind, done: p.kind === "review" ? doneReview.has(id) : Boolean(state.solved[id]) })));
  const total = items.length, doneCount = items.filter((i) => i.done).length;
  const next = items.find((i) => !i.done) || null;
  const cards = reviews.cardsDueToday();
  return { run, parts, items, total, doneCount, next, allDone: total > 0 && doneCount === total, cardsDue: cards.pending.length, day: dayKey(today()) };
}
