import { mountShell } from "./shell.js";
import { onSynced, sync } from "./sync.js";
import { loadBank, state, store, todayRun, routeTopics, markerFor, nextMilestone, milestoneStatus, streakDays, runsCompleted } from "./progress.js";
import { MILESTONES } from "./route-data.js";
import { makeScene } from "./scene.js";
import * as reviews from "./reviews.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function render() {
  const now = new Date();
  $("dateline").textContent = `// ${DAYS[now.getDay()]} ${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")} — daily run`;
  const run = todayRun();
  // Slot 01 is the review queue, which lives in the account.
  const q = reviews.dueToday();
  const total = q.pending.length + q.doneToday.length;
  const topics = [...new Set(q.pending.map((r) => reviews.topicTitle(r.topic)))].join(", ");
  const anyRows = Object.keys(reviews.all()).length > 0;
  run.slots[0] = !sync.user && !anyRows
    ? { n: "01", title: "REVIEW", detail: "sign in to get reviews", done: true, kind: "review" }
    : total === 0
      ? { n: "01", title: "REVIEW", detail: anyRows ? "nothing due today" : "no reviews yet — clear a topic to start them", done: true, kind: "review" }
      : { n: "01", title: `REVIEW · ${q.pending.length} DUE`, detail: q.pending.length ? topics + (q.rolled ? ` · ${q.rolled} more roll to tomorrow` : "") : `${q.doneToday.length} done today`, done: q.pending.length === 0, kind: "review", href: q.pending.length ? `practice.html?review=1#${q.pending[0].problem_id}` : null };
  run.doneCount = run.slots.filter((s) => s.done).length;
  run.allDone = run.doneCount === run.slots.length;
  const saved = store.get("run." + run.day, null);
  if (saved && saved.done !== run.allDone) { saved.done = run.allDone; store.set("run." + run.day, saved); }
  $("runcount").textContent = `${run.doneCount} / 3 · ${run.minutes} min`;
  $("runsdone").textContent = String(runsCompleted());
  [...$("runbar").children].forEach((seg, i) => seg.classList.toggle("on", i < run.doneCount));
  const activeIdx = run.slots.findIndex((s) => !s.done);
  const firstNew = run.newIds.find((id) => !state.solved[id]);
  $("slots").innerHTML = run.slots.map((s, i) => {
    const active = i === activeIdx;
    const href = s.href || (s.kind === "new" && firstNew ? `practice.html#${firstNew}` : s.kind === "extra" && run.extraId ? `practice.html#${run.extraId}` : null);
    const state_ = s.done ? "CLEAR" : active ? "CONTINUE" : s.kind === "new" && s.progress ? `${s.progress[0]} / ${s.progress[1]}` : "";
    const detail = s.kind === "new" && s.progress && !s.done ? `${s.detail} · ${s.progress[0]} of ${s.progress[1]} done` : s.detail;
    const inner = `<div class="n">${s.n}</div><div><div class="t">${esc(s.title)}</div><div class="d">${esc(detail)}</div></div><div class="state">${state_}</div>`;
    return href && !s.done ? `<a class="slot link ${active ? "active" : ""}" href="${href}">${inner}</a>` : `<div class="slot ${s.done ? "done" : ""} ${active ? "active" : ""}">${inner}</div>`;
  }).join("");
  $("doneday").hidden = !run.allDone;
  // keep going: never counts against the day
  const topic = routeTopics().find((t) => t.concept === run.topic);
  const moreId = topic ? (topic.list.find((p) => !state.solved[p.id] && !run.newIds.includes(p.id) && p.id !== run.extraId) || {}).id : null;
  const unsolvedAll = state.problems.filter((p) => !state.solved[p.id]);
  const randomId = unsolvedAll.length ? unsolvedAll[Math.floor(Math.random() * unsolvedAll.length)].id : null;
  $("keep").innerHTML = (moreId ? `<a class="btn" href="practice.html#${moreId}">+ More ${esc(run.topicTitle)}</a>` : "") + (randomId ? `<a class="btn" href="practice.html#${randomId}">+ Random</a>` : "") + (run.keepGoing ? `<span class="dim" style="align-self:center;font-size:12px;text-transform:uppercase;letter-spacing:.06em">${run.keepGoing} extra solved today</span>` : "");
  renderExcerpt(run.topic);
}

function renderExcerpt(currentConcept) {
  const topics = routeTopics().filter((t) => t.total > 0);
  const cur = Math.max(0, topics.findIndex((t) => t.concept === currentConcept));
  const from = Math.max(0, cur - 1), to = Math.min(topics.length, cur + 4);
  const rows = [];
  for (let i = from; i < to; i++) {
    const t = topics[i];
    const m = markerFor(t);
    const cls = t.locked ? "locked" : m === "[x]" ? "done" : i === cur ? "current" : "";
    rows.push(`<a class="${cls}" href="route.html#${t.concept}"><span>${m} ${esc(t.title)}</span><span>${t.locked ? `locked · L${t.lesson}` : `${t.done}/${t.total}`}</span></a>`);
    const ms = MILESTONES.find((x) => x.after === t.concept);
    if (ms) { const st = milestoneStatus(ms); rows.push(`<a class="milestone" href="${st.unlocked && !ms.planned ? `milestone.html?m=${ms.id}` : `route.html#${ms.id}`}"><span>${st.done ? "[x]" : "[!]"} MILESTONE ${ms.number} — ${esc(ms.title.toLowerCase())}</span><span>${st.done ? "done" : st.unlocked ? `${st.stepsDone}/${ms.steps} steps` : ""}</span></a>`); }
  }
  $("excerpt").innerHTML = rows.join("");
  renderCharacter();
}

// The character panel: a patrolling robot once milestone 1 is done.
let sceneDemo = null;
function renderCharacter() {
  const m1 = milestoneStatus(MILESTONES[0]);
  const note = $("character-note"), stage = $("character-stage");
  if (!m1.done) { note.textContent = m1.unlocked ? "Milestone 1 is unlocked: make the character move." : "Milestone 1 makes the character move. Milestone 2 gives it health, and the bar fills for real."; return; }
  if (!sceneDemo) { stage.innerHTML = ""; sceneDemo = makeScene(stage); sceneDemo.demo(120); }
  note.innerHTML = `<span class="accent">${esc(MILESTONES[0].badge)}</span> · milestone 1 done. Milestone 2 gives it health. <a href="gallery.html#m1">Gallery ›</a>`;
}

async function main() {
  const shell = mountShell("today");
  await loadBank();
  render();
  onSynced(() => { render(); shell.refresh(); });
}
main().catch((e) => { $("slots").innerHTML = `<div class="error">Could not load: ${esc(e.message)}</div>`; });
