// The Route: the course's lessons in five stages along one path. Only the
// current lesson is a card; the others are rows on the path, milestones are
// tiles across it, and stages not reached yet fold to their header.
import { mountShell } from "./shell.js";
import { onSynced, sync } from "./sync.js";
import { loadBank, state, store, routeTopics, markerFor, currentTopic, courseLock, milestoneStatus, milestones, nextMilestone } from "./progress.js";
import * as scaffold from "./scaffold.js";
import { MILESTONES, LESSONS, STAGES } from "./route-data.js";
import { requestPrompt } from "./content-rules.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const short = (iso) => { const d = new Date(iso); return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
const L = (n) => `L${String(n).padStart(2, "0")}`;
const segbar = (done, total, max = 12) => { const n = Math.min(total, max); return `<div class="segbar">${Array.from({ length: n }, (_, i) => `<i class="${i < Math.round((done / Math.max(1, total)) * n) ? "on" : ""}"></i>`).join("")}</div>`; };

function stageStats(stage, topics) {
  const mine = topics.filter((t) => t.lesson >= stage.from && t.lesson <= stage.to);
  const total = mine.reduce((a, t) => a + t.total, 0), done = mine.reduce((a, t) => a + t.done, 0);
  return { mine, total, done, locked: stage.from > courseLock(), lockAt: stage.from };
}

function render() {
  const topics = routeTopics();
  const cur = currentTopic();
  const lock = courseLock();
  const total = state.problems.length, done = Object.keys(state.solved).filter((id) => state.byId.has(id)).length;
  const nm = nextMilestone();
  // you are here
  $("here-title").textContent = cur ? `${L(cur.lesson)} · ${cur.title}` : "—";
  $("here-bar").outerHTML = cur ? segbar(cur.done, cur.total).replace('class="segbar"', 'class="segbar" id="here-bar"') : `<div class="segbar" id="here-bar"></div>`;
  $("here-count").textContent = cur ? `${cur.done} / ${cur.total} · ${cur.total - cur.done} to go` : "";
  $("here-totals").textContent = `${done} / ${total} problems · ${milestones().filter((m) => m.done).length} / ${MILESTONES.length} milestones`;
  $("here-next").textContent = nm ? `Next milestone: ${nm.title.toLowerCase()}, ${nm.unlocked ? "unlocked" : `in ${nm.topicsToGo} topic${nm.topicsToGo === 1 ? "" : "s"}`}` : "Every milestone is done.";

  const curStage = cur ? STAGES.findIndex((s) => cur.lesson >= s.from && cur.lesson <= s.to) : 0;
  const tocRows = [], blocks = [];
  STAGES.forEach((stage, si) => {
    const st = stageStats(stage, topics);
    tocRows.push(`<a href="#stage-${si + 1}" class="${si === curStage ? "cur" : ""}"><span>${esc(stage.title)}</span><span class="r">${L(stage.from)}–${L(stage.to)}</span><span class="c">${st.locked ? "locked" : `${st.done}/${st.total}`}</span></a>`);
    // the path: one row per lesson (a lesson with two topics gets two rows), milestones as tiles
    const rows = [];
    for (const [n, title] of LESSONS.filter(([n]) => n >= stage.from && n <= stage.to)) {
      const here = topics.filter((t) => t.lesson === n);
      if (here.length === 0) {
        rows.push(`<div class="lrow empty ${n > lock ? "locked" : ""}" id="L${n}"><span class="node ${n > lock ? "locked" : ""}"></span><span class="tt">${L(n)} · ${esc(title)}</span><span class="tr">no problems yet</span></div>`);
        continue;
      }
      for (const t of here) {
        const m = markerFor(t);
        const isCur = cur && t.concept === cur.concept;
        const next = t.list.find((p) => !state.solved[p.id]);
        const name = `${L(t.lesson)} · ${esc(t.title)}${t.note ? ` <span class="dim">· ${esc(t.note)}</span>` : ""}`;
        if (isCur) {
          const canDrill = t.list.some((p) => p.variants);
          const sc = scaffold.statsFor(t.concept);
          rows.push(`<div class="card" id="${t.concept}"><span class="node cur"></span>
            <div class="ct">${esc(t.title)}</div>
            <div class="cs">${L(t.lesson)} · ${t.done} / ${t.total} · ${t.total - t.done} to go</div>
            ${segbar(t.done, t.total, t.total)}
            <div class="tools"><label>hints <select data-scaffold="${t.concept}"><option value="">auto (${scaffold.autoLevel(t.concept)})</option>${scaffold.LEVELS.map((l) => `<option value="${l}" ${scaffold.overrideFor(t.concept) === l ? "selected" : ""}>${l}</option>`).join("")}</select>${sc.rate !== null ? ` <span class="dim">${Math.round(sc.rate * 100)}% of last ${Math.min(20, sc.attempts)}</span>` : ""}</label><a href="practice.html?topic=${t.concept}">Any problem</a>${canDrill ? `<a href="practice.html?drill=${t.concept}">Drill</a>` : ""}<button type="button" data-request="${t.concept}">Request more</button></div>
            <div class="go">${next ? `<a class="btn primary" href="practice.html#${next.id}">Continue</a>` : `<a class="btn" href="cleared.html?topic=${t.concept}">Cleared ›</a>`}</div></div>`);
        } else {
          const cls = t.locked ? "locked" : m === "✓" ? "done" : "";
          const node = t.locked ? "locked" : m === "✓" ? "done" : "";
          const trail = t.locked ? "locked" : m === "✓" ? `${t.done}/${t.total} ✓` : `${t.done}/${t.total}`;
          const href = t.locked ? "stats.html#settings" : m === "✓" ? `cleared.html?topic=${t.concept}` : next ? `practice.html#${next.id}` : `practice.html?topic=${t.concept}`;
          rows.push(`<a class="lrow ${cls}" id="${t.concept}" href="${href}" title="${m === "✓" ? `cleared ${short(t.clearedAt)}` : ""}"><span class="node ${node}"></span><span class="tt">${name}</span><span class="tr">${trail}</span></a>`);
        }
        const ms = MILESTONES.find((x) => x.after === t.concept);
        if (ms) {
          const s = milestoneStatus(ms);
          const cls = ms.planned ? "dim" : s.done ? "done" : s.unlocked ? "open" : "";
          const trail = ms.planned ? "planned" : s.done ? `done ${short(s.doneAt)} · <a href="gallery.html#${ms.id}">gallery ›</a>` : s.unlocked ? `<a href="milestone.html?m=${ms.id}">${s.stepsDone ? `continue · ${s.stepsDone}/${ms.steps} ›` : "start ›"}</a>` : `unlocks after ${L(t.lesson)}`;
          rows.push(`<div class="tile ${cls}" id="${ms.id}"><span><span class="k">${s.done ? "✓ " : "◆ "}Milestone ${ms.number} · ${esc(ms.title)}${s.done && ms.badge ? ` · ${esc(ms.badge)}` : ""}</span><div class="u">${esc(ms.uses)}</div></span><span class="tr">${trail}</span></div>`);
        }
      }
    }
    const head = `<span class="sname">${esc(stage.title)}</span><span class="srange">${L(stage.from)}–${L(stage.to)}</span>${st.locked ? `<span></span><span class="scount lock">finish ${L(stage.from)} in the course to open</span>` : `<span class="sbar"><i style="width: ${st.total ? Math.round(100 * st.done / st.total) : 0}%"></i></span><span class="scount">${st.done}/${st.total}</span>`}`;
    const remembered = store.get("route.stage-" + (si + 1), null);
    const open = remembered === null ? si === curStage : Boolean(remembered);
    blocks.push(`<details class="stage" id="stage-${si + 1}" ${open ? "open" : ""}><summary><div class="stage-head">${head}</div></summary><div class="path">${rows.join("")}</div></details>`);
  });
  $("toc").innerHTML = tocRows.join("");
  $("stages").innerHTML = blocks.join("");
  for (const d of $("stages").querySelectorAll("details.stage")) d.addEventListener("toggle", () => store.set("route." + d.id, d.open));
  if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) { const d = el.closest("details"); if (d) d.open = true; el.scrollIntoView({ block: "center" }); } }
}

async function main() {
  const shell = mountShell("route");
  await loadBank();
  render();
  $("toc").addEventListener("click", (ev) => {
    const a = ev.target.closest("a[href^='#stage-']"); if (!a) return;
    ev.preventDefault();
    const d = document.getElementById(a.getAttribute("href").slice(1)); if (!d) return;
    d.open = true; store.set("route." + d.id, true);
    d.scrollIntoView({ block: "start", behavior: "smooth" });
  });
  $("stages").addEventListener("change", async (ev) => { const sel = ev.target.closest("select[data-scaffold]"); if (!sel) return; await scaffold.setOverride(sel.dataset.scaffold, sel.value); render(); });
  if (sync.user) scaffold.refresh(sync.user).then(render);
  // Request more problems: copies a written brief for the topic to the clipboard.
  $("stages").addEventListener("click", async (ev) => {
    const b = ev.target.closest("button[data-request]"); if (!b) return;
    const t = routeTopics().find((x) => x.concept === b.dataset.request); if (!t) return;
    const text = requestPrompt({ title: t.title, concept: t.concept, lesson: t.lesson, titles: t.list.map((p) => p.title) });
    try { await navigator.clipboard.writeText(text); b.textContent = "Copied to the clipboard"; }
    catch (e) { b.textContent = "Could not copy"; }
    setTimeout(() => { b.textContent = "Request more"; }, 4000);
  });
  onSynced((what) => { if (what === "user" && sync.user) scaffold.refresh(sync.user).then(render); render(); shell.refresh(); });
}
main().catch((e) => { $("stages").innerHTML = `<div class="error">Could not load: ${esc(e.message)}</div>`; });
