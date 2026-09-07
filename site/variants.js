// Variants: a problem with a `generator` can be served with fresh arguments.
// The expected answers are never hand-written: the reference solution is run
// through the judge on the rolled arguments and its results become the tests.
// Spec per argument: {int:[lo,hi]} {float:[lo,hi,decimals]} {bool:true}
// {pick:[...]} {array:{len:[lo,hi], of:spec}} {v2:[[..],[..],decimals]}
// {rect:[[..],[..],[..],[..]]}.

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const betweenF = (r, lo, hi, d) => Number((lo + r() * (hi - lo)).toFixed(d));

export function roll(spec, r) {
  if (spec.int) return between(r, spec.int[0], spec.int[1]);
  if (spec.float) return betweenF(r, spec.float[0], spec.float[1], spec.float[2] == null ? 1 : spec.float[2]);
  if (spec.bool) return r() < 0.5;
  if (spec.pick) return JSON.parse(JSON.stringify(spec.pick[between(r, 0, spec.pick.length - 1)]));
  if (spec.array) { const n = between(r, spec.array.len[0], spec.array.len[1]); return Array.from({ length: n }, () => roll(spec.array.of, r)); }
  if (spec.v2) { const d = spec.v2[2] || 0; return { $v2: [betweenF(r, spec.v2[0][0], spec.v2[0][1], d), betweenF(r, spec.v2[1][0], spec.v2[1][1], d)] }; }
  if (spec.rect) return { $rect: spec.rect.map(([lo, hi]) => between(r, lo, hi)) };
  return null;
}
export const rollArgs = (generator, r) => generator.map((spec) => roll(spec, r));

/**
 * Build a variant of problem p: three fresh argument sets with the reference
 * solution's answers as the expected results. Returns null when the solution
 * cannot run on the rolled arguments (a range that does not fit the problem).
 */
export async function makeVariant(p, judge, seed = Date.now()) {
  if (!p.generator) return null;
  const r = rng(seed);
  const wantOut = p.tests.some((t) => t.out);
  const argSets = [];
  const seen = new Set(p.tests.map((t) => JSON.stringify(t.args)));
  for (let tries = 0; argSets.length < 3 && tries < 30; tries++) {
    const args = rollArgs(p.generator, r);
    const key = JSON.stringify(args);
    if (seen.has(key)) continue;
    seen.add(key); argSets.push(args);
  }
  if (argSets.length < 2) return null;
  const { result } = await judge.run(p.solution, { ...p, tests: argSets.map((args) => ({ args, expect: null })) });
  if (result.status !== "ok") return null;
  const tests = [];
  result.results.forEach((res, i) => {
    if (res.error) return;
    const t = { name: `Fresh numbers ${i + 1}`, args: argSets[i], expect: res.got };
    if (wantOut || (res.got === null && res.out.length)) t.out = res.out;
    if (t.expect === null && !t.out) return;
    tests.push(t);
  });
  if (tests.length < 2) return null;
  return { ...p, tests, variant: true, seed };
}
