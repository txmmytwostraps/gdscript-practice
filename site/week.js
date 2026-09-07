// The weekly summary: the last seven days as plain text, ending with the
// adjustments the numbers suggest. Nothing here changes a setting; the
// Route page does that.
import { mountShell } from "./shell.js";
import { onSynced, sync } from "./sync.js";
import * as reviews from "./reviews.js";
import * as notes from "./notes.js";
import * as scaffold from "./scaffold.js";
import * as auth from "./auth.js";
import { loadBank, state, store, routeTopics, streakDays, activeDays, dayDone, runsCompleted, newPerDay, dayKey, today } from "./progress.js";
import { loadCards, cardById, isCardId } from "./cards.js";
import { TOPICS } from "./route-data.js";

const $ = (id) => document.getElementById(id);
const pct = (n, d) => (d ? Math.round((100 * n) / d) + "%" : "–");
const lessonTag = (t) => `L${String(t.lesson).padStart(2, "0")}`;
let attempts = [];
let nudges = [];

function build() {
  const end = today(); const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(end); d.setDate(end.getDate() - i); days.push(dayKey(d)); }
  const from = days[0], to = days[6];
  const inWeek = (iso) => iso && dayKey(new Date(iso)) >= from && dayKey(new Date(iso)) <= to;
  const week = attempts.filter((a) => inWeek(a.at));
  const active = activeDays();
  const solvedWeek = Object.entries(state.solved).filter(([id, iso]) => state.byId.has(id) && inWeek(iso));
  const hintlog = store.get("hintlog", []).filter((h) => inWeek(h.at));
  const rows = Object.values(reviews.all());
  const out = [];
  out.push(`GDScript practice — week ${from} to ${to}`);
  out.push(`Streak ${streakDays()} · active days this week ${days.filter((k) => active.has(k)).length} of 7 · full runs this week ${days.filter(dayDone).length} (all time ${runsCompleted()}) · daily set ${newPerDay()}`);
  out.push(`Solved this week: ${solvedWeek.length} problems (${Object.keys(state.solved).filter((id) => state.byId.has(id)).length} of ${state.problems.length} overall)`);
  out.push("");

  // per topic
  out.push("Per topic (topics with activity this week)");
  const topics = routeTopics().filter((t) => t.total > 0);
  const topicLines = [];
  for (const t of topics) {
    const ids = new Set(t.list.map((p) => p.id));
    const a = week.filter((x) => ids.has(x.problem_id));
    const solves = solvedWeek.filter(([id]) => ids.has(id)).length;
    const hints = hintlog.filter((h) => ids.has(h.id)).length;
    const nudged = nudges.filter((x) => inWeek(x.at) && ids.has(x.problem_id)).length;
    if (!a.length && !solves && !hints && !nudged) continue;
    const misses = a.filter((x) => x.result === "miss").length;
    const st = scaffold.statsFor(t.concept);
    topicLines.push(`- ${t.title} (${lessonTag(t)}): attempts ${a.length}, solves ${solves}, misses ${misses}, pass rate ${pct(a.length - misses, a.length)}, hints opened ${hints}, nudges ${nudged}, hint level ${scaffold.levelFor(t.concept)}${scaffold.overrideFor(t.concept) ? " (set by hand)" : " (auto)"}${st.rate !== null ? `, rolling ${Math.round(st.rate * 100)}% over last ${Math.min(20, st.attempts)}` : ""}`);
  }
  out.push(...(topicLines.length ? topicLines : ["- no activity this week"]));
  out.push("");

  // reviews
  const done = rows.filter((r) => inWeek(r.reviewed_at));
  const pr = done.filter((r) => !isCardId(r.problem_id)), cr = done.filter((r) => isCardId(r.problem_id));
  out.push("Reviews");
  out.push(`- problems: ${pr.length} done, ${pr.filter((r) => r.last_result === "pass").length} passed, ${pr.filter((r) => r.last_result === "miss").length} missed`);
  out.push(`- concept cards: ${cr.length} done, ${cr.filter((r) => r.last_result === "pass").length} got it, ${cr.filter((r) => r.last_result === "miss").length} not yet`);
  out.push("");

  // notes
  const weekNotes = notes.list().filter((n) => inWeek(n.updated_at));
  out.push("Notes written this week (unresolved first)");
  out.push(...(weekNotes.length ? weekNotes.map((n) => { const p = state.byId.get(n.problem_id); return `- [${n.resolved ? "resolved" : "open"}] ${p ? p.title : n.problem_id}: ${n.text.trim().replace(/\s+/g, " ")}`; }) : ["- none"]));
  out.push("");

  // missed more than once
  const missCount = {};
  for (const a of week) if (a.result === "miss") missCount[a.problem_id] = (missCount[a.problem_id] || 0) + 1;
  const repeat = Object.entries(missCount).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  out.push("Problems missed more than once this week");
  out.push(...(repeat.length ? repeat.map(([id, n]) => { const p = state.byId.get(id); const t = p && TOPICS.find((x) => x.concept === p.concept); return `- ${p ? p.title : id}${t ? ` (${t.title}, ${lessonTag(t)})` : ""}: ${n} misses`; }) : ["- none"]));
  out.push("");

  // due next week
  out.push("Due next week");
  const nextDays = [];
  for (let i = 1; i <= 7; i++) { const d = new Date(end); d.setDate(end.getDate() + i); nextDays.push(dayKey(d)); }
  const overdue = rows.filter((r) => r.due_on <= to && !(r.reviewed_at && dayKey(new Date(r.reviewed_at)) === r.due_on));
  const dueLines = nextDays.map((k) => { const p = rows.filter((r) => r.due_on === k && !isCardId(r.problem_id)).length, c = rows.filter((r) => r.due_on === k && isCardId(r.problem_id)).length; return p || c ? `- ${k}: ${p} problem${p === 1 ? "" : "s"}, ${c} card${c === 1 ? "" : "s"}` : null; }).filter(Boolean);
  if (overdue.length) dueLines.unshift(`- already due: ${overdue.filter((r) => !isCardId(r.problem_id)).length} problems, ${overdue.filter((r) => isCardId(r.problem_id)).length} cards`);
  out.push(...(dueLines.length ? dueLines : ["- nothing scheduled"]));
  out.push("");

  // proposed adjustments
  out.push("Proposed adjustments");
  const props = [];
  for (const t of topics) {
    const st = scaffold.statsFor(t.concept); if (st.rate === null || scaffold.overrideFor(t.concept)) continue;
    const lv = scaffold.levelFor(t.concept), n = Math.min(20, st.attempts);
    if (n >= 15 && st.rate > 0.85 && lv !== "minimal") props.push(`- Raise the hint level on ${t.title} from ${lv}: ${Math.round(st.rate * 100)}% over the last ${n} attempts.`);
    if (n >= 10 && st.rate < 0.65 && lv !== "full") props.push(`- Lower the hint level on ${t.title} from ${lv}: ${Math.round(st.rate * 100)}% over the last ${n} attempts.`);
  }
  const fullRuns = days.filter(dayDone).length, activeWeek = days.filter((k) => active.has(k)).length;
  if (fullRuns >= 5 && newPerDay() < 8) props.push(`- Daily set: ${newPerDay()} → ${newPerDay() + 1} new problems. Full runs on ${fullRuns} of 7 days.`);
  else if (activeWeek >= 3 && fullRuns <= 1 && newPerDay() > 3) props.push(`- Daily set: ${newPerDay()} → ${newPerDay() - 1} new problems. Active ${activeWeek} days but only ${fullRuns} full run.`);
  const drill = topics.filter((t) => t.list.some((p) => p.variants) && scaffold.statsFor(t.concept).rate !== null && Math.min(20, scaffold.statsFor(t.concept).attempts) >= 5).sort((a, b) => scaffold.statsFor(a.concept).rate - scaffold.statsFor(b.concept).rate)[0];
  if (drill && scaffold.statsFor(drill.concept).rate < 0.8) props.push(`- Drill ${drill.title}: the lowest pass rate with variants available, ${Math.round(scaffold.statsFor(drill.concept).rate * 100)}%.`);
  out.push(...(props.length ? props : ["- No changes proposed: keep going as you are."]));
  return out.join("\n");
}

async function load() {
  if (sync.user) { attempts = await scaffold.refresh(sync.user).catch(() => []); nudges = await auth.fetchNudges().catch(() => []); }
  try { await reviews.refresh(); } catch (e) { /* cached */ }
  $("summary").textContent = build();
}

async function main() {
  const shell = mountShell("stats");
  await loadBank();
  try { await loadCards(); } catch (e) { /* cards are only named in the summary */ }
  $("summary").textContent = build();
  $("copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("summary").textContent); $("copied").textContent = "copied"; }
    catch (e) { $("copied").textContent = "could not copy: " + e.message; }
    setTimeout(() => { $("copied").textContent = ""; }, 3000);
  });
  onSynced((what) => { if (what === "user" || what === "merged" || what === "local-changed") load().then(() => shell.refresh()); });
  if (sync.user) load();
}
main().catch((e) => { $("summary").textContent = "Could not load: " + e.message; });
