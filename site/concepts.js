// The Concepts tab: reference cards by lesson, and a flashcard mode.
// ?review=1 walks today's due cards and records each answer on the review
// schedule; ?cards=<lesson> flips through one lesson's cards without recording.
import { mountShell } from "./shell.js";
import { sync, onSynced } from "./sync.js";
import * as auth from "./auth.js";
import * as reviews from "./reviews.js";
import { loadBank, courseLock, dayKey, today } from "./progress.js";
import { loadCards, cardsByLesson, cardById, cardId } from "./cards.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rich = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
const params = new URLSearchParams(location.search);
const reviewMode = params.has("review");
const freeLesson = params.get("cards");

let queue = [];        // cards to flip through
let at = 0, revealed = false, results = { pass: 0, miss: 0 };

function cardHtml(c, state) {
  return `<div class="card ${state === "due" ? "due" : ""}" id="${esc(c.id)}">
    <div class="name">${esc(c.name)}${state ? `<span class="state">${esc(state)}</span>` : ""}</div>
    <div><div class="k">What it is</div><div class="what">${rich(c.what)}</div></div>
    <div><div class="k">How you write it</div><pre class="code">${esc(c.how)}</pre></div>
    <div><div class="k">Example</div><div class="example">${rich(c.example)}</div></div>
    <div><div class="k">The mistake beginners make</div><div class="mistake">${rich(c.mistake)}</div></div>
  </div>`;
}

function stateOf(c) {
  const r = reviews.all()[cardId(c)];
  if (!r) return "";
  const day = dayKey(today());
  if (r.due_on <= day && !(r.reviewed_at && dayKey(new Date(r.reviewed_at)) === day)) return "due";
  return r.stage === "relearn" ? "relearning" : `next ${r.due_on}`;
}

function renderReference() {
  const groups = cardsByLesson();
  const lock = courseLock();
  $("toc").innerHTML = groups.map((g) => `<a href="#L${g.lesson}" class="${g.lesson > lock ? "locked" : ""}">L${String(g.lesson).padStart(2, "0")} · ${esc(g.titles[0])}</a>`).join("");
  $("reference").innerHTML = groups.map((g) => `<section class="lesson" id="L${g.lesson}">
    <div class="sub">Lesson ${String(g.lesson).padStart(2, "0")} · ${esc(g.titles.join(" · "))}${g.lesson > lock ? " · ahead of your course position" : ""}</div>
    <h2>${esc(g.titles[0])}</h2>
    <div class="caps" style="font-size:12px"><a href="concepts.html?cards=${g.lesson}">[~] Flip through these ${g.cards.length} cards</a></div>
    <div class="cards-wide">${g.cards.map((c) => cardHtml(c, stateOf(c))).join("")}</div>
  </section>`).join("");
  const due = reviews.cardsDueToday();
  $("modebar").innerHTML = due.pending.length ? `<a href="concepts.html?review=1">[!] ${due.pending.length} card${due.pending.length === 1 ? "" : "s"} due today · review them</a>` : `<span class="muted">${sync.user ? "No cards due today. Cards join the review queue when you solve the first problem of their topic." : "Sign in to get cards on a review schedule."}</span>`;
  if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView({ block: "start" }); }
}

function renderFlash() {
  $("reference").hidden = true; $("toc").hidden = true; $("flash").hidden = false;
  if (at >= queue.length) {
    const nothing = reviewMode && queue.length === 0;
    $("flash").innerHTML = `<div class="front">${nothing ? "Nothing due" : reviewMode ? "Cards done for today" : "End of the lesson's cards"}</div><div class="progress">${nothing ? "no concept cards are scheduled for today" : reviewMode ? `${results.pass} got it · ${results.miss} not yet` : `${queue.length} cards`}</div><div class="actions">${reviewMode ? `<a class="btn primary" href="./">Back to Today</a>` : ""}<a class="btn" href="concepts.html">All concepts</a></div>`;
    return;
  }
  const c = queue[at];
  $("eyebrow").textContent = reviewMode ? `Review · ${at + 1} of ${queue.length}` : `Lesson ${freeLesson} · ${at + 1} of ${queue.length}`; $("eyebrow").hidden = false;
  $("flash").innerHTML = `<div class="progress">Card ${at + 1} of ${queue.length}</div>
    <div class="front">${esc(c.front)}</div>
    ${revealed ? `<div class="back">
      <div class="name" style="font-family:var(--head);font-weight:700;font-size:18px">${esc(c.name)}</div>
      <div class="what">${rich(c.what)}</div>
      <pre class="code">${esc(c.how)}</pre>
      <div class="example">${rich(c.example)}</div>
      <div class="mistake" style="border-left:2px solid var(--error);padding-left:12px;color:var(--muted)">${rich(c.mistake)}</div>
    </div>
    <div class="actions">${reviewMode ? `<button class="btn primary" id="got">Got it</button><button class="btn" id="notyet">Not yet</button>` : `<button class="btn primary" id="next">Next ›</button>`}</div>`
    : `<div class="actions"><button class="btn primary" id="reveal">Show the answer</button></div>`}`;
}

async function answer(passed) {
  const c = queue[at];
  if (reviewMode) {
    results[passed ? "pass" : "miss"] += 1;
    const row = reviews.all()[cardId(c)];
    auth.insertAttempt(sync.user.id, cardId(c), row && row.due_on === dayKey(today()) ? "review" : "review-late", passed ? "pass" : "miss").catch(() => {});
    try { await reviews.recordResult(sync.user, cardId(c), passed, passed); } catch (e) { sync.note("Could not save the review: " + e.message); }
  }
  at += 1; revealed = false; renderFlash();
}

async function main() {
  const shell = mountShell("concepts");
  await loadBank();
  await loadCards();
  if (sync.user) { try { await reviews.refresh(); } catch (e) { /* cached queue */ } }
  if (reviewMode) {
    queue = reviews.cardsDueToday().pending.map((r) => cardById(r.problem_id)).filter(Boolean);
    $("title").textContent = "Card review";
    $("intro").textContent = queue.length ? "Read the question, think of the answer, then show it and say whether you had it." : "No cards are due right now.";
    renderFlash();
  } else if (freeLesson) {
    queue = cardsByLesson().filter((g) => String(g.lesson) === freeLesson).flatMap((g) => g.cards);
    $("title").textContent = "Flashcards";
    $("intro").textContent = "Question first, answer on request. Nothing is recorded here.";
    renderFlash();
  } else {
    renderReference();
  }
  $("flash").addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.id === "reveal") { revealed = true; renderFlash(); }
    else if (b.id === "got") answer(true);
    else if (b.id === "notyet") answer(false);
    else if (b.id === "next") answer(true);
  });
  onSynced((what) => { if (!reviewMode && !freeLesson && (what === "merged" || what === "local-changed")) renderReference(); shell.refresh(); });
}
main().catch((e) => { $("intro").textContent = "Could not load: " + e.message; });
