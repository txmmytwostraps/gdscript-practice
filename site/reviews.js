// Spaced review. The queue lives in the account (reviews table); a copy is
// cached locally for display. Rules:
//  - when a topic is completed (every problem solved) it enters a fresh week:
//    two of its problems are due each day, rotating through the topic;
//  - after its fresh review a problem moves to standard spacing: due again
//    after 3, 7, 14, then 30 days, extended on each clean solve;
//  - a miss on any review pulls the problem back to daily until it is
//    solved cleanly twice;
//  - at most 6 reviews a day; oldest due first, the rest roll over.
import * as auth from "./auth.js";
import { state, store, dayKey, today } from "./progress.js";
import { TOPICS } from "./route-data.js";
import { loadCards, cardsForConcept, cardId, isCardId } from "./cards.js";

export const REVIEW_CAP = 6;
const SPACING = [3, 7, 14, 30];

let rows = store.get("reviews", {});   // { problem_id: row }

export function all() { return rows; }
export function isInReview(id) { return Boolean(rows[id]); }

const addDays = (key, n) => { const d = new Date(key + "T12:00:00"); d.setDate(d.getDate() + n); return dayKey(d); };

/** Pull the queue from the account into the local cache. */
export async function refresh() {
  if (!auth.enabled) return rows;
  rows = await auth.fetchReviews();
  store.set("reviews", rows);
  return rows;
}

/** Everything due on or before the given day, oldest first (uncapped). Problems only. */
export function due(day = dayKey(today())) {
  return Object.values(rows).filter((r) => !isCardId(r.problem_id) && r.due_on <= day).sort((a, b) => a.due_on.localeCompare(b.due_on) || a.problem_id.localeCompare(b.problem_id));
}
/** The day's review list: at most REVIEW_CAP, plus the ones already reviewed today. */
export function dueToday(day = dayKey(today())) {
  const doneToday = Object.values(rows).filter((r) => !isCardId(r.problem_id) && r.reviewed_at && dayKey(new Date(r.reviewed_at)) === day);
  const pending = due(day).slice(0, Math.max(0, REVIEW_CAP - doneToday.length));
  return { pending, doneToday, rolled: Math.max(0, due(day).length - pending.length) };
}

// ---- concept cards: same rules, their own daily cap ----
export const CARD_CAP = 4;
export function cardsDue(day = dayKey(today())) {
  return Object.values(rows).filter((r) => isCardId(r.problem_id) && r.due_on <= day).sort((a, b) => a.due_on.localeCompare(b.due_on) || a.problem_id.localeCompare(b.problem_id));
}
export function cardsDueToday(day = dayKey(today())) {
  const doneToday = Object.values(rows).filter((r) => isCardId(r.problem_id) && r.reviewed_at && dayKey(new Date(r.reviewed_at)) === day);
  const pending = cardsDue(day).slice(0, Math.max(0, CARD_CAP - doneToday.length));
  return { pending, doneToday, rolled: Math.max(0, cardsDue(day).length - pending.length) };
}
/** Once a topic has its first solve, its concept cards enter the queue, due from tomorrow. */
export async function scheduleCardsIfStarted(user, concept) {
  if (!user) return false;
  const list = state.problems.filter((p) => p.concept === concept);
  if (list.length === 0 || !list.some((p) => state.solved[p.id])) return false;
  await loadCards();
  const cards = cardsForConcept(concept).filter((c) => !rows[cardId(c)]);
  if (!cards.length) return false;
  const start = dayKey(today());
  const newRows = cards.map((c, i) => ({
    user_id: user.id, problem_id: cardId(c), topic: c.concept, stage: "fresh",
    due_on: addDays(start, Math.floor(i / CARD_CAP) + 1), step: 0, clean_streak: 0,
  }));
  await auth.upsertReviews(newRows);
  for (const r of newRows) rows[r.problem_id] = r;
  store.set("reviews", rows);
  return true;
}

/** If every problem of the topic is solved and it is not scheduled yet, start its fresh week. */
export async function scheduleTopicIfCleared(user, concept) {
  if (!user) return false;
  const list = state.problems.filter((p) => p.concept === concept);
  if (list.length === 0 || list.some((p) => !state.solved[p.id])) return false;
  if (Object.values(rows).some((r) => r.topic === concept)) return false;
  const start = dayKey(today());
  const newRows = list.map((p, i) => ({
    user_id: user.id, problem_id: p.id, topic: concept, stage: "fresh",
    due_on: addDays(start, Math.floor(i / 2) + 1), step: 0, clean_streak: 0,
  }));
  await auth.upsertReviews(newRows);
  for (const r of newRows) rows[r.problem_id] = r;
  store.set("reviews", rows);
  return true;
}

/** Record the outcome of a review. clean = passed on the first run of this review. */
export async function recordResult(user, problemId, passed, clean) {
  const r = rows[problemId];
  if (!user || !r) return;
  const day = dayKey(today());
  const next = { ...r, reviewed_at: new Date().toISOString(), last_result: passed ? "pass" : "miss" };
  if (!passed || !clean) {
    next.stage = "relearn"; next.clean_streak = 0; next.due_on = addDays(day, 1);
  } else if (r.stage === "relearn") {
    next.clean_streak = (r.clean_streak || 0) + 1;
    if (next.clean_streak >= 2) { next.stage = "spaced"; next.step = 0; next.clean_streak = 0; next.due_on = addDays(day, SPACING[0]); }
    else next.due_on = addDays(day, 1);
  } else if (r.stage === "fresh") {
    next.stage = "spaced"; next.step = 0; next.due_on = addDays(day, SPACING[0]);
  } else {
    next.step = (r.step || 0) + 1;
    const base = SPACING[Math.min(next.step, SPACING.length - 1)];
    const interval = Math.min(90, next.step >= SPACING.length ? base * Math.pow(2, next.step - SPACING.length + 1) : base);
    next.due_on = addDays(day, interval);
  }
  await auth.upsertReviews([{ user_id: user.id, problem_id: problemId, topic: next.topic, stage: next.stage, due_on: next.due_on, step: next.step, clean_streak: next.clean_streak, last_result: next.last_result, reviewed_at: next.reviewed_at }]);
  rows[problemId] = next;
  store.set("reviews", rows);
}

export function topicTitle(concept) { const t = TOPICS.find((x) => x.concept === concept); return t ? t.title : concept; }
