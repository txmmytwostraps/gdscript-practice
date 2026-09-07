// A milestone: a script built in steps, with a stage beside the editor that
// runs the script through the judge. Step ids (m1-s1 …) are stored in the
// solved map, so they sync like problems.
import { JudgeClient, tidyError } from "./judge-client.js";
import { mountShell } from "./shell.js";
import { sync, onSynced } from "./sync.js";
import { store, state, loadBank, getDraft, setDraft, clearDraft, saveSolved, milestoneStatus, dayKey } from "./progress.js";
import { MILESTONES, TOPICS } from "./route-data.js";
import * as auth from "./auth.js";
import { makeEditor } from "./editor.js";
import { makeScene, wireScene } from "./scene.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rich = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
const params = new URLSearchParams(location.search);
const meta = MILESTONES.find((m) => m.id === (params.get("m") || "m1")) || MILESTONES[0];
const preview = params.has("preview");

let data = null, step = null, stepAt = 0, editor, scene, stage, running = false;

const judge = new JudgeClient({
  src: "../web/index.html", container: $("judge-frame"), timeoutMs: 5000,
  inline: params.get("judge") === "inline",   // testing aid, see judge-client.js
  onStatus: (s) => {
    $("judge-status").textContent = { loading: "judge: loading…", ready: "judge: ready", timeout: "judge: timed out", crash: "judge: crashed", error: "judge: failed to load" }[s] || "judge: " + s;
    $("judge-status").className = "judge-status caps " + (s === "ready" ? "ready" : ["timeout", "crash", "error"].includes(s) ? "bad" : "");
    $("run").disabled = s !== "ready";
  },
  onTimeout: () => { setVerdict("warn", "[!] Your code took more than 5 seconds — check for an infinite loop", "Restarting the judge…"); setTimeout(() => location.reload(), 1200); },
});

function setVerdict(kind, text, message) {
  $("results").className = "results " + (kind || "");
  const detail = String(text || "").replace(/^[x]s*/, "");
  $("verdict").textContent = kind === "pass" ? "✓ Correct" : kind === "fail" ? "✗ Not yet" : detail;
  $("verdict-sub").textContent = kind === "pass" || kind === "fail" ? detail : ""; $("verdict-sub").hidden = !$("verdict-sub").textContent;
  $("message").textContent = message || ""; $("message").hidden = !message;
}
function clearResults() { setVerdict("", "Run the checks to see where the step stands."); $("count").textContent = ""; $("result-table").hidden = true; $("errors").hidden = true; }

// Values as a learner would write them: Vector2(1, 0), "left", 150.
function fmtVal(v) {
  if (v && typeof v === "object" && v.$v2) return `Vector2(${v.$v2.join(", ")})`;
  if (v && typeof v === "object" && v.$rect) return `Rect2(${v.$rect.join(", ")})`;
  if (typeof v === "string") return JSON.stringify(v);
  if (v === null || v === undefined) return "nothing";
  return JSON.stringify(v);
}
// A check, in words: what is done, then what should be true afterwards.
function describe(t) {
  const acts = (t.script || []).map((a) => a.frames ? `${a.frames} frame${a.frames === 1 ? "" : "s"}${a.delta ? ` of ${(+a.delta).toFixed(3)} s` : ""}` : `${a.call}(${(a.args || []).map(fmtVal).join(", ")})`);
  const after = acts.length ? `after ${acts.join(", then ")}: ` : "at the start: ";
  if (t.result) return `${after.replace(/^after /, "").replace(/: $/, "")} returns ${fmtVal(t.expect)}`;
  if (t.read) return `${after}${t.read} is ${fmtVal(t.expect)}`;
  if (t.out) return `${after}prints ${t.out.map((l) => JSON.stringify(l)).join(", then ")}`;
  return after.replace(/: $/, "");
}

function renderSteps() {
  const st = milestoneStatus(meta);
  const godotOn = location.hash === "#godot";
  $("steps").innerHTML = data.steps.map((s, i) => `<a href="#s${i + 1}" class="${state.solved[s.id] ? "done" : ""} ${!godotOn && i === stepAt ? "current" : ""}">${state.solved[s.id] ? "✓" : "[ ]"} Step ${i + 1}</a>`).join("")
    + `<a href="#godot" class="godot ${st.godotDone ? "done" : ""} ${godotOn ? "current" : ""}">${st.godotDone ? "✓" : "[ ]"} In Godot</a>`;
  $("banner").hidden = !st.done;
  if (st.done) $("banner").innerHTML = `<span>[!] Milestone ${meta.number} complete · ${esc(meta.badge)}</span><a href="gallery.html#${meta.id}">See it in the Gallery ›</a>${st.godotDone ? "" : `<a href="#godot">Build it in Godot ›</a>`}`;
  $("next").hidden = !(step && state.solved[step.id] && stepAt < data.steps.length - 1);
}

function showStep(i) {
  stepAt = Math.max(0, Math.min(data.steps.length - 1, i));
  step = data.steps[stepAt];
  $("stepbody").hidden = false; $("godotbody").hidden = true;
  $("eyebrow").textContent = `// milestone ${String(meta.number).padStart(2, "0")} · step ${stepAt + 1} of ${data.steps.length}`;
  $("title").textContent = step.title;
  document.title = `${step.title} · GDScript Practice`;
  $("prompt").innerHTML = rich(step.prompt);
  $("hints").innerHTML = (step.hints || []).map((h, i) => `<div class="stage"><button type="button" class="linkish" data-hint="${i}">[+] Hint ${i + 1} of ${step.hints.length}</button><p hidden>${rich(h)}</p></div>`).join("");
  $("checks").innerHTML = step.tests.map((t) => `<div class="row"><span class="name">${esc(t.name)}</span><span class="how">${esc(describe(t))}</span></div>`).join("");
  $("docs").hidden = !(step.docs || []).length;
  $("doclist").innerHTML = (step.docs || []).map((d) => `<div class="row"><code>${esc(d.name)}</code><span>${esc(d.what)}</span></div>`).join("");
  const d = getDraft(step.id);
  editor.set(d ? d.code : step.starter);
  $("saved").textContent = d ? "saved" : "";
  clearResults();
  stage.setButtons(step.scene ? step.scene.buttons : []);
  judge.ready.then(() => stage.reset()).catch(() => {});
  renderSteps();
  $("editor-pane").hidden = false;
}

function showGodot() {
  $("stepbody").hidden = true; $("godotbody").hidden = false; $("editor-pane").hidden = true;
  $("eyebrow").textContent = `// milestone ${String(meta.number).padStart(2, "0")} · the same build in Godot`;
  $("title").textContent = "Build it in Godot";
  document.title = "Build it in Godot · GDScript Practice";
  $("godot-intro").innerHTML = rich("Now make the same robot in a real Godot project on your machine. Tick each line as you do it. The list is the whole build: nothing here needs anything you have not written above.");
  const ticks = store.get(`${meta.id}.godot`, []);
  $("checklist").innerHTML = data.godot.map((line, i) => `<label class="${ticks[i] ? "on" : ""}"><input type="checkbox" data-i="${i}" ${ticks[i] ? "checked" : ""}><span>${rich(line)}</span></label>`).join("");
  renderSteps();
}

async function runChecks() {
  if (!step || running || $("run").disabled) return;
  running = true; $("run").disabled = true;
  setVerdict("", "Running…"); editor.markError(null);
  try {
    const { result, errors } = await judge.run(editor.get(), step);
    renderResult(result, errors);
    stage.refresh();
  } catch (e) { if (!e.timedOut) setVerdict("fail", "Could not run", e.message); }
  finally { running = false; if ($("judge-status").classList.contains("ready")) $("run").disabled = false; }
}
function renderResult(result, errors) {
  $("result-table").hidden = true; $("errors").hidden = true;
  // Same as the practice page: the message and the corrected line number only, no backtrace.
  const showErrors = (list) => {
    const lines = (list || []).map(tidyError).filter((l) => l && !/GDScript backtrace|^\s*\[\d+\]/.test(l));
    const shown = lines.slice(0, 20);
    if (lines.length > 20) shown.push(`… ${lines.length - 20} more lines hidden`);
    if (shown.length) { $("error-lines").textContent = shown.join("\n"); $("errors").hidden = false; const m = /line (\d+)/.exec(shown.join("\n")); if (m) editor.markError(Number(m[1]) - 1); }
  };
  if (result.status === "compile_error") { setVerdict("fail", "Did not compile"); $("count").textContent = `0 / ${step.tests.length} checks`; showErrors(errors.length ? errors : [result.error]); return; }
  if (result.status === "error") { setVerdict("fail", "Not yet", result.error); $("count").textContent = `0 / ${step.tests.length} checks`; showErrors(errors); return; }
  const allPass = result.passed === result.total;
  $("count").textContent = `${result.passed} / ${result.total} checks`;
  $("result-table").innerHTML = `<tr><th></th><th>Check</th><th>Should be</th><th>Your script gave</th></tr>` + result.results.map((r, i) => {
    const t = step.tests[i] || {};
    return `<tr class="${r.pass ? "pass" : "fail"}"><td class="mark">${r.pass ? "✓" : "✗"}</td><td>${esc(t.name || "")}<div class="why">${esc(describe(t))}</div></td><td>${esc(t.out && t.expect === null ? t.out.join(" / ") : fmtVal(r.expect))}</td><td class="got">${r.error ? `<span class="err">${esc(r.error)}</span>` : esc(t.out && t.expect === null ? (r.out || []).join(" / ") || "(nothing printed)" : fmtVal(r.got))}</td></tr>`;
  }).join("");
  $("result-table").hidden = false;
  if (errors.length) showErrors(errors);
  if (allPass) markStepDone(); else setVerdict("fail", "Not yet", "Fix what the failing check says, then run again.");
}
function markStepDone() {
  const first = !state.solved[step.id];
  if (first) { state.solved[step.id] = new Date().toISOString(); saveSolved(); sync.push(step.id); if (sync.user) auth.insertAttempt(sync.user.id, step.id, "milestone", "pass").catch(() => {}); }
  const st = milestoneStatus(meta);
  setVerdict("pass", st.done ? `Step ${stepAt + 1} done · milestone complete` : `Step ${stepAt + 1} done`, stepAt < data.steps.length - 1 ? "The next step starts from this script." : st.godotDone ? "" : "Now build the same robot in Godot: the last tab above.");
  renderSteps();
}

async function main() {
  const shell = mountShell("route");
  await loadBank();
  const r = await fetch(`../milestones/${meta.id}.json`);
  if (!r.ok) throw new Error("could not load the milestone");
  data = await r.json();
  $("crumb-title").textContent = `Milestone ${String(meta.number).padStart(2, "0")} · ${meta.title}`;
  const st = milestoneStatus(meta);
  if (!st.unlocked && !preview) {
    $("title").textContent = meta.title;
    $("eyebrow").textContent = `// milestone ${String(meta.number).padStart(2, "0")} · locked`;
    $("lock").hidden = false; $("stepbody").hidden = true; $("editor-pane").hidden = true; $("steps").hidden = true;
    const afterTopic = TOPICS.find((t) => t.concept === meta.after);
    $("lock").innerHTML = `This milestone unlocks when every topic up to <b>${esc(afterTopic ? afterTopic.title : meta.after)}</b> on the route is cleared: ${st.topicsToGo} topic${st.topicsToGo === 1 ? "" : "s"} to go. <a href="route.html#${meta.id}">Back to the route ›</a>`;
    return;
  }
  editor = makeEditor($("editor"), { onRun: runChecks });
  const sceneSpec = data.scene || {};
  scene = makeScene($("stage"), sceneSpec.kind || "move");
  stage = wireScene(scene, judge, { buttonsEl: $("scene-buttons"), noteEl: $("scene-note"), getCode: () => editor.get(), watch: sceneSpec.watch });
  judge.load().catch((e) => setVerdict("fail", "The judge could not start", e.message));
  let saveTimer = null, refreshTimer = null;
  editor.onChange(() => {
    if (!step) return;
    $("saved").textContent = "…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { const text = editor.get(); if (text === step.starter) { clearDraft(step.id); $("saved").textContent = ""; } else { setDraft(step.id, text); $("saved").textContent = "saved"; } sync.push(step.id); }, 300);
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => stage.refresh(), 900);
  });
  $("run").addEventListener("click", runChecks);
  $("reset").addEventListener("click", () => { if (!step) return; clearDraft(step.id); editor.set(step.starter); $("saved").textContent = ""; clearResults(); stage.reset(); sync.push(step.id); editor.focus(); });
  $("next").addEventListener("click", () => { location.hash = `#s${stepAt + 2}`; });
  $("hints").addEventListener("click", (ev) => { const b = ev.target.closest("button[data-hint]"); if (!b) return; const p = b.nextElementSibling; p.hidden = !p.hidden; b.textContent = (p.hidden ? "[+] " : "[-] ") + b.textContent.slice(4); });
  $("checklist").addEventListener("change", (ev) => {
    const box = ev.target.closest("input[type=checkbox]"); if (!box) return;
    const ticks = store.get(`${meta.id}.godot`, []); ticks[Number(box.dataset.i)] = box.checked; store.set(`${meta.id}.godot`, ticks);
    box.closest("label").classList.toggle("on", box.checked);
    const all = data.godot.every((_, i) => ticks[i]);
    const id = `${meta.id}-godot`;
    if (all && !state.solved[id]) { state.solved[id] = new Date().toISOString(); saveSolved(); sync.push(id); }
    if (!all && state.solved[id]) { delete state.solved[id]; saveSolved(); sync.push(id); }
    renderSteps(); shell.refresh();
  });
  const route = () => {
    if (location.hash === "#godot") { showGodot(); return; }
    const m = /^#s(\d+)$/.exec(location.hash);
    const first = data.steps.findIndex((s) => !state.solved[s.id]);
    showStep(m ? Number(m[1]) - 1 : first < 0 ? data.steps.length - 1 : first);
  };
  window.addEventListener("hashchange", route);
  route();
  onSynced((what) => { if (what === "local-changed" && step) { const d = getDraft(step.id); editor.set(d ? d.code : step.starter); } renderSteps(); shell.refresh(); });
}
main().catch((e) => { setVerdict("fail", "Could not load the milestone", e.message); $("title").textContent = "Milestone"; });
