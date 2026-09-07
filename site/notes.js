// Notes: one per problem, "what I don't get / what I missed". The local copy
// is the working copy; when signed in every save also goes to the notes
// table, and on sign-in the newer of the two versions wins per problem.
import * as auth from "./auth.js";
import { store } from "./progress.js";

let rows = store.get("notes", {});   // { problem_id: { text, resolved, updated_at } }

export function all() { return rows; }
export function get(id) { return rows[id] || null; }
/** Notes with text, unresolved first, newest first within each group. */
export function list() {
  return Object.entries(rows).filter(([, n]) => n.text && n.text.trim()).map(([problem_id, n]) => ({ problem_id, ...n }))
    .sort((a, b) => Number(a.resolved) - Number(b.resolved) || (b.updated_at || "").localeCompare(a.updated_at || ""));
}
const persist = () => store.set("notes", rows);

/** Change the text and/or the resolved flag; saves locally and to the account. */
export async function save(user, id, patch) {
  const cur = rows[id] || { text: "", resolved: false };
  const next = { text: cur.text, resolved: cur.resolved, ...patch, updated_at: new Date().toISOString() };
  rows[id] = next; persist();
  if (user && auth.enabled) await auth.upsertNotes([{ user_id: user.id, problem_id: id, text: next.text, resolved: next.resolved, updated_at: next.updated_at }]);
}

/** Pull the account's notes and reconcile: the newer version of each wins. */
export async function merge(user) {
  if (!user || !auth.enabled) return;
  const remote = await auth.fetchNotes();
  const toUpload = [];
  for (const id of new Set([...Object.keys(rows), ...Object.keys(remote)])) {
    const l = rows[id], r = remote[id];
    if (r && (!l || (r.updated_at || "") > (l.updated_at || ""))) rows[id] = { text: r.text, resolved: r.resolved, updated_at: r.updated_at };
    else if (l && (!r || (l.updated_at || "") > (r.updated_at || ""))) toUpload.push({ user_id: user.id, problem_id: id, text: l.text, resolved: l.resolved, updated_at: l.updated_at });
  }
  persist();
  if (toUpload.length) await auth.upsertNotes(toUpload);
}
