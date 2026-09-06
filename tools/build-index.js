// Builds problems/index.json from the individual problem files and checks the
// basics of each one. Run: node tools/build-index.js
const fs = require("fs");
const path = require("path");

const dir = path.resolve(__dirname, "..", "problems");
// Order matters: the site lists concepts in this order. The gq-* tags follow
// the lesson order of GDQuest's "Learn GDScript From Zero".
const CONCEPTS = [
  "gq-variables", "gq-readable", "gq-parameters", "gq-functions", "gq-return", "gq-conditions",
  "gq-arrays", "gq-strings", "gq-vectors", "gq-delta", "gq-rect",
  "variables", "arithmetic", "functions", "ifelse", "comparisons", "while", "for", "arrays", "strings", "dictionaries",
];
const REQUIRED = ["id", "title", "concept", "difficulty", "prompt", "signature", "starter", "tests", "hint", "solution"];

const entries = [];
const errors = [];
const seen = new Set();
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
  entries.push({ id: p.id, title: p.title, concept: p.concept, difficulty: p.difficulty });
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

entries.sort((a, b) => CONCEPTS.indexOf(a.concept) - CONCEPTS.indexOf(b.concept) || a.id.localeCompare(b.id));
const out = { concepts: CONCEPTS, problems: entries };
fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`index.json: ${entries.length} problems`);
