// Shared progress state for every page: what is solved, failed, drafted,
// the day's run, the streak, and the position on the route. localStorage is
// the working copy; auth.js/app.js keep the account in step.
import { TOPICS, MILESTONES, DEFAULT_COURSE_LOCK, NEW_PER_DAY } from "./route-data.js";
import { loadIndex } from "./problems.js";

export const store = {
  get(key, fallback) { try { const v = localStorage.getItem("gdp." + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
  set(key, value) { try { localStorage.setItem("gdp." + key, JSON.stringify(value)); } catch (e) {} },
  remove(key) { try { localStorage.removeItem("gdp." + key); } catch (e) {} },
  keys(prefix) { try { return Object.keys(localStorage).filter((k) => k.startsWith("gdp." + prefix)).map((k) => k.slice(4)); } catch (e) { return []; } },
};

export const state = {
  solved: store.get("solved", {}),   // { id: ISO date }
  fails: store.get("fails", {}),     // { id: count }
  problems: [],                      // from index.json
  byId: new Map(),
};

export async function loadBank() {
  const index = await loadIndex();
  state.problems = index.problems;
  state.byId = new Map(index.problems.map((p) => [p.id, p]));
  return index;
}

export function saveSolved() { store.set("solved", state.solved); }
export function saveFails() { store.set("fails", state.fails); }

// ---- drafts: gdp.draft.<id> = { code, at } ----
export function getDraft(id) {
  const d = store.get("draft." + id, null);
  if (d && typeof d === "object") return d;
  const old = store.get("code." + id, null);
  if (typeof old === "string") { const conv = { code: old, at: new Date().toISOString() }; store.set("draft." + id, conv); store.remove("code." + id); return conv; }
  return null;
}
export function setDraft(id, code) { const d = { code, at: new Date().toISOString() }; store.set("draft." + id, d); return d; }
export function clearDraft(id) { store.remove("draft." + id); store.remove("code." + id); }

// ---- dates ----
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function solvesOn(key) { return Object.entries(state.solved).filter(([, iso]) => dayKey(new Date(iso)) === key).map(([id]) => id); }

// ---- course lock ----
export function courseLock() { return store.get("courseLock", DEFAULT_COURSE_LOCK); }
export function setCourseLock(n) { store.set("courseLock", n); }

// ---- topics on the route ----
export function topicStats(t) {
  const list = state.problems.filter((p) => p.concept === t.concept);
  const done = list.filter((p) => state.solved[p.id]);
  const clearedAt = done.length && done.length === list.length ? done.map((p) => state.solved[p.id]).sort().slice(-1)[0] : null;
  return { total: list.length, done: done.length, clearedAt, locked: t.lesson > courseLock(), list };
}
export function routeTopics() { return TOPICS.map((t) => ({ ...t, ...topicStats(t) })); }
export function currentTopic() {
  const all = routeTopics();
  return all.find((t) => !t.locked && t.total > 0 && t.done < t.total) || all.filter((t) => t.total > 0).slice(-1)[0];
}
export function nextMilestone() {
  const all = routeTopics();
  for (const m of MILESTONES) {
    const idx = all.findIndex((t) => t.concept === m.after);
    const before = all.slice(0, idx + 1);
    const unlocked = before.every((t) => t.total === 0 || t.done === t.total);
    return { ...m, unlocked, topicsToGo: before.filter((t) => t.total > 0 && t.done < t.total).length };
  }
  return null;
}
export function markerFor(t) { return t.locked ? "[#]" : t.done === t.total && t.total > 0 ? "[x]" : t.done > 0 ? "[>]" : "[ ]"; }

// ---- the daily run ----
// Assigned once per day and kept, so the numbers do not shift while you work:
// N new problems from the current topic (the next unsolved ones in order),
// plus one extra problem as the third slot until milestones exist.
export function todayRun() {
  const key = dayKey();
  let run = store.get("run." + key, null);
  if (!run) {
    const t = currentTopic();
    const unsolved = t ? t.list.filter((p) => !state.solved[p.id]) : [];
    run = { day: key, topic: t ? t.concept : null, topicTitle: t ? t.title : "", newIds: unsolved.slice(0, NEW_PER_DAY).map((p) => p.id), extraId: unsolved[NEW_PER_DAY] ? unsolved[NEW_PER_DAY].id : null, reviews: [] };
    store.set("run." + key, run);
  }
  const solvedToday = new Set(solvesOn(key));
  const newDone = run.newIds.filter((id) => state.solved[id]).length;
  const extraDone = run.extraId ? Boolean(state.solved[run.extraId]) : run.newIds.length > 0;
  const reviewsDone = true;   // no reviews until the review queue exists
  const keepGoing = [...solvedToday].filter((id) => !run.newIds.includes(id) && id !== run.extraId).length;
  const slots = [
    { n: "01", title: "REVIEW", detail: "no reviews yet", done: reviewsDone, kind: "review" },
    { n: "02", title: `${run.topicTitle.toUpperCase()} · ${run.newIds.length} NEW`, detail: positionText(run), done: run.newIds.length > 0 && newDone === run.newIds.length, kind: "new", progress: [newDone, run.newIds.length] },
    { n: "03", title: run.extraId ? "ONE MORE TOPIC PROBLEM" : "ALL TOPIC PROBLEMS DONE", detail: run.extraId ? "milestones come later; one extra for today" : "pick the next topic on the route", done: extraDone, kind: "extra" },
  ];
  const doneCount = slots.filter((s) => s.done).length;
  return { ...run, slots, doneCount, allDone: doneCount === slots.length, newDone, keepGoing, minutes: minutesToday() };
}
function positionText(run) {
  if (!run.topic || run.newIds.length === 0) return "nothing left in this topic";
  const list = state.problems.filter((p) => p.concept === run.topic);
  const first = list.findIndex((p) => p.id === run.newIds[0]) + 1;
  const last = list.findIndex((p) => p.id === run.newIds[run.newIds.length - 1]) + 1;
  return `problems ${String(first).padStart(2, "0")}–${String(last).padStart(2, "0")} of ${list.length}`;
}
export function dayDone(key) {
  const run = store.get("run." + key, null);
  if (run) return run.newIds.length > 0 && run.newIds.every((id) => state.solved[id]) && (!run.extraId || state.solved[run.extraId]);
  return solvesOn(key).length >= NEW_PER_DAY + 1;   // a day worked on another machine
}
export function streakDays() {
  let count = 0;
  const day = new Date();
  if (!dayDone(dayKey(day))) day.setDate(day.getDate() - 1);
  while (dayDone(dayKey(day))) { count++; day.setDate(day.getDate() - 1); }
  return count;
}
export function level() { return routeTopics().filter((t) => !t.extra && t.total > 0 && t.done === t.total).length + 1; }

// ---- time spent today (only while a page is open and visible) ----
export function minutesToday() { return Math.round((store.get("time." + dayKey(), 0)) / 60); }
export function trackTime() {
  let last = Date.now();
  const tick = () => {
    const now = Date.now();
    if (document.visibilityState === "visible") store.set("time." + dayKey(), store.get("time." + dayKey(), 0) + Math.min(60, (now - last) / 1000));
    last = now;
  };
  setInterval(tick, 30000);
  document.addEventListener("visibilitychange", () => { last = Date.now(); });
}

// ---- header ----
export function renderHeaderStats(el) {
  if (!el) return;
  el.innerHTML = `<span>Streak <b class="accent">${streakDays()}</b></span><span>Level <b>${level()}</b></span><span>Course <b>L${courseLock()}</b></span>`;
}
