// Fix-the-bug variants: one small mutation applied to a reference solution.
// The result must still compile but fail at least one test; the caller checks
// that by running it through the judge and tries the next candidate if not.
// Kinds: wrong operator, off-by-one, wrong variable name, missing return,
// swapped arguments.

// Deterministic pseudo-random order from the problem id, so a problem always
// offers the same bug (stable across machines).
export function seededOrder(seed, n) {
  let h = 2166136261;
  for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; const j = h % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}

// Split a line into code and trailing comment; never mutate inside strings.
function codePart(line) { const m = /^([^#]*?)(\s*#.*)?$/.exec(line); return [m[1], m[2] || ""]; }
function outsideStrings(code, fn) {
  // Apply fn to the segments of code that are not inside quotes.
  const parts = code.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
  return parts.map((seg, i) => (i % 2 === 1 ? seg : fn(seg))).join("");
}

const OPERATOR_SWAPS = [[" + ", " - "], [" - ", " + "], [" * ", " + "], [" < ", " <= "], [" > ", " >= "], [" <= ", " < "], [" >= ", " > "], [" == ", " != "], [" != ", " == "], [" and ", " or "], [" or ", " and "], ["+=", "-="], ["-=", "+="]];

function mutateOperator(lines, pick) {
  const cands = [];
  lines.forEach((line, li) => { const [code] = codePart(line); if (/^\s*func\b/.test(code)) return; for (const [from, to] of OPERATOR_SWAPS) { const idx = outsideStrings(code, (s) => s).indexOf(from); if (idx >= 0 && code.indexOf(from) >= 0) cands.push({ li, from, to }); } });
  if (!cands.length) return null;
  const c = cands[pick % cands.length];
  const [code, comment] = codePart(lines[c.li]);
  const out = lines.slice(); out[c.li] = outsideStrings(code, (s) => s.replace(c.from, c.to)) + comment;
  return out.join("\n") === lines.join("\n") ? null : { lines: out, kind: "an operator" };
}

function mutateOffByOne(lines, pick) {
  const cands = [];
  lines.forEach((line, li) => { const [code] = codePart(line); if (/^\s*func\b/.test(code)) return; const stripped = outsideStrings(code, (s) => s); const re = /(?<![\w.])(\d+)(?![\w.])/g; let m; while ((m = re.exec(stripped))) cands.push({ li, n: m[1] }); });
  if (!cands.length) return null;
  const c = cands[pick % cands.length];
  const [code, comment] = codePart(lines[c.li]);
  let done = false;
  const out = lines.slice();
  out[c.li] = outsideStrings(code, (s) => s.replace(new RegExp(`(?<![\\w.])${c.n}(?![\\w.])`), (x) => { if (done) return x; done = true; return String(Number(x) + 1); })) + comment;
  return { lines: out, kind: "a number that is off by one" };
}

function mutateVariable(lines, pick) {
  const names = new Set();
  for (const line of lines) { const [code] = codePart(line); const m = /^\s*(?:var|const)\s+(\w+)/.exec(code); if (m) names.add(m[1]); const f = /^\s*func\s+\w+\(([^)]*)\)/.exec(code); if (f) f[1].split(",").map((p) => p.trim().split(/[:=]/)[0].trim()).filter(Boolean).forEach((n) => names.add(n)); }
  const list = [...names];
  if (list.length < 2) return null;
  const cands = [];
  lines.forEach((line, li) => { const [code] = codePart(line); if (/^\s*(func|var|const)\b/.test(code)) return; for (const a of list) { const re = new RegExp(`(?<![\\w."'])${a}(?![\\w"'])`); if (re.test(outsideStrings(code, (s) => s))) for (const b of list) if (b !== a) cands.push({ li, a, b }); } });
  if (!cands.length) return null;
  const c = cands[pick % cands.length];
  const [code, comment] = codePart(lines[c.li]);
  const out = lines.slice(); out[c.li] = outsideStrings(code, (s) => s.replace(new RegExp(`(?<![\\w."'])${c.a}(?![\\w"'])`), c.b)) + comment;
  return { lines: out, kind: "a variable name" };
}

function mutateMissingReturn(lines, pick) {
  const cands = [];
  lines.forEach((line, li) => { const [code] = codePart(line); if (/^\s*return\s+\S/.test(code)) cands.push(li); });
  if (!cands.length) return null;
  const li = cands[pick % cands.length];
  const out = lines.slice(); out[li] = lines[li].replace(/return\s+/, "");
  return { lines: out, kind: "a missing return" };
}

function mutateSwapArgs(lines, pick) {
  const cands = [];
  lines.forEach((line, li) => { const [code] = codePart(line); if (/^\s*func\b/.test(code)) return; const re = /(\w+)\(([^(),]+),\s*([^(),]+)\)/g; let m; while ((m = re.exec(outsideStrings(code, (s) => s)))) if (m[2].trim() !== m[3].trim()) cands.push({ li, whole: m[0], swapped: `${m[1]}(${m[3].trim()}, ${m[2].trim()})` }); });
  if (!cands.length) return null;
  const c = cands[pick % cands.length];
  const [code, comment] = codePart(lines[c.li]);
  const out = lines.slice(); out[c.li] = outsideStrings(code, (s) => s.replace(c.whole, c.swapped)) + comment;
  return { lines: out, kind: "two swapped arguments" };
}

const KINDS = [mutateOperator, mutateOffByOne, mutateVariable, mutateMissingReturn, mutateSwapArgs];

/** All candidate mutations of a solution, best-first for this problem id. */
export function candidates(solution, seed) {
  const lines = solution.split("\n");
  const out = [];
  const order = seededOrder(seed, KINDS.length);
  for (let round = 0; round < 3; round++) {
    for (const k of order) {
      const m = KINDS[k](lines, round + seededOrder(seed + k, 7)[0]);
      if (m && m.lines.join("\n") !== solution && !out.some((o) => o.code === m.lines.join("\n"))) out.push({ code: m.lines.join("\n"), kind: m.kind });
    }
  }
  return out;
}
