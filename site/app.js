// GDScript Practice — the page. Loads the problem bank, drives the judge
// (see judge-client.js) and keeps progress + your in-progress code in
// localStorage until accounts arrive.
import { JudgeClient, tidyError } from "./judge-client.js";
import { loadIndex, loadProblem } from "./problems.js";

const TOPIC_LABEL = {
  "gq-variables": "GDQuest 1: Introduction to variables",
  "gq-readable": "GDQuest 2: Variables for readable code",
  "gq-parameters": "GDQuest 3: Parameters",
  "gq-functions": "GDQuest 4: Functions",
  "gq-return": "GDQuest 5: Functions that return a value",
  "gq-conditions": "GDQuest 6: Conditions",
  "gq-arrays": "GDQuest 7: Arrays",
  "gq-strings": "GDQuest 8: Strings",
  "gq-vectors": "GDQuest 9: 2D vectors",
  "gq-delta": "GDQuest 10: Delta",
  "gq-rect": "GDQuest 11: Drawing a rectangle",
  variables: "Variables", arithmetic: "Arithmetic", functions: "Functions & return", ifelse: "If / else",
  comparisons: "Comparisons", while: "While loops", for: "For loops", arrays: "Arrays", strings: "Strings", dictionaries: "Dictionaries",
};
const DIFF = ["novice", "beginner", "intermediate", "advanced"];
const MAX_ERROR_LINES = 20;

// ---------- storage ----------
const store = {
  get(key, fallback) { try { const v = localStorage.getItem("gdp." + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
  set(key, value) { try { localStorage.setItem("gdp." + key, JSON.stringify(value)); } catch (e) {} },
  remove(key) { try { localStorage.removeItem("gdp." + key); } catch (e) {} },
};
let solved = store.get("solved", {});           // { id: ISO date }
let fails = store.get("fails", {});             // { id: number of failed runs }
const UNLOCK_AFTER = 2;                          // failed runs before the reference solution opens
let filters = store.get("filters", { topic: "gq-variables", difficulty: "any" });

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const el = {
  topic: $("topic"), difficulty: $("difficulty"), picker: $("picker"), progress: $("progress"),
  title: $("title"), pid: $("pid"), pdiff: $("pdiff"), prompt: $("prompt"), requirements: $("requirements"),
  hint: $("hint"), solution: $("solution"), solutionbox: $("solutionbox"), tests: $("tests"),
  run: $("run"), reset: $("reset"), next: $("next"), judgeStatus: $("judge-status"),
  verdict: $("verdict"), resultTable: $("result-table"), output: $("output"), outputLines: $("output-lines"),
  errors: $("errors"), errorLines: $("error-lines"),
};

// ---------- formatting helpers (shared conventions with the review page) ----------
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
const expectStr = (p, t) => (t.expect === null && t.out) ? `prints ${t.out.map((s) => JSON.stringify(s)).join(", ")}` : fmtTyped(t.expect, returnType(p.signature));

// ---------- syntax highlighting for the reference solution ----------
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

// ---------- editor (CodeMirror 5 if it loaded, else the textarea) ----------
let editor;   // { get(), set(text), onChange(fn), focus() }
function makeEditor() {
  const ta = $("editor");
  if (window.CodeMirror && CodeMirror.defineSimpleMode) {
    CodeMirror.defineSimpleMode("gdscript", {
      start: [
        { regex: /"(?:[^\\]|\\.)*?(?:"|$)/, token: "string" },
        { regex: /'(?:[^\\]|\\.)*?(?:'|$)/, token: "string" },
        { regex: /#.*/, token: "comment" },
        { regex: /\b(?:func|var|const|if|elif|else|while|for|in|return|pass|break|continue|and|or|not|extends|class_name|match|is|as|self|static|enum|signal|await)\b/, token: "keyword" },
        { regex: /\b(?:true|false|null|PI|TAU|INF)\b/, token: "atom" },
        { regex: /\b(?:int|float|String|bool|Array|Dictionary|Vector2|Vector2i|Rect2|Rect2i|Variant|void)\b/, token: "type" },
        { regex: /\b\d+(?:\.\d+)?\b/, token: "number" },
        { regex: /[A-Za-z_]\w*(?=\()/, token: "def" },
        { regex: /[-+\/*=<>!%:]+/, token: "operator" },
      ],
    });
    const cm = CodeMirror.fromTextArea(ta, {
      mode: "gdscript", theme: "godot", lineNumbers: true, indentWithTabs: true, indentUnit: 4, tabSize: 4,
      lineWrapping: false, styleActiveLine: false, viewportMargin: Infinity,
      extraKeys: {
        Tab: (cm) => cm.replaceSelection("\t"),
        "Shift-Tab": (cm) => cm.indentSelection("subtract"),
        Enter: (cm) => {            // keep indentation; add one level after a line ending in ':'
          const cur = cm.getCursor();
          const line = cm.getLine(cur.line).slice(0, cur.ch);
          const indent = (/^\t*/.exec(line) || [""])[0];
          const extra = /:\s*(#.*)?$/.test(line) ? "\t" : "";
          cm.replaceSelection("\n" + indent + extra);
        },
        "Ctrl-Enter": () => runCode(),
        "Cmd-Enter": () => runCode(),
      },
    });
    let marked = null;
    return {
      get: () => cm.getValue(),
      set: (t) => { cm.setValue(t); cm.clearHistory(); },
      onChange: (fn) => cm.on("change", fn),
      focus: () => cm.focus(),
      markError: (lineNo) => { if (marked !== null) cm.removeLineClass(marked, "background", "cm-error-line"); marked = lineNo; if (lineNo !== null) cm.addLineClass(lineNo, "background", "cm-error-line"); },
    };
  }
  // Fallback: plain textarea with Tab support.
  ta.addEventListener("keydown", (ev) => {
    if (ev.key === "Tab") { ev.preventDefault(); const s = ta.selectionStart, e = ta.selectionEnd; ta.value = ta.value.slice(0, s) + "\t" + ta.value.slice(e); ta.selectionStart = ta.selectionEnd = s + 1; ta.dispatchEvent(new Event("input")); }
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); runCode(); }
  });
  return { get: () => ta.value, set: (t) => { ta.value = t; }, onChange: (fn) => ta.addEventListener("input", fn), focus: () => ta.focus(), markError: () => {} };
}

// ---------- judge ----------
const judge = new JudgeClient({
  src: "../web/index.html",
  container: $("judge-frame"),
  timeoutMs: 5000,
  onStatus: (s) => {
    const text = { loading: "judge: loading…", ready: "judge: ready", timeout: "judge: timed out", crash: "judge: crashed", error: "judge: failed to load" }[s] || "judge: " + s;
    el.judgeStatus.textContent = text;
    el.judgeStatus.className = "judge-status " + (s === "ready" ? "ready" : (s === "timeout" || s === "crash" || s === "error") ? "bad" : "");
    el.run.disabled = s !== "ready";
  },
  onTimeout: (err) => {
    // Your code is already saved as you type. Reload to get a fresh judge.
    sessionStorage.setItem("gdp.reloaded", err.crashed ? "crash" : "timeout");
    setVerdict("warn", (err.crashed ? "The judge crashed while running your code" : "Your code took more than 5 seconds — check for an infinite loop") + ". Restarting the judge…");
    setTimeout(() => location.reload(), 1200);
  },
});

// ---------- state ----------
let index, problems = [], current = null, running = false;
const byId = new Map();

function matches(p) {
  return (filters.topic === "all" || p.concept === filters.topic) && (filters.difficulty === "any" || String(p.difficulty) === filters.difficulty);
}
function pool() { return problems.filter(matches); }

function renderFilters() {
  const counts = {};
  for (const p of problems) { counts[p.concept] = counts[p.concept] || { n: 0, done: 0 }; counts[p.concept].n++; if (solved[p.id]) counts[p.concept].done++; }
  el.topic.innerHTML = [`<option value="all">All topics</option>`]
    .concat(index.concepts.filter((c) => counts[c]).map((c) => `<option value="${c}">${esc(TOPIC_LABEL[c] || c)} (${counts[c].done}/${counts[c].n})</option>`)).join("");
  el.topic.value = filters.topic;
  el.difficulty.value = filters.difficulty;
  const list = pool();
  el.picker.innerHTML = list.map((p) => `<option value="${p.id}">${solved[p.id] ? "✓ " : ""}${esc(p.title)}</option>`).join("") || `<option value="">(no problems match)</option>`;
  if (current) el.picker.value = current.id;
  const total = problems.length, done = Object.keys(solved).filter((id) => byId.has(id)).length;
  el.progress.textContent = `${done} / ${total} solved`;
}

// Plain-English reading of the first line, for readers who have not met
// type hints yet: "solve receives hp, a whole number, and must return a whole number."
const TYPE_WORDS = {
  int: "a whole number", float: "a number that can have decimals", String: "some text", bool: "true or false",
  Array: "an array", Dictionary: "a dictionary", Vector2: "a Vector2 (an x and a y)", Vector2i: "a Vector2i",
  Rect2: "a Rect2 (a rectangle)", Rect2i: "a Rect2i", Variant: "any kind of value", void: "nothing",
};
function describeSignature(sig) {
  const params = ((/\((.*)\)/.exec(sig) || [])[1] || "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const [left, def] = s.split("=").map((x) => x.trim());
    const [name, type] = left.split(":").map((x) => x.trim());
    const kind = type ? TYPE_WORDS[type] || type : "a value";
    return `<code>${esc(name)}</code>, ${kind}${def !== undefined ? ` (if left out it is <code>${esc(def)}</code>)` : ""}`;
  });
  const ret = returnType(sig);
  const gives = ret ? (ret === "void" ? "returns nothing" : `must return ${TYPE_WORDS[ret] || ret}`) : "returns a value";
  const receives = params.length === 0 ? "receives nothing" : params.length === 1 ? `receives ${params[0]}` : `receives ${params.slice(0, -1).join("; ")}; and ${params[params.length - 1]}`;
  const hasHints = /:\s*\w+\s*[,)=]/.test(sig) || ret;
  const about = hasHints ? " The parts like <code>: int</code> and <code>-> int</code> are type hints: Godot writes them itself, and the course covers them later." : "";
  return `The first line means: <code>solve</code> ${receives}, and ${gives}.${about}`;
}

function renderProblem(p) {
  el.title.textContent = p.title;
  $("signature-help").innerHTML = describeSignature(p.signature);
  el.pid.textContent = p.id;
  el.pdiff.textContent = DIFF[p.difficulty];
  el.pdiff.className = "diff d" + p.difficulty;
  el.prompt.innerHTML = rich(p.prompt);
  const reqs = [];
  if (p.require_methods) reqs.push("Must define: " + p.require_methods.map((m) => `<code>${esc(m)}()</code>`).join(", "));
  if (p.require_names) reqs.push("Must declare: " + p.require_names.map((m) => `<code>${esc(m)}</code>`).join(", ") + (p.once_only ? ` — and ${p.once_only.map((n) => `<code>${n}</code>`).join(", ")} may appear only once` : ""));
  el.requirements.innerHTML = reqs.join("<br>");
  el.requirements.hidden = reqs.length === 0;
  el.hint.innerHTML = rich(p.hint);
  $("hintbox").open = false;
  el.solution.innerHTML = highlight(p.solution);
  el.solutionbox.open = false;
  updateSolutionLock(p);
  el.tests.innerHTML = p.tests.map((t) => `<tr><td><code>${esc(callStr(p, t.args))}</code></td><td class="arrow">→</td><td><code>${esc(expectStr(p, t))}</code></td></tr>`).join("");
  document.title = `${p.title} · GDScript Practice`;
}

// The reference solution stays locked until the problem is solved or Run
// has failed UNLOCK_AFTER times, so the first instinct is to try, not peek.
function updateSolutionLock(p) {
  const misses = fails[p.id] || 0;
  const unlocked = Boolean(solved[p.id]) || misses >= UNLOCK_AFTER;
  el.solutionbox.hidden = !unlocked;
  const lockNote = $("solution-locked");
  lockNote.hidden = unlocked;
  if (!unlocked) {
    const left = UNLOCK_AFTER - misses;
    lockNote.textContent = `Reference solution: locked until you solve this problem, or press Run and miss ${UNLOCK_AFTER} times (${left} more ${left === 1 ? "miss" : "misses"} to unlock).`;
  }
}
function recordFail(id) {
  fails[id] = (fails[id] || 0) + 1;
  store.set("fails", fails);
  if (current && current.id === id) updateSolutionLock(current);
}

function clearResults() {
  setVerdict("", "Run your code to check it against the tests.");
  el.resultTable.hidden = true; el.output.hidden = true; el.errors.hidden = true;
  editor.markError(null);
}
function setVerdict(kind, text) { el.verdict.className = "verdict " + kind; el.verdict.textContent = text; }

async function showProblem(id, { keepResults = false } = {}) {
  const p = byId.get(id) ? await loadProblem(id) : null;
  if (!p) return;
  current = p;
  store.set("current", id);
  renderProblem(p);
  editor.set(store.get("code." + id, p.starter));
  if (!keepResults) clearResults();
  renderFilters();
  location.hash = id;
}

function pickNext() {
  const list = pool();
  if (list.length === 0) { setVerdict("warn", "No problems match these filters."); return; }
  const unsolved = list.filter((p) => !solved[p.id] && (!current || p.id !== current.id));
  const from = unsolved.length ? unsolved : list.filter((p) => !current || p.id !== current.id);
  if (unsolved.length === 0) setVerdict("pass", "Every problem in this filter is solved — here is a random one to redo.");
  const choice = from.length ? from[Math.floor(Math.random() * from.length)] : list[0];
  showProblem(choice.id, { keepResults: unsolved.length === 0 });
}

// ---------- running ----------
async function runCode() {
  if (!current || running || el.run.disabled) return;
  running = true;
  el.run.disabled = true;
  setVerdict("", "Running…");
  editor.markError(null);
  const code = editor.get();
  try {
    const { result, errors } = await judge.run(code, current);
    renderResult(result, errors);
  } catch (e) {
    if (!e.timedOut) setVerdict("fail", "Could not run: " + e.message);
  } finally {
    running = false;
    if (el.judgeStatus.classList.contains("ready")) el.run.disabled = false;
  }
}

function renderResult(result, errors) {
  el.resultTable.hidden = true; el.output.hidden = true; el.errors.hidden = true;
  const p = current;
  const rtype = returnType(p.signature);
  if (result.status === "compile_error") {
    setVerdict("fail", "Your code did not compile.");
    showErrors(errors, "Parse error");
    recordFail(p.id);
    return;
  }
  if (result.status === "error") {
    setVerdict("fail", result.error);
    showErrors(errors);
    recordFail(p.id);
    return;
  }
  const allPass = result.passed === result.total;
  if (!allPass) recordFail(p.id);
  setVerdict(allPass ? "pass" : "fail", allPass ? `All ${result.total} tests pass. Solved!` : `${result.passed} of ${result.total} tests pass.`);
  const printOnly = p.tests.some((t) => t.expect === null && t.out);
  el.resultTable.innerHTML = `<tr><th></th><th>The judge called</th><th>Correct answer</th><th>Your code returned</th></tr>` + result.results.map((r, i) => {
    const t = p.tests[i] || {};
    const yours = (t.expect === null && t.out) ? `prints ${r.out.map((s) => JSON.stringify(s)).join(", ") || "nothing"}` : fmtTyped(r.got, rtype) + (t.out ? `<span class="out">prints ${esc(r.out.map((s) => JSON.stringify(s)).join(", ") || "nothing")}</span>` : "");
    const err = r.error ? `<span class="out">${esc(r.error)}</span>` : "";
    return `<tr class="${r.pass ? "pass" : "fail"}"><td class="mark">${r.pass ? "✓" : "✗"}</td><td><code>${esc(callStr(p, r.args))}</code></td><td><code>${esc(expectStr(p, t))}</code></td><td><code>${(t.expect === null && t.out) ? esc(yours) : yours}</code>${err}</td></tr>`;
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

function markSolved(id) {
  if (!solved[id]) { solved[id] = new Date().toISOString(); store.set("solved", solved); renderFilters(); }
  if (current && current.id === id) updateSolutionLock(current);
}

// ---------- wiring ----------
async function main() {
  editor = makeEditor();
  let saveTimer = null;
  editor.onChange(() => {          // keep in-progress code per problem
    if (!current) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const text = editor.get();
      if (text === current.starter) store.remove("code." + current.id); else store.set("code." + current.id, text);
    }, 300);
  });

  index = await loadIndex();
  problems = index.problems;
  for (const p of problems) byId.set(p.id, p);

  el.topic.addEventListener("change", () => { filters.topic = el.topic.value; store.set("filters", filters); renderFilters(); if (!current || !matches(byId.get(current.id))) pickNext(); });
  el.difficulty.addEventListener("change", () => { filters.difficulty = el.difficulty.value; store.set("filters", filters); renderFilters(); if (!current || !matches(byId.get(current.id))) pickNext(); });
  el.picker.addEventListener("change", () => { if (el.picker.value) showProblem(el.picker.value); });
  el.run.addEventListener("click", runCode);
  el.next.addEventListener("click", pickNext);
  el.reset.addEventListener("click", () => { if (current) { store.remove("code." + current.id); editor.set(current.starter); clearResults(); editor.focus(); } });

  const fromHash = location.hash.slice(1);
  const startId = byId.has(fromHash) ? fromHash : store.get("current", null);
  if (startId && byId.has(startId)) await showProblem(startId); else pickNext();

  const why = sessionStorage.getItem("gdp.reloaded");
  if (why) {
    sessionStorage.removeItem("gdp.reloaded");
    setVerdict("warn", why === "crash" ? "The judge crashed on your last run and was restarted. Your code is unchanged." : "Your last run took more than 5 seconds — probably an infinite loop. The judge was restarted; your code is unchanged.");
  }
  judge.load().catch((e) => setVerdict("fail", "The judge could not start: " + e.message));
}

main().catch((e) => { setVerdict("fail", "Could not load the problem bank: " + e.message); });
