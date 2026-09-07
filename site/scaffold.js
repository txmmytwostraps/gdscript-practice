// Adaptive hints. Each topic has a scaffold level worked out from the
// rolling pass rate of its last 20 attempts:
//   full     every hint opens on request; the reference solution after 2 misses
//   reduced  hint 1 opens on request, the rest after a miss on the problem
//   minimal  hints stay closed until 2 misses; the solution needs 3
// The level rises one step when the rate passes 85% over at least 15
// attempts, and drops one step when it falls under 65% (at least 10). A
// change needs 15 new attempts before the next one. A hand-set override
// wins until it is cleared.
import * as auth from "./auth.js";
import { store, state } from "./progress.js";

export const LEVELS = ["full", "reduced", "minimal"];
const WINDOW = 20, RISE = 0.85, DROP = 0.65, MIN_RISE = 15, MIN_DROP = 10;

let data = store.get("scaffold", { auto: {}, override: {}, counts: {} });   // auto: { concept: { level, since } }
const persist = () => store.set("scaffold", data);

export function levelFor(concept) { return data.override[concept] || (data.auto[concept] ? data.auto[concept].level : "full"); }
export function autoLevel(concept) { return data.auto[concept] ? data.auto[concept].level : "full"; }
export function overrideFor(concept) { return data.override[concept] || ""; }
export function setOverride(concept, level) { if (level && LEVELS.includes(level)) data.override[concept] = level; else delete data.override[concept]; persist(); }
export function statsFor(concept) { return data.counts[concept] || { attempts: 0, rate: null }; }

/** Misses needed before the reference solution unlocks, by level. */
export const solutionAfter = (level) => (level === "minimal" ? 3 : 2);
/** Whether hint number `i` (0-based) may open, given the level and the misses on this problem. */
export function hintOpen(level, i, misses) {
  if (level === "full") return true;
  if (level === "reduced") return i === 0 || misses >= 1;
  return misses >= 2;
}
export function hintLockText(level, i) {
  if (level === "reduced") return "after a miss";
  return "after 2 misses";
}

/** Recompute every topic's automatic level from the attempt log. */
export function recompute(attempts) {
  const byTopic = {};
  for (const a of attempts) {
    const p = state.byId.get(a.problem_id); if (!p) continue;
    (byTopic[p.concept] = byTopic[p.concept] || []).push(a.result === "pass");
  }
  for (const [concept, results] of Object.entries(byTopic)) {
    const total = results.length;
    const recent = results.slice(-WINDOW);
    const rate = recent.filter(Boolean).length / recent.length;
    data.counts[concept] = { attempts: total, rate };
    const cur = data.auto[concept] || { level: "full", since: 0 };
    const idx = LEVELS.indexOf(cur.level);
    const fresh = total - cur.since;   // attempts since the last change
    if (fresh >= MIN_RISE && recent.length >= MIN_RISE && rate > RISE && idx < LEVELS.length - 1) data.auto[concept] = { level: LEVELS[idx + 1], since: total };
    else if (fresh >= MIN_DROP && recent.length >= MIN_DROP && rate < DROP && idx > 0) data.auto[concept] = { level: LEVELS[idx - 1], since: total };
    else if (!data.auto[concept]) data.auto[concept] = cur;
  }
  persist();
}

let cached = null;
/** Fetch the attempt log once per page and recompute. Returns the attempts. */
export async function refresh(user) {
  if (!user || !auth.enabled) return cached || [];
  try { cached = await auth.fetchAttempts(); recompute(cached); } catch (e) { /* keep the stored levels */ }
  return cached || [];
}
/** A verdict just happened on this page: fold it in without another fetch. */
export function noteAttempt(problemId, passed) {
  if (!cached) return;
  cached.push({ problem_id: problemId, kind: "session", result: passed ? "pass" : "miss", at: new Date().toISOString() });
  recompute(cached);
}
