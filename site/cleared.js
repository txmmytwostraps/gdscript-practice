// The topic-cleared screen: shown once when the last problem of a topic
// passes (the practice page sends you here), and again from the Route.
// ?topic=<concept> names the topic.
import { mountShell } from "./shell.js";
import { onSynced } from "./sync.js";
import { loadBank, state, store, routeTopics, milestoneStatus, XP_PROBLEM } from "./progress.js";
import { MILESTONES } from "./route-data.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const lesson = (t) => `L${String(t.lesson).padStart(2, "0")}`;

function render(concept) {
  const topics = routeTopics();
  const t = topics.find((x) => x.concept === concept);
  if (!t) { $("title").textContent = "No such topic"; $("go").innerHTML = `<a class="btn" href="route.html">Route</a>`; return; }
  const cleared = t.total > 0 && t.done === t.total;
  $("eyebrow").textContent = cleared ? `// topic cleared · ${lesson(t)}` : `// ${lesson(t)} · not cleared yet`;
  $("title").innerHTML = `${esc(t.title)}<div class="tick" style="font-size: 30px; margin-top: 6px;">${cleared ? "✓" : ""} ${t.done}/${t.total}</div>`;
  // what this topic unlocked: a milestone waiting behind it, or the next topic on the route
  const m = MILESTONES.find((x) => x.after === concept && !x.planned);
  const ms = m ? milestoneStatus(m) : null;
  const idx = topics.indexOf(t);
  const nextTopic = topics.slice(idx + 1).find((x) => x.total > 0);
  const unlocked = ms && ms.unlocked ? `Milestone ${m.number} · ${m.title}` : ms ? `Milestone ${m.number} after ${ms.topicsToGo} more topic${ms.topicsToGo === 1 ? "" : "s"}` : nextTopic ? `${lesson(nextTopic)} · ${nextTopic.title}${nextTopic.locked ? " (locked in the course)" : ""}` : "the end of the route";
  $("facts").innerHTML = [
    ["Problems", `${t.done} / ${t.total}`, ""],
    ["XP in this topic", `+${t.done * XP_PROBLEM}`, "accent"],
    ["Unlocked", unlocked, ""],
  ].map(([k, v, c]) => `<div class="fact"><div class="label">${k}</div><div class="v ${c}">${esc(v)}</div></div>`).join("");
  $("reviews").hidden = !cleared;
  if (!cleared) {
    const next = t.list.find((p) => !state.solved[p.id]);
    $("go").innerHTML = `<a class="btn primary" href="practice.html?topic=${concept}${next ? "#" + next.id : ""}">Continue · ${t.total - t.done} to go</a>`;
    return;
  }
  store.set("cleared." + concept, true);   // the practice page sends you here once; after that the Route links back
  if (ms && ms.unlocked && !ms.done) $("go").innerHTML = `<a class="btn primary" href="milestone.html?m=${m.id}">Open milestone</a>`;
  else if (nextTopic && !nextTopic.locked) {
    const first = nextTopic.list.find((p) => !state.solved[p.id]) || nextTopic.list[0];
    $("go").innerHTML = `<a class="btn primary" href="practice.html?topic=${nextTopic.concept}#${first.id}">Start ${lesson(nextTopic)} · ${esc(nextTopic.title)}</a>`;
  } else $("go").innerHTML = `<a class="btn primary" href="route.html">Back to the Route</a>`;
}

async function main() {
  mountShell("route");
  await loadBank();
  const concept = new URLSearchParams(location.search).get("topic") || "";
  render(concept);
  onSynced(() => render(concept));
}
main().catch((e) => { $("title").textContent = "Could not load: " + e.message; });
