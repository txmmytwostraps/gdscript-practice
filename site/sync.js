// Account sync. Local storage is always the working copy. When signed in,
// every change is also written to the progress table, and on sign-in the two
// are MERGED: solves are a union (earliest date kept), fail counts take the
// larger, drafts take whichever was edited last. A sync never deletes.
import * as auth from "./auth.js";
import { state, store, getDraft, saveSolved, saveFails } from "./progress.js";
import * as reviews from "./reviews.js";
import * as notes from "./notes.js";

const listeners = [];
export function onSynced(fn) { listeners.push(fn); }
function notify(what) { for (const fn of listeners) fn(what); }

export const sync = {
  user: null,
  pending: new Set(),
  timer: null,
  note: (text) => { const n = document.getElementById("account-note"); if (n) { n.textContent = text; n.hidden = !text; } },
  rowFor(id) {
    const d = getDraft(id);
    return { problem_id: id, solved_at: state.solved[id] || null, fails: state.fails[id] || 0, draft: d ? d.code : null, draft_updated_at: d ? d.at : null };
  },
  push(id) {
    if (!this.user) return;
    this.pending.add(id);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 800);
  },
  async flush() {
    if (!this.user || this.pending.size === 0) return;
    const ids = [...this.pending]; this.pending.clear();
    try { await auth.upsertProgress(this.user.id, ids.map((id) => this.rowFor(id))); this.note(""); }
    catch (e) { ids.forEach((id) => this.pending.add(id)); this.note("Could not save to your account: " + e.message); }
  },
  async setUser(u) {
    const was = this.user && this.user.id;
    this.user = u;
    notify("user");
    if (u && u.id !== was) {
      try { await this.mergeOnLogin(); } catch (e) { this.note("Sync failed: " + e.message); }
    }
  },
  async mergeOnLogin() {
    this.note("Syncing…");
    const remote = await auth.fetchProgress();
    const ids = new Set([...Object.keys(remote), ...Object.keys(state.solved), ...Object.keys(state.fails)]);
    for (const key of store.keys("draft.")) ids.add(key.slice(6));
    for (const key of store.keys("code.")) ids.add(key.slice(5));
    const toUpload = [];
    let changedLocal = false;
    for (const id of ids) {
      const r = remote[id] || {};
      const localDraft = getDraft(id);
      const dates = [state.solved[id], r.solved_at].filter(Boolean).sort();
      const solvedAt = dates[0] || null;
      const failCount = Math.max(state.fails[id] || 0, r.fails || 0);
      let draft = localDraft;
      if (r.draft && (!localDraft || (r.draft_updated_at || "") > (localDraft.at || ""))) draft = { code: r.draft, at: r.draft_updated_at };
      if (solvedAt && state.solved[id] !== solvedAt) { state.solved[id] = solvedAt; changedLocal = true; }
      if (failCount !== (state.fails[id] || 0)) { state.fails[id] = failCount; changedLocal = true; }
      if (draft && (!localDraft || draft.code !== localDraft.code)) { store.set("draft." + id, draft); changedLocal = true; }
      const remoteDraftAt = r.draft_updated_at || null;
      if ((r.solved_at || null) !== solvedAt || (r.fails || 0) !== failCount || (r.draft || null) !== (draft ? draft.code : null) || (draft && remoteDraftAt !== draft.at)) {
        toUpload.push({ problem_id: id, solved_at: solvedAt, fails: failCount, draft: draft ? draft.code : null, draft_updated_at: draft ? draft.at : null });
      }
    }
    saveSolved(); saveFails();
    if (toUpload.length) await auth.upsertProgress(this.user.id, toUpload);
    // The review queue lives only in the account: pull it, then schedule any
    // topic that turned out to be complete (a solve from the other machine).
    try {
      await reviews.refresh();
      for (const concept of new Set(state.problems.map((p) => p.concept))) { await reviews.scheduleTopicIfCleared(this.user, concept); await reviews.scheduleCardsIfStarted(this.user, concept); }
    } catch (e) { this.note("Reviews unavailable: " + e.message); }
    try { await notes.merge(this.user); } catch (e) { this.note("Notes unavailable: " + e.message); }
    this.note(toUpload.length ? `Synced: ${toUpload.length} problem${toUpload.length === 1 ? "" : "s"} updated in your account.` : "Synced.");
    notify(changedLocal ? "local-changed" : "merged");
  },
};

/** Export everything local as one JSON object. */
export function exportProgress() {
  const drafts = {};
  for (const key of store.keys("draft.")) drafts[key.slice(6)] = store.get(key, null);
  return { exported_at: new Date().toISOString(), solved: state.solved, fails: state.fails, drafts };
}

/** Wipe local progress; when signed in, also delete the account rows. */
export async function clearProgress() {
  for (const key of store.keys("")) if (!key.startsWith("filters") && !key.startsWith("courseLock")) store.remove(key);
  state.solved = {}; state.fails = {};
  if (sync.user) await auth.deleteAllProgress(sync.user.id);
  notify("local-changed");
}
