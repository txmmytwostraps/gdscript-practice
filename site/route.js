import { mountShell } from "./shell.js";
import { onSynced, sync } from "./sync.js";
import { loadBank, state, routeTopics, markerFor, currentTopic, courseLock, setCourseLock, newPerDay, setNewPerDay, nextMilestone, milestoneStatus, milestones } from "./progress.js";
import * as scaffold from "./scaffold.js";
import { MILESTONES, LESSONS } from "./route-data.js";
import { requestPrompt } from "./content-rules.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const short = (iso) => { const d = new Date(iso); return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
const person = (color) => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="7" r="4"></circle><path d="M5 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"></path></svg>`;
const arrow = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4e5a66" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>`;

function render() {
  const topics = routeTopics();
  const cur = currentTopic();
  const total = state.problems.length, done = Object.keys(state.solved).filter((id) => state.byId.has(id)).length;
  const ms = nextMilestone();
  $("pos-title").textContent = cur ? `${cur.title.toUpperCase()} · ${cur.done}/${cur.total}` : "—";
  $("pos-bar").firstElementChild.style.flexGrow = done; $("pos-bar").lastElementChild.style.flexGrow = Math.max(1, total - done);
  $("pos-detail").textContent = `${done} / ${total} problems · ${milestones().filter((m) => m.done).length} / ${MILESTONES.length} milestones` + (ms ? ` · next milestone ${ms.unlocked ? "unlocked" : `in ${ms.topicsToGo} topic${ms.topicsToGo === 1 ? "" : "s"}`}` : "");
  $("lock").innerHTML = LESSONS.map(([n, t]) => `<option value="${n}">${n}</option>`).join("");
  $("lock").value = String(courseLock());

  // Rows in course order: lessons without problems appear as placeholders.
  const rows = [];
  let seen = new Set();
  for (const [n, title] of LESSONS) {
    const here = topics.filter((t) => t.lesson === n);
    if (here.length === 0) {
      rows.push(`<div class="row empty ${n > courseLock() ? "locked" : ""}" id="L${n}"><div class="box">${n > courseLock() ? "[#]" : "[ ]"}</div><div><div class="t">${esc(title.toUpperCase())}</div><div class="s">L${String(n).padStart(2, "0")} · no problems yet</div></div></div>`);
      continue;
    }
    for (const t of here) {
      const m = markerFor(t);
      const isCur = cur && t.concept === cur.concept;
      const cls = t.locked ? "locked" : isCur ? "current" : m === "[x]" ? "done" : "";
      const sub = t.locked ? `L${String(t.lesson).padStart(2, "0")} · locked until you clear it in the course`
        : m === "[x]" ? `L${String(t.lesson).padStart(2, "0")} · ${t.done}/${t.total} · cleared ${short(t.clearedAt)}`
        : isCur ? `L${String(t.lesson).padStart(2, "0")} · ${t.done}/${t.total} · ${t.total - t.done} to go`
        : `L${String(t.lesson).padStart(2, "0")} · ${t.done}/${t.total}`;
      const note = t.note ? ` · ${esc(t.note)}` : "";
      const next = t.list.find((p) => !state.solved[p.id]);
      const canDrill = t.list.some((p) => p.variants);
      const lv = scaffold.levelFor(t.concept), st = scaffold.statsFor(t.concept);
      const hintSel = `<label class="hintlevel">hints <select data-scaffold="${t.concept}"><option value="">auto (${scaffold.autoLevel(t.concept)})</option>${scaffold.LEVELS.map((l) => `<option value="${l}" ${scaffold.overrideFor(t.concept) === l ? "selected" : ""}>${l}</option>`).join("")}</select>${st.rate !== null ? ` <span class="dim">${Math.round(st.rate * 100)}% of last ${Math.min(20, st.attempts)}</span>` : ""}</label>`;
      const more = t.locked ? "" : `<div class="more caps">${canDrill ? `<a href="practice.html?drill=${t.concept}">[~] Drill</a>` : ""}<button type="button" class="linkish" data-request="${t.concept}">[+] Request more</button>${hintSel}</div>`;
      rows.push(`<div class="row ${cls}" id="${t.concept}"><div class="box">${m}</div><div class="${isCur ? "grow" : ""}"><div class="t">${esc(t.title.toUpperCase())}</div><div class="s">${sub}${note}</div>${more}</div>${isCur && next ? `<a class="btn primary" href="practice.html#${next.id}">Continue</a>` : ""}</div>`);
      const milestone = MILESTONES.find((x) => x.after === t.concept);
      if (milestone) {
        const planned = milestone.planned;
        const st = milestoneStatus(milestone);
        const afterTitle = t.title;
        const k = planned ? "" : st.done ? "[x] " : st.unlocked ? "[!] " : "";
        const when = planned ? `unlocks after ${esc(afterTitle)}`
          : st.done ? `done ${short(st.doneAt)}${st.godotDone ? " · built in Godot" : ""} · <a href="gallery.html#${milestone.id}">gallery</a>`
          : st.unlocked ? `<a class="btn primary" href="milestone.html?m=${milestone.id}">${st.stepsDone ? `Continue · ${st.stepsDone}/${milestone.steps}` : "Start"}</a>`
          : `unlocks after ${esc(afterTitle)} · ${st.topicsToGo} topic${st.topicsToGo === 1 ? "" : "s"} to go`;
        const badge = st.done && milestone.badge ? ` · <span class="accent">${esc(milestone.badge)}</span>` : "";
        rows.push(`<div class="ms ${planned ? "planned" : ""} ${st.done ? "done" : ""}" id="${milestone.id}"><div class="icon">${planned ? arrow : person(st.done ? "#7ee0a6" : "#e2b153")}</div><div style="display:flex;flex-direction:column;gap:3px;flex-grow:1"><div class="k">${k}Milestone ${String(milestone.number).padStart(2, "0")}${badge}</div><div class="t">${esc(milestone.title)}</div><div class="u">${esc(milestone.uses)}</div></div><div class="when">${when}</div></div>`);
      }
    }
  }
  $("rows").innerHTML = rows.join("");
  if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView({ block: "center" }); }
}

async function main() {
  const shell = mountShell("route");
  await loadBank();
  render();
  $("lock").addEventListener("change", () => { setCourseLock(Number($("lock").value)); render(); shell.refresh(); });
  $("perday").value = String(newPerDay());
  $("perday").addEventListener("change", () => { setNewPerDay($("perday").value); });
  $("rows").addEventListener("change", (ev) => { const sel = ev.target.closest("select[data-scaffold]"); if (!sel) return; scaffold.setOverride(sel.dataset.scaffold, sel.value); render(); });
  if (sync.user) scaffold.refresh(sync.user).then(render);
  // Request more problems: copies a written brief for the topic to the clipboard.
  $("rows").addEventListener("click", async (ev) => {
    const b = ev.target.closest("button[data-request]"); if (!b) return;
    const t = routeTopics().find((x) => x.concept === b.dataset.request); if (!t) return;
    const text = requestPrompt({ title: t.title, concept: t.concept, lesson: t.lesson, titles: t.list.map((p) => p.title) });
    try { await navigator.clipboard.writeText(text); b.textContent = "[+] Copied to the clipboard"; }
    catch (e) { b.textContent = "[+] Could not copy"; }
    setTimeout(() => { b.textContent = "[+] Request more"; }, 4000);
  });
  onSynced((what) => { if (what === "user" && sync.user) scaffold.refresh(sync.user).then(render); render(); shell.refresh(); });
}
main().catch((e) => { $("rows").innerHTML = `<div class="error">Could not load: ${esc(e.message)}</div>`; });
