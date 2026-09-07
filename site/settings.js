// Settings: course lock, daily set size, hint level overrides. They live in
// the account (settings table, one row per user) so every machine shows the
// same; localStorage holds a copy for offline use and for signed-out use.
// On sign-in the newer of the two copies wins.
import * as auth from "./auth.js";
import { store } from "./progress.js";
import { DEFAULT_COURSE_LOCK, NEW_PER_DAY } from "./route-data.js";

const KEY = "settings";
let data = store.get(KEY, null);
if (!data) {
  // First run on this browser: pick up the old per-key values, if any.
  const oldScaffold = store.get("scaffold", null);
  data = { course_lock: store.get("courseLock", null), new_per_day: store.get("newPerDay", null), hint_overrides: (oldScaffold && oldScaffold.override) || {}, updated_at: store.get("courseLock", null) !== null || store.get("newPerDay", null) !== null ? new Date().toISOString() : null };
  store.set(KEY, data);
}
const persist = () => store.set(KEY, data);
let user = null;
export function setUser(u) { user = u; }

export function courseLock() { return data.course_lock ?? DEFAULT_COURSE_LOCK; }
export function newPerDay() { return data.new_per_day ?? NEW_PER_DAY; }
export function hintOverrides() { return data.hint_overrides || {}; }

async function save(patch) {
  data = { ...data, ...patch, updated_at: new Date().toISOString() };
  persist();
  if (user && auth.enabled) { try { await auth.upsertSettings(user.id, data); } catch (e) { /* stays local until the next sync */ } }
}
export function setCourseLock(n) { return save({ course_lock: Number(n) }); }
export function setNewPerDay(n) { return save({ new_per_day: Math.max(1, Math.min(10, Number(n) || NEW_PER_DAY)) }); }
export function setHintOverride(concept, level) {
  const o = { ...hintOverrides() };
  if (level) o[concept] = level; else delete o[concept];
  return save({ hint_overrides: o });
}

/** Pull the account row; the newer copy wins, and the other side is updated. */
export async function merge(u) {
  user = u;
  if (!u || !auth.enabled) return;
  const remote = await auth.fetchSettings();
  if (remote && (!data.updated_at || (remote.updated_at || "") > data.updated_at)) {
    data = { course_lock: remote.course_lock, new_per_day: remote.new_per_day, hint_overrides: remote.hint_overrides || {}, updated_at: remote.updated_at };
    persist();
  } else if (data.updated_at && (!remote || (remote.updated_at || "") < data.updated_at)) {
    await auth.upsertSettings(u.id, data);
  }
}
