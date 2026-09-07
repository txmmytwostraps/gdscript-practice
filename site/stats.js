// Stats: plain numbers and lists from account data. Solves come from the
// progress table (synced locally), attempts from the attempts table, and the
// review queue from the reviews table.
import { mountShell } from "./shell.js";
import { onSynced, sync, exportProgress, clearProgress } from "./sync.js";
import * as settings from "./settings.js";
import { LESSONS } from "./route-data.js";
import { applyTextScale } from "./shell.js";
import * as auth from "./auth.js";
import * as reviews from "./reviews.js";
import { loadBank, state, routeTopics, streakDays, activeDays, runsCompleted, milestones, dayKey, today, xpInfo, XP_PER_LEVEL, courseLock, newPerDay } from "./progress.js";

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
  const x = xpInfo();
  $("numbers").innerHTML = [
    ["Solved", `${solved} / ${total}`, true], ["Streak", `${streakDays()} day${streakDays() === 1 ? "" : "s"}`, true], ["Level", `${x.level} · ${x.xp} XP`, true, `<div class="xpbar wide" title="${x.toNext} XP to level ${x.level + 1}"><i style="width: ${Math.round(100 * x.into / XP_PER_LEVEL)}%"></i></div>`], ["Active days", String(days.size)], ["Full runs completed", String(runsCompleted())],
    ["Attempts", String(attempts.length)], ["Miss rate", pct(misses, attempts.length)],
    ["Reviews in queue", String(queue.length)], ["Due today", String(q.pending.length)],
  ].map(([k, v, a, extra]) => `<div class="num"><div class="label">${k}</div><div class="v ${a ? "accent" : ""}">${esc(v)}</div>${extra || ""}</div>`).join("");

  // badges
  $("badges").innerHTML = milestones().map((m) => m.done
    ? `<a href="gallery.html#${m.id}"><span>✓ Milestone ${m.number} · ${esc(m.title)}</span><span class="accent">${esc(m.badge || "done")}</span><span class="muted">${m.doneAt ? dayKey(new Date(m.doneAt)) : ""}${m.godotDone ? " · built in Godot" : ""}</span></a>`
    : `<a href="route.html#${m.id}" class="dim"><span>[ ] Milestone ${m.number} · ${esc(m.title)}</span><span></span><span class="muted">${m.planned ? "planned" : m.unlocked ? `${m.stepsDone} / ${m.steps} steps` : `${m.topicsToGo} topic${m.topicsToGo === 1 ? "" : "s"} to go`}</span></a>`).join("");

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

function renderTextSize() { for (const b of $("textsize").querySelectorAll("button")) b.classList.toggle("on", Number(b.dataset.size) === settings.textScale()); $("lock").value = String(courseLock()); $("perday").value = String(newPerDay()); }
async function main() {
  const shell = mountShell("stats");
  await loadBank();
  render();
  $("lock").innerHTML = LESSONS.map(([n, t]) => `<option value="${n}">${n} · ${t}</option>`).join("");
  renderTextSize();
  $("lock").addEventListener("change", async () => { await settings.setCourseLock(Number($("lock").value)); render(); shell.refresh(); });
  $("perday").addEventListener("change", () => settings.setNewPerDay($("perday").value));
  $("textsize").addEventListener("click", async (ev) => { const b = ev.target.closest("button[data-size]"); if (!b) return; await settings.setTextScale(Number(b.dataset.size)); applyTextScale(); renderTextSize(); });
  $("export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(exportProgress(), null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `gdscript-practice-progress-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.appendChild(a); a.click(); a.remove();
  });
  $("clear").addEventListener("click", async () => {
    const where = sync.user ? "in this browser AND in your account" : "in this browser";
    if (prompt(`This deletes every solve, miss count and draft ${where}. Type CLEAR to confirm.`) !== "CLEAR") return;
    await clearProgress();
    location.reload();
  });
  onSynced(renderTextSize);
  onSynced((what) => { if (what === "user" || what === "merged" || what === "local-changed") load().then(() => shell.refresh()); });
  if (sync.user) load();
}
main().catch((e) => { $("intro").textContent = "Could not load: " + e.message; });
