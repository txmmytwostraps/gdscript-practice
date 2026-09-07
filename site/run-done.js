// The end of the day's run: time, XP, the streak, and what each part earned.
import { mountShell } from "./shell.js";
import { onSynced } from "./sync.js";
import { loadBank, state, store, routeTopics, streakInfo, xpOn, dayKey, today, XP_PROBLEM, XP_REVIEW } from "./progress.js";
import { runPlan } from "./run.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render() {
  const plan = runPlan();
  const day = dayKey(today());
  const s = streakInfo();
  const earned = xpOn(day);
  $("eyebrow").textContent = `${plan.doneCount} of ${plan.total} items · ${plan.run.topicTitle || ""}`;
  $("tiles").innerHTML = [
    ["Time", `${plan.run.minutes} min`, ""],
    ["XP today", `+${earned.xp}`, "accent"],
    ["Streak", `${s.current} day${s.current === 1 ? "" : "s"}`, "", `best ${s.longest}${s.rest ? " · rest day held" : ""}`],
  ].map(([k, v, c, sub]) => `<div class="tile"><span class="label">${k}</span><span class="v ${c}">${esc(v)}</span>${sub ? `<span class="dim" style="font-size: 12px;">${esc(sub)}</span>` : ""}</div>`).join("");
  // one row per part: reviews count only when passed on time today, problems when first solved today
  const onTime = new Set(store.get("attempts", []).filter((a) => a.kind === "review" && a.result === "pass" && dayKey(new Date(a.at)) === day).map((a) => a.problem_id));
  const rows = plan.parts.map((p) => {
    const n = p.kind === "review" ? p.ids.filter((id) => onTime.has(id)).length : p.ids.filter((id) => state.solved[id] && dayKey(new Date(state.solved[id])) === day).length;
    const xp = n * (p.kind === "review" ? XP_REVIEW : XP_PROBLEM);
    const detail = p.ids.length === 0 ? "nothing today" : `${p.done} of ${p.ids.length} done`;
    return `<div class="row ${p.ids.length ? "" : "off"}"><span class="mk">${p.done === p.ids.length && p.ids.length ? "✓" : "·"}</span><span class="t">${esc(p.title)}</span><span>${detail}</span><span class="xp">+${xp} XP</span></div>`;
  });
  if (plan.cardsDue) rows.push(`<div class="row"><span class="mk">·</span><span class="t">Cards</span><span><a href="concepts.html?review=1">${plan.cardsDue} due on Concepts ›</a></span><span class="xp dim">+${XP_REVIEW} each</span></div>`);
  $("parts").innerHTML = rows.join("");
  const topic = routeTopics().find((t) => t.concept === plan.run.topic);
  const more = topic ? topic.list.find((p) => !state.solved[p.id]) : null;
  $("keep").href = more ? `practice.html#${more.id}` : "practice.html";
  $("keep").textContent = more ? `Keep going · ${topic.total - topic.done} left in ${topic.title} ›` : "Keep going ›";
}

async function main() {
  mountShell("today");
  await loadBank();
  render();
  onSynced(render);
}
main().catch((e) => { $("parts").innerHTML = `<div class="error">Could not load: ${esc(e.message)}</div>`; });
