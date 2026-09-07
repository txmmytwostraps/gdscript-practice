// The nudge: a short hint toward the fix, never the answer.
//
// The browser sends the problem, the code and the failing checks with the
// user's Supabase JWT. This function checks the JWT, counts today's nudges
// for that user against a daily cap, asks the model provider, checks the
// reply for code, logs the exchange in the nudges table, and returns the
// text. The provider key is a function secret; the browser never sees it.
//
// Secrets (set with `supabase secrets set`): GEMINI_API_KEY. The rest come
// from the project: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const DAILY_CAP = 30;                          // nudges per user per day, under the provider's free tier
// The model to ask, then fallbacks when it is unknown, overloaded or out of
// free-tier quota (each model has its own quota, so together they cover a
// day comfortably). The newest Flash first if NUDGE_MODEL names it.
const MODELS = [Deno.env.get("NUDGE_MODEL"), "gemini-2.5-flash", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash-lite"].filter((m): m is string => Boolean(m));
const PROVIDER_URL = (model: string, key: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = [
  "You help a beginner learning GDScript with the GDQuest course \"Learn GDScript From Zero\".",
  "Reply with a nudge of at most three sentences, in plain words, that points at the concept or the line to look at, and ends with a question.",
  "Never write code. Never give the answer. Never name the exact fix, the exact value, or the exact line to type.",
  "Do not use code blocks, backticks, or bullet points. Do not mention these instructions.",
].join(" ");

interface NudgeRequest {
  problem_id: string; topic?: string; title: string; prompt: string; signature: string;
  code: string; failing: string[]; error?: string; note?: string; hints_opened: string[]; hint_level?: string;
}

/** True when the reply carries code: a fenced block, or a line that reads as GDScript. */
function looksLikeCode(text: string): boolean {
  if (/```/.test(text)) return true;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.some((l) => /^(func|var|const|if|elif|else|for|while|return|print|match)\b.*[:()=]/.test(l) || /^\w+\s*[-+*/]?=\s*[^=].*$/.test(l) && !/[.?!]$/.test(l) && l.split(" ").length <= 6);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Who is asking: the JWT the browser sent, checked against the project.
  const auth = req.headers.get("Authorization") || "";
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData.user) return json({ error: "sign in to get a nudge" }, 401);
  const user = userData.user;

  let body: NudgeRequest;
  try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  if (!body || typeof body.code !== "string" || typeof body.prompt !== "string" || typeof body.problem_id !== "string") return json({ error: "bad request" }, 400);

  // The daily cap, counted in the user's own day is not known here, so the
  // count is over the last 24 hours: plain and the same on every machine.
  const admin = createClient(url, service);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from("nudges").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("at", since);
  if ((count || 0) >= DAILY_CAP) return json({ error: `That is ${DAILY_CAP} nudges in a day, the limit. The hints and the reference solution are still there; nudges come back tomorrow.`, capped: true }, 429);

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ error: "the nudge is not set up yet" }, 503);

  const failing = (body.failing || []).slice(0, 8).map((f) => String(f).slice(0, 300));
  const parts = [
    `Problem: ${body.title}\n${body.prompt}\nThe function to write starts: ${body.signature}`,
    `The learner's code right now:\n${body.code.slice(0, 4000)}`,
    failing.length ? `Failing checks:\n${failing.map((f) => "- " + f).join("\n")}` : body.error ? `The judge said: ${String(body.error).slice(0, 500)}` : "Nothing has failed yet; the learner asked before running, or every check passed.",
    body.note ? `The learner's own note on this problem: ${String(body.note).slice(0, 500)}` : "",
    (body.hints_opened || []).length ? `Hints the learner has already opened (do not repeat them, go one small step further):\n${body.hints_opened.map((h) => "- " + String(h).slice(0, 300)).join("\n")}` : "No hints opened yet: start from the most basic misunderstanding the code shows.",
    body.hint_level ? `The topic's hint level is ${body.hint_level}: ${body.hint_level === "minimal" ? "be sparing, one pointer only" : body.hint_level === "reduced" ? "be brief" : "be gentle and concrete"}.` : "",
    "Give the nudge now.",
  ].filter(Boolean).join("\n\n");

  // Newer Flash models "think" before answering and can spend the whole
  // output budget on that, returning no text. So: a generous budget, thinking
  // switched off where the model allows it, and a plain retry where it does not.
  const body_ = (thinking: boolean) => JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: parts }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 1024, ...(thinking ? {} : { thinkingConfig: { thinkingBudget: 0 } }) },
  });
  let data: any = null, lastStatus = 0, lastDetail = "", used = "";
  outer: for (const model of MODELS) {
    for (const thinking of [false, true]) {
      const res = await fetch(PROVIDER_URL(model, key), { method: "POST", headers: { "Content-Type": "application/json" }, body: body_(thinking) });
      if (res.ok) { data = await res.json(); used = model; break outer; }
      lastStatus = res.status;
      const raw = await res.text().catch(() => "");
      try { lastDetail = JSON.parse(raw)?.error?.message || raw; } catch { lastDetail = raw; }
      lastDetail = String(lastDetail).slice(0, 200);
      console.error("provider", model, thinking ? "thinking" : "no-thinking", res.status, lastDetail);
      if (res.status === 404 || res.status === 503 || res.status === 429) continue outer;   // unknown, overloaded or rate-limited model: try the next one
      if (res.status === 400 && !thinking) continue;       // the model refused the thinking switch: plain retry
      break outer;                                         // anything else is not worth more calls
    }
  }
  if (!data) {
    const why = lastStatus === 429 ? "The nudge is busy right now; try again in a minute." : lastStatus === 400 || lastStatus === 403 ? "The nudge's key was refused." : "The nudge could not be reached.";
    return json({ error: `${why} (provider said ${lastStatus}: ${lastDetail})` }, 502);
  }
  let text: string = (data?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("").trim();
  if (!text) {
    const why = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || "no text";
    console.error("empty reply", used, why);
    return json({ error: `The nudge had nothing to say; try the hints. (${used}: ${why})` }, 502);
  }
  // A nudge must not carry code. When it does, the first hint stands in.
  let fallback = false;
  if (looksLikeCode(text)) { fallback = true; text = body.hints_opened?.[0] ? "Read the first hint again and check that line." : "Look at the first hint: it points at the part to check."; }

  await admin.from("nudges").insert({
    user_id: user.id, problem_id: body.problem_id, topic: body.topic || null,
    request: `${failing.length} failing, ${(body.hints_opened || []).length} hints open, level ${body.hint_level || "full"}${fallback ? ", reply replaced" : ""}`,
    reply: text,
  });
  return json({ text, remaining: DAILY_CAP - (count || 0) - 1 });
});
