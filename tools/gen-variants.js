// Adds a `generator` to every problem whose arguments can be rolled fresh:
// ranges for numbers, lengths and element ranges for arrays, a list of
// choices for strings and other values. Ranges are read from the problem's
// own tests and widened a little. Run: node tools/gen-variants.js
//
// Generator spec, one entry per argument of solve:
//   {"int": [lo, hi]}                  {"float": [lo, hi, decimals]}
//   {"bool": true}                     {"pick": [value, value, ...]}
//   {"array": {"len": [lo, hi], "of": <spec>}}
//   {"v2": [[xlo, xhi], [ylo, yhi], decimals]}
//   {"rect": [[xlo, xhi], [ylo, yhi], [wlo, whi], [hlo, hhi]]}
// A problem with "variants": false is left alone; one with a hand-written
// generator is kept as it is.
const fs = require("fs");
const path = require("path");
const dir = path.resolve(__dirname, "..", "problems");

const isInt = (v) => typeof v === "number" && Number.isInteger(v);
const isNum = (v) => typeof v === "number";
const decimalsOf = (v) => { const s = String(v); const i = s.indexOf("."); return i < 0 ? 0 : Math.min(2, s.length - i - 1); };

// Widen a numeric range from the values seen, keeping the sign class.
function range(values) {
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = Math.max(hi - lo, 4);
  const pad = Math.ceil(span / 2);
  let nlo = lo - pad, nhi = hi + pad;
  if (lo >= 0) nlo = Math.max(0, nlo);
  if (lo > 0) nlo = Math.max(1, nlo);
  return [nlo, nhi];
}

function specFor(values) {
  if (values.every(isNum)) {
    if (values.every(isInt)) return { int: range(values) };
    const d = Math.max(1, ...values.map(decimalsOf));
    const [lo, hi] = range(values);
    return { float: [lo, hi, d] };
  }
  if (values.every((v) => typeof v === "boolean")) return { bool: true };
  if (values.every((v) => typeof v === "string")) return { pick: [...new Set(values)] };
  if (values.every((v) => Array.isArray(v))) {
    const lens = values.map((v) => v.length);
    const elems = values.flat();
    const len = [Math.min(...lens), Math.max(...lens) + 2];
    if (elems.length && elems.every(isNum)) return { array: { len, of: elems.every(isInt) ? { int: range(elems) } : { float: [...range(elems), 1] } } };
    if (elems.length && elems.every((v) => typeof v === "string")) return { array: { len, of: { pick: [...new Set(elems)] } } };
    return { pick: values.map((v) => JSON.parse(JSON.stringify(v))) };
  }
  if (values.every((v) => v && typeof v === "object" && v.$v2)) {
    const xs = values.map((v) => v.$v2[0]), ys = values.map((v) => v.$v2[1]);
    return { v2: [range(xs), range(ys), Math.max(...[...xs, ...ys].map(decimalsOf))] };
  }
  if (values.every((v) => v && typeof v === "object" && v.$rect)) {
    const c = (i) => values.map((v) => v.$rect[i]);
    return { rect: [range(c(0)), range(c(1)), range(c(2)), range(c(3))] };
  }
  return { pick: values.map((v) => JSON.parse(JSON.stringify(v))) };
}

function eligible(p) {
  if (p.variants === false || p.starter_broken || p.require_names) return "opted out";
  if (p.concept === "gq-errors") return "fix-the-error";
  if (!p.tests.length || p.tests.every((t) => !t.args || t.args.length === 0)) return "no arguments";
  if (p.tests.some((t) => t.frames != null || t.script)) return "frame or script harness";
  if (p.tests.every((t) => t.expect === null && t.out)) return "print-only";
  return null;
}

const counts = {};
let added = 0, kept = 0;
for (const f of fs.readdirSync(dir).sort()) {
  if (!f.endsWith(".json") || f === "index.json") continue;
  const file = path.join(dir, f);
  const p = JSON.parse(fs.readFileSync(file, "utf8"));
  if (p.generator) { kept++; continue; }
  const why = eligible(p);
  if (why) { counts[why] = (counts[why] || 0) + 1; continue; }
  const arity = Math.max(...p.tests.map((t) => t.args.length));
  const gen = [];
  for (let i = 0; i < arity; i++) {
    const values = p.tests.filter((t) => t.args.length > i).map((t) => t.args[i]);
    gen.push(specFor(values));
  }
  p.generator = gen;
  fs.writeFileSync(file, JSON.stringify(p, null, 2) + "\n");
  added++;
}
console.log(`generators: ${added} added, ${kept} already present; skipped: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
