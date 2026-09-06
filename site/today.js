import { mountShell } from "./shell.js";
import { onSynced } from "./sync.js";
import { loadBank, state, todayRun, routeTopics, markerFor, nextMilestone, streakDays } from "./progress.js";
import { MILESTONES } from "./route-data.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function render() {
  const now = new Date();
  $("dateline").textContent = `// ${DAYS[now.getDay()]} ${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")} — daily run`;
  const run = todayRun();
  $("runcount").textContent = `${run.doneCount} / 3 · ${run.minutes} min`;
  [...$("runbar").children].forEach((seg, i) => seg.classList.toggle("on", i < run.doneCount));
  const activeIdx = run.slots.findIndex((s) => !s.done);
  const firstNew = run.newIds.find((id) => !state.solved[id]);
  $("slots").innerHTML = run.slots.map((s, i) => {
    const active = i === activeIdx;
    const href = s.kind === "new" && firstNew ? `practice.html#${firstNew}` : s.kind === "extra" && run.extraId ? `practice.html#${run.extraId}` : null;
    const state_ = s.done ? "CLEAR" : active ? (s.kind === "review" ? "NONE DUE" : "CONTINUE") : s.kind === "new" && s.progress ? `${s.progress[0]} / ${s.progress[1]}` : "";
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
    if (ms) rows.push(`<a class="milestone" href="route.html#${ms.id}"><span>[!] MILESTONE ${ms.number} — ${esc(ms.title.toLowerCase())}</span></a>`);
  }
  $("excerpt").innerHTML = rows.join("");
}

async function main() {
  const shell = mountShell("today");
  await loadBank();
  render();
  onSynced(() => { render(); shell.refresh(); });
}
main().catch((e) => { $("slots").innerHTML = `<div class="error">Could not load: ${esc(e.message)}</div>`; });
