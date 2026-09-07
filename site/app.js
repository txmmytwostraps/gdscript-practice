// The practice page: pick a problem, edit, run, see results.
import { JudgeClient, tidyError } from "./judge-client.js";
import { loadProblem } from "./problems.js";
import { mountShell } from "./shell.js";
import { sync, onSynced, exportProgress, clearProgress } from "./sync.js";
import { store, state, loadBank, getDraft, setDraft, clearDraft, saveSolved, saveFails, todayRun, routeTopics, currentTopic, dayKey } from "./progress.js";
import { TOPICS } from "./route-data.js";
import * as reviews from "./reviews.js";
import * as auth from "./auth.js";
import { makeParsons } from "./parsons.js";
import { makeEditor } from "./editor.js";
import { candidates } from "./mutate.js";
import * as notes from "./notes.js";

// Problem types. ?mode=parsons puts the solution's lines in order;
// ?mode=bug plants one bug in the solution to find and fix. Reviews pick a
// variant by themselves so a review is not a straight repeat.
const urlMode = new URLSearchParams(location.search).get("mode");
let activeMode = "normal";   // normal | parsons | bug, for the problem on screen
let parsons = null;          // the Parsons widget when active
let bugCode = "";            // the planted-bug code when active

// Review mode: practice.html?review=1#id walks through today's due reviews.
const reviewMode = new URLSearchParams(location.search).has("review");
let reviewIds = [];          // today's pending reviews, in order
let attemptFails = 0;        // misses since this problem was opened
let reviewRecorded = false;  // the first verdict of a review decides it

const DIFF = ["novice", "beginner", "intermediate", "advanced"];
const MAX_ERROR_LINES = 20;
const UNLOCK_AFTER = 2;

const $ = (id) => document.getElementById(id);
const el = {
  topic: $("topic"), difficulty: $("difficulty"), prev: $("prev"), nextseq: $("nextseq"), position: $("position"), dots: $("dots"), todaybar: $("todaybar"),
  eyebrow: $("eyebrow"), title: $("title"), prompt: $("prompt"), requirements: $("requirements"), hints: $("hints"),
  solution: $("solution"), solutionToggle: $("solution-toggle"), tests: $("tests"), docs: $("docs"), doclist: $("doclist"), again: $("again"),
  run: $("run"), reset: $("reset"), next: $("next"), saved: $("saved"), judgeStatus: $("judge-status"),
  results: $("results"), verdict: $("verdict"), count: $("count"), message: $("message"), resultTable: $("result-table"),
  output: $("output"), outputLines: $("output-lines"), errors: $("errors"), errorLines: $("error-lines"),
  note: $("note"), noteResolved: $("note-resolved"), noteSaved: $("note-saved"), ask: $("ask"), askNote: $("ask-note"),
};
let filters = store.get("filters", { topic: "", difficulty: "any" });

// ---------- formatting ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rich = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
const num = (n) => (Number.isInteger(n) ? n : +n.toFixed(4));
const godotValue = (v) => {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    if (v.$v2) return `Vector2(${v.$v2.map(num).join(", ")})`;
    if (v.$rect) return `Rect2(${v.$rect.map(num).join(", ")})`;
  }
  if (Array.isArray(v) && v.some((x) => x && typeof x === "object" && !Array.isArray(x) && (x.$v2 || x.$rect))) return `[${v.map(godotValue).join(", ")}]`;
  return null;
};
const paramTypes = (sig) => ((/\((.*)\)/.exec(sig) || [])[1] || "").split(",").map((p) => (p.split(":")[1] || "").replace(/=.*/, "").trim());
const returnType = (sig) => (/->\s*(\w+)/.exec(sig) || [])[1] || "";
const fmtTyped = (v, type) => godotValue(v) ?? ((type === "float" && typeof v === "number" && Number.isInteger(v)) ? v.toFixed(1) : JSON.stringify(v));
const callStr = (p, args) => {
  const name = (/func\s+(\w+)/.exec(p.signature) || [, "solve"])[1];
  const types = paramTypes(p.signature);
  return `${name}(${args.map((a, i) => fmtTyped(a, types[i])).join(", ")})`;
};
// Printed output is shown as stacked lines, exactly as Godot's Output panel would.
// Print-only tests show the lines alone under an "output" heading; tests that
// also return a value label the printed part so it is not read as the answer.
const printedHtml = (lines, alone) => lines.length ? `${alone ? "" : `<span class="p">prints</span>\n`}${lines.map(esc).join("\n")}` : `<span class="p">${alone ? "(nothing printed)" : "prints nothing"}</span>`;
// Game-loop tests run _process(delta) N times before calling solve.
const framesLabel = (t) => (t.frames != null ? `<span class="muted">after ${t.frames} frame${t.frames === 1 ? "" : "s"} · </span>` : "");
const expectHtml = (p, t) => (t.expect === null && t.out) ? printedHtml(t.out, true) : esc(fmtTyped(t.expect, returnType(p.signature))) + (t.out ? `\n${printedHtml(t.out)}` : "");

const KW = /^(func|return|var|const|if|elif|else|while|for|in|not|and|or|pass|break|continue|true|false|null|extends|class_name|match|is|self)$/;
const TYPES = /^(int|float|String|bool|Array|Dictionary|Variant|Vector2|Vector2i|Rect2|Rect2i|void)$/;
function highlight(code) {
  return code.split("\n").map((line) => {
    let s = "", i = 0;
    while (i < line.length) {
      const c = line[i];
      if (c === "#") { s += `<span class="c">${esc(line.slice(i))}</span>`; break; }
      if (c === '"') { let j = i + 1; while (j < line.length && line[j] !== '"') { if (line[j] === "\\") j++; j++; } s += `<span class="s">${esc(line.slice(i, j + 1))}</span>`; i = j + 1; continue; }
      let m;
      if ((m = /^\d+(\.\d+)?/.exec(line.slice(i)))) { s += `<span class="n">${m[0]}</span>`; i += m[0].length; continue; }
      if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(i)))) {
        const w = m[0], next = line[i + w.length];
        s += KW.test(w) ? `<span class="k">${w}</span>` : TYPES.test(w) ? `<span class="t">${w}</span>` : next === "(" ? `<span class="f">${w}</span>` : w;
        i += w.length; continue;
      }
      s += esc(c); i++;
    }
    return s.replace(/\t/g, "    ");
  }).join("\n");
}

const TYPE_WORDS = { int: "a whole number", float: "a number that can have decimals", String: "some text", bool: "true or false", Array: "an array", Dictionary: "a dictionary", Vector2: "a Vector2 (an x and a y)", Vector2i: "a Vector2i", Rect2: "a Rect2 (a rectangle)", Rect2i: "a Rect2i", Variant: "any kind of value", void: "nothing" };
function describeSignature(sig, printOnly = false) {
  const params = ((/\((.*)\)/.exec(sig) || [])[1] || "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const [left, def] = s.split("=").map((x) => x.trim());
    const [name, type] = left.split(":").map((x) => x.trim());
    return `<code>${esc(name)}</code>${type ? `, ${TYPE_WORDS[type] || type}` : ""}${def !== undefined ? ` (if left out it is <code>${esc(def)}</code>)` : ""}`;
  });
  const ret = returnType(sig);
  const gives = ret ? (ret === "void" ? "returns nothing" : `must return ${TYPE_WORDS[ret] || ret}`) : printOnly ? "prints instead of returning anything" : "returns a value";
  const typed = /:\s*\w+\s*[,)=]/.test(sig);
  const sep = typed ? "; " : ", ";
  const receives = params.length === 0 ? "receives nothing" : params.length === 1 ? `receives ${params[0]}` : `receives ${params.slice(0, -1).join(sep)}${typed ? "; and " : " and "}${params[params.length - 1]}`;
  const hasHints = /:\s*\w+\s*[,)=]/.test(sig) || ret;
  const typesTopic = state.problems.find((p) => p.concept === "gq-types");
  const hintNote = typesTopic ? ` The parts like <code>-> int</code> are type hints — optional in GDScript, covered in <a href="practice.html#${typesTopic.id}">lesson 27</a>.` : " The parts like <code>-> int</code> are type hints — optional in GDScript; you may not have met them yet.";
  return `The first line means: <code>solve</code> ${receives}, and ${gives}.${hasHints ? hintNote : ""}`;
}

// ---------- editor ----------
let editor;

// ---------- judge ----------
const judge = new JudgeClient({
  src: "../web/index.html", container: $("judge-frame"), timeoutMs: 5000,
  onStatus: (s) => {
    el.judgeStatus.textContent = { loading: "judge: loading…", ready: "judge: ready", timeout: "judge: timed out", crash: "judge: crashed", error: "judge: failed to load" }[s] || "judge: " + s;
    el.judgeStatus.className = "judge-status caps " + (s === "ready" ? "ready" : ["timeout", "crash", "error"].includes(s) ? "bad" : "");
    el.run.disabled = s !== "ready";
  },
  onTimeout: (err) => {
    sessionStorage.setItem("gdp.reloaded", err.crashed ? "crash" : "timeout");
    setVerdict("warn", err.crashed ? "[!] The judge crashed while running your code" : "[!] Your code took more than 5 seconds — check for an infinite loop", "Restarting the judge…");
    setTimeout(() => location.reload(), 1200);
  },
});

// ---------- state ----------
let current = null, running = false;
const topicOf = (concept) => TOPICS.find((t) => t.concept === concept);
function matches(p) { return p.concept === filters.topic && (filters.difficulty === "any" || String(p.difficulty) === filters.difficulty); }
function pool() { return state.problems.filter(matches); }

function renderFilters() {
  const topics = routeTopics().filter((t) => t.total > 0);
  if (!topics.some((t) => t.concept === filters.topic)) filters.topic = (currentTopic() || topics[0]).concept;
  el.topic.innerHTML = topics.map((t) => `<option value="${t.concept}">${t.locked ? "[#] " : ""}L${String(t.lesson).padStart(2, "0")} ${esc(t.title)} (${t.done}/${t.total})</option>`).join("");
  el.topic.value = filters.topic; el.difficulty.value = filters.difficulty;
  const list = pool();
  const at = current ? list.findIndex((p) => p.id === current.id) : -1;
  el.position.textContent = list.length === 0 ? "No problems match" : at >= 0 ? `Problem ${at + 1} of ${list.length}` : `${list.length} problems`;
  el.prev.disabled = at <= 0; el.nextseq.disabled = at < 0 || at >= list.length - 1;
  el.dots.innerHTML = list.map((p, i) => `<button type="button" data-id="${p.id}" class="${state.solved[p.id] ? "solved" : ""} ${i === at ? "current" : ""}" title="Problem ${i + 1}${state.solved[p.id] ? " (solved)" : ""}">${state.solved[p.id] ? "✓" : ""}${i + 1}</button>`).join("");
  renderTodayBar();
}
function renderTodayBar() {
  if (reviewMode) {
    const at = current ? reviewIds.indexOf(current.id) : -1;
    el.todaybar.innerHTML = reviewIds.length ? `<span class="accent">Review</span><div class="segs">${reviewIds.map((id) => `<div class="${reviews.all()[id] && reviews.all()[id].reviewed_at && reviews.dueToday().doneToday.some((r) => r.problem_id === id) ? "on" : ""}"></div>`).join("")}</div><b>${at >= 0 ? at + 1 : "–"} / ${reviewIds.length} due today</b>` : `<span class="accent">Review</span><b>nothing due</b>`;
    return;
  }
  const run = todayRun();
  const n = run.newIds.length;
  el.todaybar.innerHTML = n ? `<span>${esc(run.topicTitle)}</span><div class="segs">${run.newIds.map((id) => `<div class="${state.solved[id] ? "on" : ""}"></div>`).join("")}</div><b>${run.newDone} / ${n} today</b>` : "";
}

function renderProblem(p) {
  const t = topicOf(p.concept);
  const list = pool(); const at = list.findIndex((x) => x.id === p.id);
  el.eyebrow.textContent = `// ${t ? t.title.toLowerCase() : p.concept} · problem ${at + 1} of ${list.length} · ${DIFF[p.difficulty]}`;
  el.title.textContent = p.title;
  el.prompt.innerHTML = rich(p.prompt);
  $("signature-help").innerHTML = describeSignature(p.signature, p.tests.every((tt) => tt.expect === null && tt.out));
  const reqs = [];
  if (p.require_methods) reqs.push("Must define: " + p.require_methods.map((m) => `<code>${esc(m)}()</code>`).join(", "));
  if (p.require_names) reqs.push("Must declare: " + p.require_names.map((m) => `<code>${esc(m)}</code>`).join(", ") + (p.once_only ? ` — and ${p.once_only.map((x) => `<code>${x}</code>`).join(", ")} may appear only once` : ""));
  el.requirements.innerHTML = reqs.join("<br>"); el.requirements.hidden = reqs.length === 0;
  // Staged hints: each opens on its own; opening one never counts as a miss.
  const hints = Array.isArray(p.hints) ? p.hints : (p.hint ? [p.hint] : []);
  el.hints.innerHTML = hints.map((h, i) => `<div class="stage"><button type="button" class="linkish" data-hint="${i}">[+] Hint ${i + 1} of ${hints.length}</button><p hidden>${rich(h)}</p></div>`).join("");
  el.solution.innerHTML = highlight(p.solution); el.solution.hidden = true;
  el.tests.innerHTML = p.tests.map((tt) => `<div class="row">${tt.name ? `<span class="name">${esc(tt.name)}</span>` : ""}<span>${framesLabel(tt)}${esc(callStr(p, tt.args))}</span><span class="arrow">→</span><span class="exp">${expectHtml(p, tt)}</span></div>`).join("");
  const docs = Array.isArray(p.docs) ? p.docs : [];
  el.docs.hidden = docs.length === 0;
  el.doclist.innerHTML = docs.map((d) => `<div class="row"><code>${esc(d.name)}</code><span>${esc(d.what)}</span></div>`).join("");
  el.again.hidden = !state.solved[p.id];
  updateSolutionLock(p);
  document.title = `${p.title} · GDScript Practice`;
}
function updateSolutionLock(p) {
  const misses = state.fails[p.id] || 0;
  const unlocked = Boolean(state.solved[p.id]) || misses >= UNLOCK_AFTER;
  el.solutionToggle.classList.toggle("locked", !unlocked);
  el.solutionToggle.textContent = unlocked ? (el.solution.hidden ? "[+] Reference solution" : "[-] Reference solution") : `[#] Reference solution — locked · ${UNLOCK_AFTER - misses} more miss${UNLOCK_AFTER - misses === 1 ? "" : "es"} to unlock`;
  if (!unlocked) el.solution.hidden = true;
}
function setVerdict(kind, text, message) {
  el.results.className = "results " + kind;
  el.verdict.textContent = text;
  el.message.textContent = message || ""; el.message.hidden = !message;
}
function clearResults() {
  setVerdict("", "Run your code to check it against the tests.");
  el.count.textContent = ""; el.resultTable.hidden = true; el.output.hidden = true; el.errors.hidden = true;
  editor.markError(null);
}

async function showProblem(id, { keepResults = false } = {}) {
  if (!state.byId.has(id)) return;
  const p = await loadProblem(id);
  current = p;
  if (p.concept !== filters.topic) { filters.topic = p.concept; store.set("filters", filters); }
  if (!matches(p)) { filters.difficulty = "any"; store.set("filters", filters); }   // never hide the problem being shown
  store.set("current", id);
  renderFilters();
  renderProblem(p);
  const draft = getDraft(id);
  // A review starts from the starter, not from the old solution.
  const inReview = reviewMode && reviewIds.includes(id);
  attemptFails = 0; reviewRecorded = false;
  activeMode = urlMode === "parsons" || urlMode === "bug" ? urlMode : inReview ? reviewVariant(id) : "normal";
  if (activeMode === "normal") {
    editor.set(inReview ? p.starter : draft ? draft.code : p.starter);
    el.saved.textContent = !inReview && draft ? "saved" : "";
  }
  await applyMode(p);
  if (inReview) { el.eyebrow.textContent = `// review · ${topicOf(p.concept) ? topicOf(p.concept).title.toLowerCase() : p.concept} · ${reviewIds.indexOf(id) + 1} of ${reviewIds.length}${activeMode !== "normal" ? " · " + modeLabel(activeMode) : ""}`; el.again.hidden = true; }
  if (!keepResults) clearResults();
  renderModes(p);
  renderNote(p);
  location.hash = id;
}

// ---------- notes and Ask Claude ----------
function renderNote(p) {
  const n = notes.get(p.id);
  el.note.value = n ? n.text : "";
  el.noteResolved.checked = Boolean(n && n.resolved);
  el.noteSaved.textContent = n && n.text ? `saved ${n.updated_at ? dayKey(new Date(n.updated_at)) : ""}` : "";
  el.askNote.textContent = "";
}
async function saveNote(patch) {
  if (!current) return;
  el.noteSaved.textContent = "…";
  try { await notes.save(sync.user, current.id, patch); el.noteSaved.textContent = sync.user ? "saved to your account" : "saved in this browser"; }
  catch (e) { el.noteSaved.textContent = "saved here only: " + e.message; }
}
// The prompt Tim pastes into a Claude chat: the problem, the code as it is,
// the failing checks, the note, and the instruction to nudge, not answer.
function askPrompt(p) {
  const code = activeMode === "parsons" && parsons ? parsons.get() : editor.get();
  const failing = el.resultTable.hidden ? [] : [...el.resultTable.querySelectorAll("tr.fail")].map((r) => [...r.children].slice(1).map((c) => c.innerText.trim().replace(/\n+/g, " ")).join(" | "));
  const errors = el.errors.hidden ? "" : el.errorLines.textContent.trim();
  const n = notes.get(p.id);
  const tests = p.tests.map((t) => `- ${t.name ? t.name + ": " : ""}${callStr(p, t.args)} → ${t.expect === null && t.out ? "prints " + JSON.stringify(t.out) : fmtTyped(t.expect, returnType(p.signature))}`).join("\n");
  return [
    "I am a beginner learning GDScript with the GDQuest course \"Learn GDScript From Zero\". Nudge me toward the fix. Do not give the answer and do not write the code. Ask me a question or point at the line to look at.",
    `\n## The problem: ${p.title}\n${p.prompt}\n\nThe checks:\n${tests}`,
    `\n## My code right now\n\`\`\`gdscript\n${code}\n\`\`\``,
    `\n## What failed on my last run\n${failing.length ? failing.map((f) => "- " + f).join("\n") : errors ? errors : "I have not run it yet, or every check passed."}`,
    `\n## My note on this problem\n${n && n.text.trim() ? n.text.trim() : "(no note)"}`,
    "\nRemember: nudge me toward the fix, do not give the answer or write the code.",
  ].join("\n");
}
async function askClaude() {
  if (!current) return;
  const text = askPrompt(current);
  try { await navigator.clipboard.writeText(text); el.askNote.textContent = "copied · paste it into a Claude chat"; }
  catch (e) {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px"; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand && document.execCommand("copy"); ta.remove();
    el.askNote.textContent = ok ? "copied · paste it into a Claude chat" : "could not copy: " + e.message;
  }
}

const modeLabel = (m) => (m === "parsons" ? "put the lines in order" : m === "bug" ? "fix the bug" : "");
// Reviews rotate: the first (fresh) review is the plain problem, later ones
// alternate between the Parsons and fix-the-bug forms.
function reviewVariant(id) {
  const r = reviews.all()[id];
  if (!r || r.stage !== "spaced") return "normal";
  return (r.step || 0) % 2 === 1 ? "parsons" : "bug";
}

async function applyMode(p) {
  const host = $("editor-host"), pz = $("parsons");
  const note = document.getElementById("bugnote"); if (note) note.remove();
  parsons = null; bugCode = "";
  if (activeMode === "parsons") {
    host.hidden = true; pz.hidden = false;
    parsons = makeParsons(pz, p.solution, p.id);
    el.eyebrow.textContent += " · put the lines in order";
    el.saved.textContent = "";
    return;
  }
  pz.hidden = true; host.hidden = false;
  if (activeMode === "bug") {
    el.saved.textContent = "";
    setVerdict("", "Planting a bug…");
    const found = await plantBug(p);
    if (!found) { activeMode = "normal"; editor.set(p.starter); setVerdict("warn", "[!] No bug variant for this problem", "Showing the normal version instead."); return; }
    bugCode = found.code;
    editor.set(bugCode);
    el.eyebrow.textContent += " · fix the bug";
    const n = document.createElement("div"); n.id = "bugnote"; n.className = "bugnote";
    n.textContent = "This is a working solution with one bug planted in it. Find it, fix it, and run.";
    el.requirements.insertAdjacentElement("afterend", n);
    el.hints.insertAdjacentHTML("beforeend", `<div class="stage"><button type="button" class="linkish" data-hint="bug">[+] Hint · what kind of bug</button><p hidden>The bug is ${esc(found.kind)}.</p></div>`);
  }
}

// Try candidate mutations until one compiles and fails at least one test.
async function plantBug(p) {
  for (const c of candidates(p.solution, p.id).slice(0, 12)) {
    try {
      const { result } = await judge.run(c.code, p);
      if (result.status === "ok" && result.passed < result.total) return c;
    } catch (e) { return null; }
  }
  return null;
}

function renderModes(p) {
  const base = `practice.html#${p.id}`;
  const link = (m, text) => (activeMode === m ? `<span class="dim">${text}</span>` : `<a href="practice.html?mode=${m}#${p.id}">${text}</a>`);
  const stuck = activeMode === "normal" && (state.fails[p.id] || 0) >= UNLOCK_AFTER && !state.solved[p.id] ? `<span class="amber">[!] Stuck? Try it as a Parsons: </span>` : "";
  $("modes").innerHTML = `${stuck}<span class="muted">Try as:</span> ${activeMode === "normal" ? `<span class="dim">normal</span>` : `<a href="${base}">normal</a>`} · ${link("parsons", "[~] put the lines in order")} · ${link("bug", "[~] fix the bug")}`;
}
function pickNext() {
  if (reviewMode) {   // next pending review, or back to Today when done
    const next = reviews.dueToday().pending.find((r) => !current || r.problem_id !== current.id);
    if (next) showProblem(next.problem_id); else location.href = "./";
    return;
  }
  const list = pool();
  if (list.length === 0) return;
  const unsolved = list.filter((p) => !state.solved[p.id] && (!current || p.id !== current.id));
  const from = unsolved.length ? unsolved : list.filter((p) => !current || p.id !== current.id);
  if (unsolved.length === 0) setVerdict("pass", "[x] Every problem in this topic is solved", "Here is a random one to redo.");
  const choice = from.length ? from[Math.floor(Math.random() * from.length)] : list[0];
  showProblem(choice.id, { keepResults: unsolved.length === 0 });
}

// ---------- running ----------
async function runCode() {
  if (!current || running || el.run.disabled) return;
  running = true; el.run.disabled = true;
  setVerdict("", "Running…"); editor.markError(null);
  const code = activeMode === "parsons" && parsons ? parsons.get() : editor.get();
  try { const { result, errors } = await judge.run(code, current); renderResult(result, errors); }
  catch (e) { if (!e.timedOut) setVerdict("fail", "[x] Could not run", e.message); }
  finally { running = false; if (el.judgeStatus.classList.contains("ready")) el.run.disabled = false; }
}
function missText(id) { return `miss ${Math.min(state.fails[id] || 0, UNLOCK_AFTER)} of ${UNLOCK_AFTER}`; }
function renderResult(result, errors) {
  el.resultTable.hidden = true; el.output.hidden = true; el.errors.hidden = true;
  const p = current, rtype = returnType(p.signature);
  if (result.status === "compile_error") { recordFail(p.id); setVerdict("fail", `[x] Did not compile · ${missText(p.id)}`); el.count.textContent = `0 / ${p.tests.length} tests`; showErrors(errors, "Parse error"); return; }
  if (result.status === "error") { recordFail(p.id); setVerdict("fail", `[x] ${missText(p.id)}`, result.error); el.count.textContent = `0 / ${p.tests.length} tests`; showErrors(errors); return; }
  const allPass = result.passed === result.total;
  if (!allPass) recordFail(p.id);
  setVerdict(allPass ? "pass" : "fail", allPass ? "[x] All tests pass · solved" : `[x] Not yet · ${missText(p.id)}`);
  el.count.textContent = `${result.passed} / ${result.total} tests`;
  const printOnly = p.tests.some((t) => t.expect === null && t.out);
  el.resultTable.innerHTML = `<tr><th></th><th>The judge called</th><th>${printOnly ? "Expected output" : "Correct answer"}</th><th>${printOnly ? "Your output" : "Your code returned"}</th></tr>` + result.results.map((r, i) => {
    const t = p.tests[i] || {};
    const yours = (t.expect === null && t.out) ? printedHtml(r.out, true) : esc(fmtTyped(r.got, rtype)) + (t.out ? `\n${printedHtml(r.out)}` : "");
    const err = r.error ? `<span class="out">${esc(r.error)}</span>` : "";
    return `<tr class="${r.pass ? "pass" : "fail"}"><td class="mark">${r.pass ? "✓" : "✗"}</td><td>${t.name ? `<span class="check">${esc(t.name)}</span>` : ""}${framesLabel(t)}${esc(callStr(p, r.args))}</td><td>${expectHtml(p, t)}</td><td>${yours}${err}</td></tr>`;
  }).join("");
  el.resultTable.hidden = false;
  const printed = result.results.flatMap((r, i) => r.out.map((line) => `[test ${i + 1}] ${line}`));
  if (printed.length && !printOnly) { el.outputLines.textContent = printed.join("\n"); el.output.hidden = false; }
  if (errors.length) showErrors(errors);
  if (allPass) markSolved(p.id);
}
function showErrors(errors, fallback) {
  const lines = errors.map(tidyError).filter((l) => !/GDScript backtrace|^\s*\[\d+\]/.test(l));
  const shown = lines.slice(0, MAX_ERROR_LINES);
  if (lines.length > MAX_ERROR_LINES) shown.push(`… ${lines.length - MAX_ERROR_LINES} more lines hidden`);
  el.errorLines.textContent = shown.join("\n") || fallback || "";
  el.errors.hidden = shown.length === 0 && !fallback;
  const m = /line (\d+)/.exec(shown.join("\n"));
  if (m) editor.markError(Number(m[1]) - 1);
}
function recordFail(id) {
  const wasNew = !state.solved[id];
  state.fails[id] = (state.fails[id] || 0) + 1; saveFails(); attemptFails += 1;
  if (current && current.id === id) { updateSolutionLock(current); renderModes(current); }
  sync.push(id);
  logVerdict(id, false, wasNew);
}
function markSolved(id) {
  const first = !state.solved[id];
  if (first) { state.solved[id] = new Date().toISOString(); saveSolved(); sync.push(id); }
  if (current && current.id === id) { updateSolutionLock(current); el.again.hidden = false; }
  renderFilters();
  logVerdict(id, true, first);
  // Completing a topic starts its review week.
  if (first && sync.user && current) reviews.scheduleTopicIfCleared(sync.user, current.concept).then((started) => { if (started) setVerdict("pass", "[x] Topic cleared", "Reviews for this topic start tomorrow: two a day for a week."); }).catch(() => {});
}
// Every verdict is an attempt; a review's first verdict decides its schedule.
function logVerdict(id, passed, wasNew) {
  if (!sync.user) return;
  const inReview = reviewMode && reviewIds.includes(id);
  const kind = inReview ? "review" : wasNew ? "new" : "practice";
  auth.insertAttempt(sync.user.id, id, kind, passed ? "pass" : "miss").catch(() => {});
  if (inReview && !reviewRecorded) {
    reviewRecorded = true;
    const clean = passed && attemptFails === 0;
    reviews.recordResult(sync.user, id, passed, clean).then(() => {
      renderTodayBar();
      if (passed) setVerdict("pass", clean ? "[x] Review passed cleanly" : "[x] Passed after a miss", clean ? "Next review in a few days." : "This one comes back tomorrow until it is solved cleanly twice.");
      else setVerdict("fail", `[x] Review missed · ${missText(id)}`, "It comes back tomorrow. You can keep working on it now; that will not change the schedule.");
    }).catch((e) => sync.note("Could not save the review: " + e.message));
  }
}

// ---------- wide-screen layout ----------
// On wide monitors the results, notes, Ask Claude and tools move to a third
// column; below that width they go back to where the HTML has them.
let wideLayout = null;
function layout() {
  const wide = matchMedia("(min-width: 1700px)").matches;
  if (wide === wideLayout) return;
  wideLayout = wide;
  const side = $("side"), problem = document.querySelector(".problem"), pane = document.querySelector(".editor-pane");
  const movers = [el.results, document.querySelector(".notebox"), el.ask.closest(".tools"), el.again.closest(".tools")];
  if (wide) { for (const m of movers) side.appendChild(m); side.hidden = false; }
  else { side.hidden = true; pane.appendChild(el.results); for (const m of movers.slice(1)) problem.appendChild(m); }
}

// ---------- wiring ----------
async function main() {
  const shell = mountShell("practice", { stats: true });
  layout();
  matchMedia("(min-width: 1700px)").addEventListener("change", layout);
  window.addEventListener("resize", layout);
  editor = makeEditor($("editor"), { onRun: runCode });
  let saveTimer = null;
  editor.onChange(() => {
    if (!current || activeMode !== "normal" || (reviewMode && reviewIds.includes(current.id))) return;   // drafts only for the plain problem
    el.saved.textContent = "…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { const text = editor.get(); if (text === current.starter) { clearDraft(current.id); el.saved.textContent = ""; } else { setDraft(current.id, text); el.saved.textContent = "saved"; } sync.push(current.id); }, 300);
  });
  await loadBank();
  judge.load().catch((e) => setVerdict("fail", "[x] The judge could not start", e.message));   // before any problem loads: bug variants need it

  el.topic.addEventListener("change", () => { filters.topic = el.topic.value; store.set("filters", filters); renderFilters(); if (!current || !matches(state.byId.get(current.id))) pickNext(); });
  el.difficulty.addEventListener("change", () => { filters.difficulty = el.difficulty.value; store.set("filters", filters); renderFilters(); if (!current || !matches(state.byId.get(current.id))) pickNext(); });
  el.dots.addEventListener("click", (ev) => { const b = ev.target.closest("button[data-id]"); if (b) showProblem(b.dataset.id); });
  const step = (d) => { const list = pool(); const at = current ? list.findIndex((p) => p.id === current.id) : -1; const target = list[at + d]; if (target) showProblem(target.id); };
  el.prev.addEventListener("click", () => step(-1)); el.nextseq.addEventListener("click", () => step(1));
  el.run.addEventListener("click", runCode);
  el.next.addEventListener("click", pickNext);
  el.reset.addEventListener("click", () => {
    if (!current) return;
    if (activeMode === "parsons" && parsons) { parsons.reset(); clearResults(); return; }
    if (activeMode === "bug") { editor.set(bugCode); clearResults(); editor.focus(); return; }
    clearDraft(current.id); editor.set(current.starter); el.saved.textContent = ""; clearResults(); editor.focus(); sync.push(current.id);
  });
  let noteTimer = null;
  el.note.addEventListener("input", () => { el.noteSaved.textContent = "…"; clearTimeout(noteTimer); noteTimer = setTimeout(() => saveNote({ text: el.note.value }), 600); });
  el.noteResolved.addEventListener("change", () => saveNote({ resolved: el.noteResolved.checked }));
  el.ask.addEventListener("click", askClaude);
  el.hints.addEventListener("click", (ev) => { const b = ev.target.closest("button[data-hint]"); if (!b) return; const p = b.nextElementSibling; p.hidden = !p.hidden; b.textContent = (p.hidden ? "[+] " : "[-] ") + b.textContent.slice(4); });
  el.solutionToggle.addEventListener("click", () => { if (el.solutionToggle.classList.contains("locked")) return; el.solution.hidden = !el.solution.hidden; updateSolutionLock(current); });
  // Practice again: back to the starter without touching the solved date.
  el.again.addEventListener("click", () => { if (current) { clearDraft(current.id); editor.set(current.starter); clearResults(); setVerdict("", "Practice again: the solved date stays as it was."); editor.focus(); } });
  $("export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(exportProgress(), null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `gdscript-practice-progress-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.appendChild(a); a.click(); a.remove();
  });
  $("clear").addEventListener("click", async () => {
    const where = sync.user ? "in this browser AND in your account" : "in this browser";
    if (prompt(`This deletes every solve, miss count and draft ${where}. Type CLEAR to confirm.`) !== "CLEAR") return;
    await clearProgress();
    location.hash = ""; location.reload();
  });

  const fromHash = location.hash.slice(1);
  const topicParam = new URLSearchParams(location.search).get("topic");   // links from Stats: practice.html?topic=<concept>
  if (topicParam && state.problems.some((p) => p.concept === topicParam)) { filters.topic = topicParam; filters.difficulty = "any"; store.set("filters", filters); store.remove("current"); }
  if (reviewMode) {
    try { await reviews.refresh(); } catch (e) { /* use the cached queue */ }
    reviewIds = reviews.dueToday().pending.map((r) => r.problem_id);
    el.next.textContent = "Next review ›";
    if (reviewIds.length === 0) { setVerdict("pass", "[x] No reviews due", "Nothing to review right now."); location.href = "./"; return; }
    await showProblem(reviewIds.includes(fromHash) ? fromHash : reviewIds[0]);
  } else {
    const startId = state.byId.has(fromHash) ? fromHash : store.get("current", null);
    if (startId && state.byId.has(startId)) await showProblem(startId); else pickNext();
  }

  const why = sessionStorage.getItem("gdp.reloaded");
  if (why) { sessionStorage.removeItem("gdp.reloaded"); setVerdict("warn", why === "crash" ? "[!] The judge crashed on your last run and was restarted" : "[!] Your last run took more than 5 seconds — probably an infinite loop", "The judge was restarted; your code is unchanged."); }
  onSynced((what) => { if (what === "local-changed" && current && activeMode === "normal") { const d = getDraft(current.id); editor.set(d ? d.code : current.starter); updateSolutionLock(current); } if ((what === "local-changed" || what === "merged") && current) renderNote(current); renderFilters(); shell.refresh(); });
}
main().catch((e) => { setVerdict("fail", "[x] Could not load the problem bank", e.message); });
