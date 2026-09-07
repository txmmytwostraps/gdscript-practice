// Thin wrapper around supabase-js: sign-in, and reading/writing the
// progress table. app.js decides what to do with the data.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const enabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase);
const client = enabled ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Where GitHub sends the user back to after signing in: the site folder
// (the one address registered with Supabase), never a sub-page.
const redirectTo = location.origin + location.pathname.replace(/[^/]*$/, "");

export async function currentUser() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session ? data.session.user : null;
}

export function onAuthChange(fn) {
  if (!client) return;
  client.auth.onAuthStateChange((_event, session) => fn(session ? session.user : null));
}

export function signInWithGitHub() {
  return client.auth.signInWithOAuth({ provider: "github", options: { redirectTo } });
}

export async function signInWithEmail(email, password) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}

export async function signUpWithEmail(email, password) {
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
  if (error) return error.message;
  if (data.user && !data.session) return "Check your email for a confirmation link, then sign in.";
  return null;
}

export function signOut() {
  return client.auth.signOut();
}

export function displayName(user) {
  if (!user) return "";
  const m = user.user_metadata || {};
  return m.user_name || m.preferred_username || m.full_name || user.email || "signed in";
}

/** All progress rows for the signed-in user, as { problem_id: row }. */
export async function fetchProgress() {
  const { data, error } = await client.from("progress").select("problem_id, solved_at, fails, draft, draft_updated_at");
  if (error) throw new Error(error.message);
  const map = {};
  for (const row of data) map[row.problem_id] = row;
  return map;
}

/** The user's review queue, as { problem_id: row }. */
export async function fetchReviews() {
  const { data, error } = await client.from("reviews").select("problem_id, topic, stage, due_on, step, clean_streak, last_result, reviewed_at");
  if (error) throw new Error(error.message);
  const map = {};
  for (const row of data) map[row.problem_id] = row;
  return map;
}

export async function upsertReviews(rowsToWrite) {
  if (!rowsToWrite.length) return;
  const { error } = await client.from("reviews").upsert(rowsToWrite, { onConflict: "user_id,problem_id" });
  if (error) throw new Error(error.message);
}

/** Every recorded attempt, oldest first. */
export async function fetchAttempts() {
  const { data, error } = await client.from("attempts").select("problem_id, kind, result, at").order("at", { ascending: true }).limit(5000);
  if (error) throw new Error(error.message);
  return data;
}

/** One run that reached a verdict. kind: new | review | practice; result: pass | miss. */
export async function insertAttempt(userId, problemId, kind, result) {
  const { error } = await client.from("attempts").insert({ user_id: userId, problem_id: problemId, kind, result });
  if (error) throw new Error(error.message);
}

/** Remove every progress row of this user (the "clear progress" control). */
export async function deleteAllProgress(userId) {
  for (const table of ["progress", "reviews", "attempts"]) {
    const { error } = await client.from(table).delete().eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
}

/** Insert-or-update rows. Each row: { problem_id, solved_at?, fails?, draft?, draft_updated_at? }. */
export async function upsertProgress(userId, rows) {
  if (!rows.length) return;
  const payload = rows.map((r) => ({ user_id: userId, ...r }));
  const { error } = await client.from("progress").upsert(payload, { onConflict: "user_id,problem_id" });
  if (error) throw new Error(error.message);
}
