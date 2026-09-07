// Builds problems/index.json from the individual problem files and checks the
// basics of each one. Run: node tools/build-index.js
const fs = require("fs");
const path = require("path");

const dir = path.resolve(__dirname, "..", "problems");
// Order matters: the site lists concepts in this order. The gq-* tags follow
// the lesson order of GDQuest's "Learn GDScript From Zero".
const CONCEPTS = [
  "gq-errors", "gq-giants", "gq-turtle", "gq-functions", "gq-parameters", "gq-members", "gq-variables", "variables", "arithmetic",
  "gq-loop", "gq-delta", "gq-readable", "gq-conditions", "ifelse", "comparisons", "gq-multiply", "gq-vectors", "gq-rect",
  "while", "for", "gq-arrays", "arrays", "gq-looparrays", "gq-strings", "strings", "gq-return", "functions",
  "gq-appendpop", "gq-indices", "dictionaries", "gq-loopdicts", "gq-valuetypes", "gq-types",
];
const REQUIRED = ["id", "title", "concept", "difficulty", "prompt", "signature", "starter", "tests", "solution"];
// Problems are moving to the house style (hints list, docs, named tests, no
// type hints). Files that still have the old single `hint` are accepted but
// counted, so the migration can go topic by topic.

// House style checks. Type hints are allowed only as solve's return type.
function styleErrors(p) {
  const out = [];
  if (!Array.isArray(p.hints) || p.hints.length < 2 || p.hints.length > 4 || p.hints.some((h) => typeof h !== "string" || !h.trim())) out.push("hints must be 2 to 4 strings");
  if (!Array.isArray(p.docs) || p.docs.some((d) => !d || typeof d.name !== "string" || typeof d.what !== "string")) out.push("docs must be a list of {name, what}");
  if (Array.isArray(p.tests) && p.tests.some((t) => typeof t.name !== "string" || !t.name.trim())) out.push("every test needs a plain-English name");
  if (p.allow_type_hints) return out;   // the type-hints lesson itself
  const sigParams = (/\((.*)\)/.exec(p.signature) || [, ""])[1];
  if (/:/.test(sigParams)) out.push("solve's parameters must not have type hints");
  for (const [field, code] of [["starter", p.starter], ["solution", p.solution]]) {
    for (const line of String(code).split("\n")) {
      const m = /^\s*func\s+(\w+)\s*\(([^)]*)\)\s*(->\s*\w+)?\s*:/.exec(line);
      if (!m) continue;
      if (/:/.test(m[2])) out.push(`${field}: parameters of ${m[1]}() must not have type hints`);
      if (m[1] !== "solve" && m[3]) out.push(`${field}: ${m[1]}() must not declare a return type`);
    }
    if (/\bvar\s+\w+\s*:\s*\w+/.test(code) || /:=/.test(code)) out.push(`${field}: no typed variables or := (write var x = ...)`);
  }
  return out;
}

const entries = [];
const errors = [];
const seen = new Set();
let oldStyle = 0;
for (const f of fs.readdirSync(dir).sort()) {
  if (!f.endsWith(".json") || f === "index.json") continue;
  let p;
  try { p = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); }
  catch (e) { errors.push(`${f}: invalid JSON (${e.message})`); continue; }
  for (const k of REQUIRED) if (!(k in p)) errors.push(`${f}: missing "${k}"`);
  if (p.id !== f.replace(/\.json$/, "")) errors.push(`${f}: id "${p.id}" does not match file name`);
  if (seen.has(p.id)) errors.push(`${f}: duplicate id`);
  seen.add(p.id);
  if (!CONCEPTS.includes(p.concept)) errors.push(`${f}: unknown concept "${p.concept}"`);
  if (![0, 1, 2, 3].includes(p.difficulty)) errors.push(`${f}: difficulty must be 0-3`);
  if (!Array.isArray(p.tests) || p.tests.length === 0) errors.push(`${f}: needs at least one test`);
  for (const e of styleErrors(p)) errors.push(`${f}: ${e}`);
  entries.push({ id: p.id, title: p.title, concept: p.concept, difficulty: p.difficulty });
}
// Milestone steps follow the same house style (hints, docs, named checks, no type hints).
const mdir = path.resolve(__dirname, "..", "milestones");
if (fs.existsSync(mdir)) {
  for (const f of fs.readdirSync(mdir).sort()) {
    if (!f.endsWith(".json")) continue;
    let m;
    try { m = JSON.parse(fs.readFileSync(path.join(mdir, f), "utf8")); } catch (e) { errors.push(`milestones/${f}: invalid JSON (${e.message})`); continue; }
    for (const s of m.steps || []) for (const e of styleErrors({ signature: "", ...s })) errors.push(`milestones/${f} ${s.id}: ${e}`);
  }
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

entries.sort((a, b) => CONCEPTS.indexOf(a.concept) - CONCEPTS.indexOf(b.concept) || a.id.localeCompare(b.id));
const out = { concepts: CONCEPTS, problems: entries };
fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`index.json: ${entries.length} problems` + (oldStyle ? ` (${oldStyle} still in the old format)` : ""));
