// Stats: plain numbers and lists from account data. Solves come from the
// progress table (synced locally), attempts from the attempts table, and the
// review queue from the reviews table.
import { mountShell } from "./shell.js";
import { onSynced, sync } from "./sync.js";
import * as auth from "./auth.js";
import * as reviews from "./reviews.js";
import { loadBank, state, routeTopics, streakDays, activeDays, runsCompleted, dayKey, today } from "./progress.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pct = (n, d) => (d ? Math.round((100 * n) / d) + "%" : "–");
let attempts = [];

function render() {
  const topics = routeTopics().filter((t) => t.total > 0);
  const total = state.problems.length;
  const solved = Object.keys(state.solved).filter((id) => state.byId.has(id)).length;
  const days = activeDays();
  const cutoff = new Date(today()); cutoff.setDate(cutoff.getDate() - 30);
  const misses = attempts.filter((a) => a.result === "miss").length;
  const q = reviews.dueToday();
  const queue = Object.values(reviews.all());

  $("intro").textContent = sync.user ? "Attempts are counted from the day the attempt log started; solves and streak go back to your first day." : "Sign in to see attempts and reviews. Solves and streak below come from this browser.";
  $("numbers").innerHTML = [
    ["Solved", `${solved} / ${total}`, true], ["Streak", `${streakDays()} day${streakDays() === 1 ? "" : "s"}`, true], ["Active days", String(days.size)], ["Full runs completed", String(runsCompleted())],
    ["Attempts", String(attempts.length)], ["Miss rate", pct(misses, attempts.length)],
    ["Reviews in queue", String(queue.length)], ["Due today", String(q.pending.length)],
  ].map(([k, v, a]) => `<div class="num"><div class="label">${k}</div><div class="v ${a ? "accent" : ""}">${esc(v)}</div></div>`).join("");

  // per-topic tallies
  const byTopic = {};
  for (const t of topics) byTopic[t.concept] = { attempts: 0, misses: 0, recentAttempts: 0, recentMisses: 0, last: null };
  for (const a of attempts) {
    const p = state.byId.get(a.problem_id); if (!p || !byTopic[p.concept]) continue;
    const b = byTopic[p.concept]; b.attempts++; if (a.result === "miss") b.misses++;
    if (new Date(a.at) >= cutoff) { b.recentAttempts++; if (a.result === "miss") b.recentMisses++; }
    if (!b.last || a.at > b.last) b.last = a.at;
  }
  for (const [id, iso] of Object.entries(state.solved)) { const p = state.byId.get(id); if (p && byTopic[p.concept] && (!byTopic[p.concept].last || iso > byTopic[p.concept].last)) byTopic[p.concept].last = iso; }

  // weak spots: recent miss rate, at least 3 recent attempts
  const weak = topics.map((t) => ({ t, ...byTopic[t.concept] })).filter((x) => x.recentAttempts >= 3).map((x) => ({ ...x, rate: x.recentMisses / x.recentAttempts })).filter((x) => x.rate > 0).sort((a, b) => b.rate - a.rate || b.recentMisses - a.recentMisses).slice(0, 5);
  $("weak").innerHTML = weak.length ? weak.map((x) => `<a href="practice.html?topic=${x.t.concept}"><span>${esc(x.t.title)} <span class="dim">L${String(x.t.lesson).padStart(2, "0")}</span></span><span class="rate">${pct(x.recentMisses, x.recentAttempts)} missed</span><span class="muted">${x.recentMisses} of ${x.recentAttempts} runs · practice ›</span></a>`).join("")
    : `<div class="muted" style="font-size:13px">${attempts.length ? "No topic has enough recent misses to stand out." : "Nothing yet: weak spots appear after a few runs are logged."}</div>`;

  // streak history: 16 weeks, columns are weeks, rows Sunday to Saturday
  const end = new Date(today()); const startDay = new Date(end); startDay.setDate(end.getDate() - end.getDay() - 7 * 15);
  const cells = [];
  for (let i = 0; i < 7 * 16; i++) {
    const d = new Date(startDay); d.setDate(startDay.getDate() + i);
    const key = dayKey(d);
    const future = key > dayKey(end);
    cells.push(`<div class="${future ? "future" : days.has(key) ? "on" : ""} ${key === dayKey(end) ? "today" : ""}" title="${key}${days.has(key) ? " · active" : ""}"></div>`);
  }
  $("weeks").innerHTML = cells.join("");
  $("legend").textContent = `${[...days].filter((k) => k >= dayKey(startDay)).length} active days in the last 16 weeks · a day counts when it has at least one solve or review`;

  // per-topic table
  $("topics").innerHTML = `<tr><th>Topic</th><th class="r">Solved</th><th class="r">Attempts</th><th class="r">Misses</th><th class="r">Miss rate</th><th class="r">Last 30 days</th><th>Last activity</th></tr>` + topics.map((t) => {
    const b = byTopic[t.concept];
    return `<tr class="${t.locked ? "locked" : ""}"><td>${esc(t.title)} <span class="dim">L${String(t.lesson).padStart(2, "0")}</span></td><td class="r">${t.done} / ${t.total}</td><td class="r">${b.attempts}</td><td class="r">${b.misses}</td><td class="r">${pct(b.misses, b.attempts)}</td><td class="r">${b.recentAttempts ? pct(b.recentMisses, b.recentAttempts) + " of " + b.recentAttempts : "–"}</td><td>${b.last ? dayKey(new Date(b.last)) : "–"}</td></tr>`;
  }).join("");
}

async function load() {
  if (sync.user && auth.enabled) {
    try { attempts = await auth.fetchAttempts(); await reviews.refresh(); } catch (e) { sync.note("Stats unavailable: " + e.message); }
  }
  render();
}

async function main() {
  const shell = mountShell("stats");
  await loadBank();
  render();
  onSynced((what) => { if (what === "user" || what === "merged" || what === "local-changed") load().then(() => shell.refresh()); });
  if (sync.user) load();
}
main().catch((e) => { $("intro").textContent = "Could not load: " + e.message; });
