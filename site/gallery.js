// The Gallery: every finished milestone, runnable with the script it was
// finished with.
import { JudgeClient } from "./judge-client.js";
import { mountShell } from "./shell.js";
import { onSynced } from "./sync.js";
import { loadBank, getDraft, milestones, dayKey } from "./progress.js";
import { makeScene, wireScene } from "./scene.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const judge = new JudgeClient({ src: "../web/index.html", container: $("judge-frame"), timeoutMs: 5000, inline: new URLSearchParams(location.search).get("judge") === "inline", onStatus: (s) => { $("judge-status").textContent = s === "ready" ? "" : "judge: " + s; }, onTimeout: () => location.reload() });
const stages = {};

async function render() {
  const list = milestones();
  const cards = [];
  for (const m of list) {
    if (!m.done) { cards.push(`<div class="card locked" id="${m.id}"><div class="head"><span class="k">Milestone ${String(m.number).padStart(2, "0")}</span><span class="t">${esc(m.title)}</span><span class="when">${m.planned ? "planned" : m.unlocked ? `${m.stepsDone} / ${m.steps} steps done · <a href="milestone.html?m=${m.id}">continue ›</a>` : `unlocks in ${m.topicsToGo} topic${m.topicsToGo === 1 ? "" : "s"}`}</span></div></div>`); continue; }
    const r = await fetch(`../milestones/${m.id}.json`);
    const data = r.ok ? await r.json() : null;
    const last = data ? data.steps[data.steps.length - 1] : null;
    const draft = last ? getDraft(last.id) : null;
    const code = draft ? draft.code : last ? last.solution : "";
    cards.push(`<div class="card" id="${m.id}"><div class="head"><span class="k">Milestone ${String(m.number).padStart(2, "0")}</span><span class="t">${esc(m.title)}</span><span class="badge">${esc(m.badge || "done")}</span><span class="when">finished ${m.doneAt ? dayKey(new Date(m.doneAt)) : ""}${m.godotDone ? " · built in Godot too" : ""}</span></div>
      <div><div class="label" style="margin-bottom:8px">Your script</div><pre class="code">${esc(code)}</pre><div class="caps" style="margin-top:10px;font-size:12px"><a href="milestone.html?m=${m.id}#s${data ? data.steps.length : 1}">Open the milestone ›</a></div></div>
      <div><div class="label" style="margin-bottom:8px">Run it</div><div id="stage-${m.id}"></div><div class="buttons" id="buttons-${m.id}"></div><div class="scene-note" id="note-${m.id}"></div></div></div>`);
    stages[m.id] = { code, buttons: last && last.scene ? last.scene.buttons : [], kind: (data && data.scene && data.scene.kind) || "move", watch: data && data.scene ? data.scene.watch : undefined };
  }
  $("cards").innerHTML = cards.length ? cards.join("") : `<div class="muted">No milestones yet.</div>`;
  for (const [id, s] of Object.entries(stages)) {
    const scene = makeScene($(`stage-${id}`), s.kind);
    const w = wireScene(scene, judge, { buttonsEl: $(`buttons-${id}`), noteEl: $(`note-${id}`), getCode: () => s.code, watch: s.watch });
    w.setButtons(s.buttons);
    judge.ready.then(() => w.reset()).catch(() => {});
  }
  if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView({ block: "start" }); }
}

async function main() {
  const shell = mountShell("gallery");
  await loadBank();
  if (milestones().some((m) => m.done)) judge.load().catch(() => {});
  await render();
  onSynced((what) => { if (what === "local-changed" || what === "merged") { render(); shell.refresh(); } });
}
main().catch((e) => { $("cards").innerHTML = `<div class="error">Could not load: ${esc(e.message)}</div>`; });
