import { mountShell } from "./shell.js";
import { onSynced, sync } from "./sync.js";
import { loadBank, state, store, routeTopics, markerFor, milestoneStatus, milestones, streakInfo, weekRow, xpInfo, XP_PER_LEVEL, dayKey, today } from "./progress.js";
import { MILESTONES } from "./route-data.js";
import { makeScene, GAINS } from "./scene.js";
import * as reviews from "./reviews.js";
import { runPlan } from "./run.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const lessonOf = (t) => `L${String(t.lesson).padStart(2, "0")}`;

function render() {
  const now = today();
  $("dateline").textContent = `${DAYS[now.getDay()]} ${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  const plan = runPlan();
  const run = plan.run;
  const saved = store.get("run." + run.day, null);
  if (saved && saved.done !== plan.allDone) { saved.done = plan.allDone; store.set("run." + run.day, saved); }

  // streak, the week and the rest day, beside the title
  const s = streakInfo();
  const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const week = weekRow().map((d) => `<div class="day ${d.state} ${d.isToday ? "today" : ""}" title="${d.key}${d.state === "rested" ? " · rest day used" : d.state === "earned" ? " · full run, rest day earned" : ""}"><span>${d.state === "active" || d.state === "earned" ? "✓" : d.state === "rested" ? "z" : ""}</span><span class="d">${DOW[new Date(d.key + "T12:00:00").getDay()]}</span></div>`).join("");
  $("streakline").innerHTML = `<span class="n">${s.current}</span><span class="txt"><b>day streak</b><span>best ${s.longest}</span></span><div class="week">${week}</div><span class="rest ${s.rest ? "" : "off"}" title="${s.rest ? "One missed day will not break the streak. A full run earns one a week." : "A full run earns a rest day, one a week; it covers one missed day."}">${s.rest ? "rest day held" : "no rest day"}</span>`;

  // the run card: three rows while open, one row when done
  const q = reviews.dueToday(), cq = reviews.cardsDueToday();
  const anyRows = Object.keys(reviews.all()).length > 0;
  const reviewPart = plan.parts[0], newPart = plan.parts[1], extraPart = plan.parts[2];
  const reviewDetail = !sync.user && !anyRows ? "sign in to get reviews"
    : reviewPart.ids.length === 0 && cq.pending.length === 0 ? (anyRows ? "nothing due today" : "none yet: clearing a topic starts its reviews")
    : [reviewPart.ids.length ? `${reviewPart.done} of ${reviewPart.ids.length} problems` : "", cq.pending.length ? `${cq.pending.length} card${cq.pending.length === 1 ? "" : "s"} on Concepts` : ""].filter(Boolean).join(" · ") + (q.rolled ? ` · ${q.rolled} roll to tomorrow` : "");
  const rows = [
    { title: "Reviews", detail: reviewDetail, done: reviewPart.done === reviewPart.ids.length, count: reviewPart.ids.length ? `${reviewPart.done}/${reviewPart.ids.length}` : "", href: plan.next && plan.next.kind === "review" ? "practice.html?run=1" : cq.pending.length && !reviewPart.ids.length ? "concepts.html?review=1" : "" },
    { title: newPart.ids.length ? `${run.topicTitle} · ${newPart.ids.length} new` : "New problems", detail: newPart.ids.length ? positionText(run) : "nothing left in this topic: pick the next one on the Route", done: newPart.ids.length > 0 && newPart.done === newPart.ids.length, count: newPart.ids.length ? `${newPart.done}/${newPart.ids.length}` : "", href: "practice.html?run=1" },
    { title: "One more", detail: extraPart.ids.length ? "one extra problem from the topic, or a milestone step" : "all topic problems done", done: extraPart.ids.length === 0 || extraPart.done === 1, count: extraPart.ids.length ? `${extraPart.done}/1` : "", href: "practice.html?run=1" },
  ];
  const curIdx = rows.findIndex((r) => !r.done);
  const rowHtml = rows.map((r, i) => `<div class="runrow ${r.done ? "done" : ""} ${i === curIdx ? "cur" : ""}"><span class="mk">${r.done ? "✓" : i === curIdx ? "›" : String(i + 1)}</span><span><div class="t">${esc(r.title)}</div><div class="d">${esc(r.detail)}</div></span>${i === curIdx && r.href ? `<a class="go" href="${r.href}">continue ›</a>` : `<span class="tr">${r.count}</span>`}</div>`).join("");
  const doneRows = rows.filter((r) => r.done).length;
  $("runcard").innerHTML = plan.allDone || (curIdx < 0)
    ? `<details><summary class="runrow done"><span class="mk">✓</span><span><div class="t">Day done · ${doneRows}/3</div><div class="d">${run.minutes} min today · anything more is a bonus</div></span><span class="tr">show</span></summary>${rowHtml}</details>`
    : rowHtml;
  const det = $("runcard").querySelector("details");
  if (det) det.addEventListener("toggle", () => { det.querySelector("summary .tr").textContent = det.open ? "hide" : "show"; });

  // one button
  const topic = routeTopics().find((t) => t.concept === run.topic);
  const moreId = topic ? (topic.list.find((p) => !state.solved[p.id] && !run.newIds.includes(p.id) && p.id !== run.extraId) || {}).id : null;
  const btn = $("runbtn");
  if (plan.total === 0) { btn.textContent = "Nothing to run"; btn.classList.remove("primary"); btn.href = "route.html"; $("runnote").textContent = "pick a topic on the Route"; }
  else if (curIdx < 0 || plan.allDone) { btn.textContent = `Keep going · ${topic ? lessonOf(topic) : "practice"}`; btn.href = moreId ? `practice.html#${moreId}` : "practice.html"; $("runnote").textContent = "the run is done; extra solves never count against the day"; }
  else if (plan.doneCount === 0) { btn.textContent = "Start run"; btn.href = "practice.html?run=1"; $("runnote").textContent = `${plan.total} item${plan.total === 1 ? "" : "s"} · reviews first, then new problems`; }
  else { btn.textContent = `Continue run · ${plan.doneCount + 1} of ${plan.total}`; btn.href = "practice.html?run=1"; $("runnote").textContent = `${run.minutes} min so far`; }

  // XP
  const x = xpInfo();
  $("xptext").innerHTML = `Level <b>${x.level}</b> · ${x.xp} XP · <b>${x.toNext}</b> to level ${x.level + 1}`;
  $("xpbar").firstElementChild.style.width = `${Math.round(100 * x.into / XP_PER_LEVEL)}%`;

  // keep going: never counts against the day
  const unsolvedAll = state.problems.filter((p) => !state.solved[p.id]);
  const randomId = unsolvedAll.length ? unsolvedAll[Math.floor(Math.random() * unsolvedAll.length)].id : null;
  const ms = milestones().find((m) => m.unlocked && !m.done && !m.planned);
  $("keep").innerHTML = [
    moreId ? `<a href="practice.html#${moreId}"><span>More ${esc(run.topicTitle)}</span><span class="tr">${topic.total - topic.done} left ›</span></a>` : "",
    ms ? `<a href="milestone.html?m=${ms.id}"><span>Milestone ${ms.number} · ${esc(ms.title)}</span><span class="tr">${ms.stepsDone}/${ms.steps} steps ›</span></a>` : "",
    randomId ? `<a href="practice.html#${randomId}"><span>A random problem</span><span class="tr">›</span></a>` : "",
    run.keepGoing ? `<span><span class="muted">${run.keepGoing} extra solved today</span><span class="tr"></span></span>` : "",
  ].join("");
  $("firstvisit").hidden = Boolean(store.get("aboutSeen", false)) || (sync.user && Object.keys(state.solved).length > 0);
  renderExcerpt(run.topic);
}
function positionText(run) {
  const list = state.problems.filter((p) => p.concept === run.topic);
  const first = list.findIndex((p) => p.id === run.newIds[0]) + 1;
  const last = list.findIndex((p) => p.id === run.newIds[run.newIds.length - 1]) + 1;
  return `problems ${first}–${last} of ${list.length}`;
}

// Three rows: the topic before, the current one, the one after (or its milestone).
function renderExcerpt(currentConcept) {
  const topics = routeTopics().filter((t) => t.total > 0);
  const cur = Math.max(0, topics.findIndex((t) => t.concept === currentConcept));
  const rows = [];
  for (let i = Math.max(0, cur - 1); i < Math.min(topics.length, cur + 2); i++) {
    const t = topics[i];
    const m = markerFor(t);
    const cls = t.locked ? "locked" : m === "✓" ? "done" : i === cur ? "current" : "";
    rows.push(`<a class="${cls}" href="route.html#${t.concept}"><span>${m === "✓" ? "✓" : m === "[#]" ? "#" : m === "[>]" ? "›" : "·"} ${lessonOf(t)} · ${esc(t.title)}</span><span>${t.locked ? "locked" : `${t.done}/${t.total}`}</span></a>`);
    const msd = MILESTONES.find((x) => x.after === t.concept);
    if (msd && i === cur) { const st = milestoneStatus(msd); rows.push(`<a class="milestone" href="${st.unlocked && !msd.planned ? `milestone.html?m=${msd.id}` : `route.html#${msd.id}`}"><span>${st.done ? "✓" : "◆"} Milestone ${msd.number} · ${esc(msd.title)}</span><span>${st.done ? "done" : st.unlocked ? `${st.stepsDone}/${msd.steps} steps` : "after this topic"}</span></a>`); }
  }
  $("excerpt").innerHTML = rows.slice(0, 3).join("");
  renderCharacter();
}

// The character panel: the Gallery's "so far" stage, with what each finished milestone added.
let sceneDemo = null, sceneKey = "";
function renderCharacter() {
  const all = milestones();
  const doneCount = all.filter((m) => m.done).length;
  $("milestone-count").textContent = `${doneCount} of ${all.length} milestones`;
  const has = {};
  for (const m of all) if (m.done && GAINS[m.id]) has[GAINS[m.id].key] = true;
  const key = Object.keys(has).sort().join(",");
  if (!sceneDemo || key !== sceneKey) {
    if (sceneDemo) sceneDemo.stop();
    sceneKey = key;
    sceneDemo = makeScene($("character-stage"), "character");
    sceneDemo.set({ has, x: 300, facing: "right" });
    if (has.move || has.walk) sceneDemo.demo(has.walk ? 150 : 120, [170, 430]);   // the box shows the middle of the stage
  }
  const ro = $("character-stage").querySelector(".scene-readout");
  $("character-caption").textContent = ro ? ro.textContent : "";
  const next = all.find((m) => !m.done && !m.planned);
  $("character-note").textContent = doneCount === 0 ? "Milestone 1 makes the character move. Each milestone after that adds something you can see here." : next ? `Next: milestone ${next.number}, ${next.title.toLowerCase()}${next.unlocked ? ", unlocked" : ""}.` : "Every milestone is done.";
}

async function main() {
  const shell = mountShell("today");
  await loadBank();
  render();
  $("firstvisit-close").addEventListener("click", () => { store.set("aboutSeen", true); $("firstvisit").hidden = true; });
  onSynced(() => { render(); shell.refresh(); });
}
main().catch((e) => { $("runcard").innerHTML = `<div class="error" style="padding: 14px 18px;">Could not load: ${esc(e.message)}</div>`; });
