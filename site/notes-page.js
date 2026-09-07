// The Notes page: every note, unresolved first, each linking to its problem.
import { mountShell } from "./shell.js";
import { onSynced, sync } from "./sync.js";
import * as notes from "./notes.js";
import { loadBank, state, dayKey } from "./progress.js";
import { TOPICS } from "./route-data.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const topicTitle = (concept) => { const t = TOPICS.find((x) => x.concept === concept); return t ? t.title : concept; };

function render() {
  const list = notes.list();
  const open = list.filter((n) => !n.resolved).length;
  $("count").textContent = list.length ? `${open} unresolved · ${list.length - open} resolved` : "";
  $("notes").innerHTML = list.length ? list.map((n) => {
    const p = state.byId.get(n.problem_id);
    return `<div class="note ${n.resolved ? "resolved" : ""}" data-id="${esc(n.problem_id)}">
      <div class="head"><a href="practice.html#${esc(n.problem_id)}">${esc(p ? p.title : n.problem_id)}</a><span class="muted">${esc(p ? topicTitle(p.concept) : "")}</span><span class="dim">${n.updated_at ? dayKey(new Date(n.updated_at)) : ""}</span></div>
      <label><input type="checkbox" ${n.resolved ? "checked" : ""}> Resolved</label>
      <div class="text">${esc(n.text.trim())}</div>
    </div>`;
  }).join("") : `<div class="muted" style="font-size:13px">No notes yet. Each problem has a notes box under its documentation.${sync.user ? "" : " Sign in to see the notes saved in your account."}</div>`;
}

async function main() {
  const shell = mountShell("stats");
  await loadBank();
  render();
  $("notes").addEventListener("change", async (ev) => {
    const box = ev.target.closest("input[type=checkbox]"); if (!box) return;
    const id = box.closest(".note").dataset.id;
    try { await notes.save(sync.user, id, { resolved: box.checked }); } catch (e) { sync.note("Could not save the note: " + e.message); }
    render();
  });
  onSynced((what) => { if (what === "merged" || what === "local-changed") { render(); shell.refresh(); } });
}
main().catch((e) => { $("intro").textContent = "Could not load: " + e.message; });
