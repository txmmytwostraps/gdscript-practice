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
// "Today" can be overridden for testing with ?today=YYYY-MM-DD (kept for the
// tab in sessionStorage), so tomorrow's reviews can be checked today.
export function today() {
  try { const o = sessionStorage.getItem("gdp.today"); if (o) return new Date(o + "T12:00:00"); } catch (e) {}
  return new Date();
}
export const dayKey = (d = today()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function solvesOn(key) { return Object.entries(state.solved).filter(([, iso]) => dayKey(new Date(iso)) === key).map(([id]) => id); }

// ---- settings (course lock, daily set size) ----
// settings.js owns them and keeps the account in step; this reads the local copy.
const settingsCopy = () => store.get("settings", null) || {};
export function courseLock() { const v = settingsCopy().course_lock; return v == null ? store.get("courseLock", DEFAULT_COURSE_LOCK) : v; }
export function newPerDay() { const v = settingsCopy().new_per_day; return v == null ? store.get("newPerDay", NEW_PER_DAY) : v; }

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
// Milestones: unlocked once every topic up to `after` is cleared; built in
// steps whose ids (m1-s1 …) live in the solved map like problems do, so they
// sync with the account for free.
export function milestoneStatus(m) {
  const all = routeTopics();
  const idx = all.findIndex((t) => t.concept === m.after);
  const before = all.slice(0, idx + 1).filter((t) => t.total > 0);
  const topicsToGo = before.filter((t) => t.done < t.total).length;
  const stepIds = Array.from({ length: m.steps }, (_, i) => `${m.id}-s${i + 1}`);
  const stepsDone = stepIds.filter((id) => state.solved[id]).length;
  const done = !m.planned && stepsDone === m.steps;
  const doneAt = done ? stepIds.map((id) => state.solved[id]).sort().slice(-1)[0] : null;
  return { ...m, unlocked: topicsToGo === 0, topicsToGo, stepIds, stepsDone, done, doneAt, godotDone: !!state.solved[`${m.id}-godot`] };
}
export function milestones() { return MILESTONES.map(milestoneStatus); }
export function nextMilestone() {
  const list = milestones();
  return list.find((m) => !m.done) || null;
}
export function markerFor(t) { return t.locked ? "[#]" : t.done === t.total && t.total > 0 ? "✓" : t.done > 0 ? "[>]" : "[ ]"; }

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
    run = { day: key, topic: t ? t.concept : null, topicTitle: t ? t.title : "", newIds: unsolved.slice(0, newPerDay()).map((p) => p.id), extraId: unsolved[newPerDay()] ? unsolved[newPerDay()].id : null, reviews: [] };
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
  if (run && run.done !== undefined) return run.done;   // set by the Today page once reviews are counted
  if (run) return run.newIds.length > 0 && run.newIds.every((id) => state.solved[id]) && (!run.extraId || state.solved[run.extraId]);
  return solvesOn(key).length >= newPerDay() + 1;   // a day worked on another machine
}
// A day is active when it has at least one solve or one review. The streak
// counts consecutive active days ending today or yesterday; nothing else.
export function activeDays() {
  const days = new Set(Object.values(state.solved).map((iso) => dayKey(new Date(iso))));
  for (const r of Object.values(store.get("reviews", {}))) if (r.reviewed_at) days.add(dayKey(new Date(r.reviewed_at)));
  return days;
}
// Days with a full run, read from the account tables so every machine and
// the phone agree. A full run on a day means all three parts of the run:
//  1. every review due that day was done (problems capped at 6 a day, cards
//     at 4: a day whose reviews were capped counts once the capped set is
//     done). A review row still carrying that day's due date was not done;
//  2. the daily set of new problems was solved, or the topic was cleared;
//  3. a milestone step was solved that day, or one more problem beyond the
//     set, or the topic was cleared (nothing more to solve in it).
const REVIEW_CAP_DAY = 6, CARD_CAP_DAY = 4;
export function fullRunDays() {
  const perDay = newPerDay();
  const solvesBy = {}, stepsBy = new Set();
  for (const [id, iso] of Object.entries(state.solved)) {
    const k = dayKey(new Date(iso));
    if (/^m\d+-s\d+$/.test(id)) stepsBy.add(k);
    else if (state.byId.size === 0 || state.byId.has(id)) (solvesBy[k] = solvesBy[k] || []).push(id);
  }
  const cleared = new Set();
  for (const t of TOPICS) { const st = topicStats(t); if (st.clearedAt) cleared.add(dayKey(new Date(st.clearedAt))); }
  const rows = Object.values(store.get("reviews", {}));
  const isCard = (r) => String(r.problem_id).startsWith("card:");
  const reviewsOk = (k, card) => {
    const mine = rows.filter((r) => isCard(r) === card);
    const done = mine.filter((r) => r.reviewed_at && dayKey(new Date(r.reviewed_at)) === k).length;
    const left = mine.filter((r) => r.due_on === k && !(r.reviewed_at && dayKey(new Date(r.reviewed_at)) === k)).length;
    return left === 0 || done >= (card ? CARD_CAP_DAY : REVIEW_CAP_DAY);
  };
  const days = new Set([...Object.keys(solvesBy), ...stepsBy, ...cleared]);
  const full = new Set();
  for (const k of days) {
    const n = (solvesBy[k] || []).length;
    const setDone = n >= perDay || cleared.has(k);
    const thirdDone = stepsBy.has(k) || n >= perDay + 1 || cleared.has(k);
    if (setDone && thirdDone && reviewsOk(k, false) && reviewsOk(k, true)) full.add(k);
  }
  return full;
}
const shiftKey = (key, n) => { const d = new Date(key + "T12:00:00"); d.setDate(d.getDate() + n); return dayKey(d); };
const mondayOf = (key) => { const d = new Date(key + "T12:00:00"); return shiftKey(key, -((d.getDay() + 6) % 7)); };

// The streak, walked day by day from the first active day to today:
//  - an active day (a solve or a review) extends the streak;
//  - a full run earns one rest day, at most one held at a time, once a week;
//  - a missed day spends the held rest day and the streak survives it, or
//    ends the streak when none is held. Today never counts as missed.
// Everything here comes from the account (solves, reviews, the daily set), so
// the phone computes the same answer.
export function streakInfo(now = today()) {
  const active = activeDays();
  const full = fullRunDays();
  const todayK = dayKey(now);
  const keys = [...active].filter((k) => k <= todayK).sort();
  const result = { current: 0, longest: 0, rest: 0, restEarnedWeek: null, days: {} };
  if (!keys.length) return result;
  let streak = 0, rest = 0, earnedWeek = null;
  for (let k = keys[0]; k <= todayK; k = shiftKey(k, 1)) {
    if (active.has(k)) {
      streak += 1;
      const week = mondayOf(k);
      if (full.has(k) && rest < 1 && earnedWeek !== week) { rest = 1; earnedWeek = week; result.days[k] = "earned"; }
      else result.days[k] = "active";
    } else if (k === todayK) {
      result.days[k] = "today";   // still open: nothing is decided yet
    } else if (rest > 0) {
      rest = 0; result.days[k] = "rested";   // the held rest day covers it
    } else {
      streak = 0; result.days[k] = "missed";
    }
    if (streak > result.longest) result.longest = streak;
  }
  result.current = streak;
  result.rest = rest;
  result.restEarnedWeek = earnedWeek;
  return result;
}
export function streakDays() { return streakInfo().current; }
/** The last seven days, oldest first, each with its state for the row on Today. */
export function weekRow(now = today()) {
  const info = streakInfo(now);
  const todayK = dayKey(now);
  return Array.from({ length: 7 }, (_, i) => { const k = shiftKey(todayK, i - 6); return { key: k, state: info.days[k] || (k === todayK ? "today" : "missed"), isToday: k === todayK }; });
}
// Full daily runs finished, all time. Separate from the streak on purpose: the
// streak survives a light day, this number only grows on a complete one.
export function runsCompleted() { return fullRunDays().size; }   // account data only, the same on every machine
// ---- XP and level ----
// The rule, in one place, from account data only (the progress, reviews and
// attempts tables), so every machine and the phone compute the same numbers:
//  - 10 XP for the first solve of a problem: a solved_at in the progress table;
//  - 5 XP for a review done on the day it was due: an attempts row of kind
//    "review" with result "pass", counted once per problem per day. A review
//    done after its due day is logged as "review-late" and earns nothing;
//  - 50 XP for a milestone step: a solved_at on a step id such as m1-s1;
//  - practice-again, drills, variants and late reviews earn 0.
//  Level = 1 + floor(XP / 500).
export const XP_PROBLEM = 10, XP_REVIEW = 5, XP_STEP = 50, XP_PER_LEVEL = 500;
export function xpInfo() {
  let problems = 0, steps = 0;
  for (const id of Object.keys(state.solved)) {
    if (/^m\d+-s\d+$/.test(id)) steps += 1;
    else if (state.byId.size === 0 ? !/^m\d+-/.test(id) : state.byId.has(id)) problems += 1;
  }
  const seen = new Set();
  for (const a of store.get("attempts", [])) if (a.kind === "review" && a.result === "pass") seen.add(a.problem_id + "@" + dayKey(new Date(a.at)));
  const xp = problems * XP_PROBLEM + seen.size * XP_REVIEW + steps * XP_STEP;
  const level = 1 + Math.floor(xp / XP_PER_LEVEL);
  return { xp, level, problems, reviews: seen.size, steps, into: xp % XP_PER_LEVEL, toNext: XP_PER_LEVEL - (xp % XP_PER_LEVEL) };
}
export function level() { return xpInfo().level; }
/** "Level N · 120 XP" with a thin bar to the next level. */
export function xpHtml() {
  const x = xpInfo();
  return `<span class="xp" title="${x.toNext} XP to level ${x.level + 1}">Level <b>${x.level}</b> · <b>${x.xp}</b> XP<span class="xpbar"><i style="width: ${Math.round(100 * x.into / XP_PER_LEVEL)}%"></i></span></span>`;
}

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
  const s = streakInfo();
  el.innerHTML = `<span>Streak <b class="accent">${s.current}</b><span class="dim"> · best ${s.longest}</span></span>${xpHtml()}<span>Course <b>L${courseLock()}</b></span>`;
}
