// Concept cards: one per core concept, grouped by the lesson they belong to.
// cards/cards.json is the source; this loads it once and answers lookups.
import { TOPICS } from "./route-data.js";

let cards = null;
export async function loadCards(base = "../cards/") {
  if (cards) return cards;
  const r = await fetch(base + "cards.json");
  if (!r.ok) throw new Error("could not load the concept cards");
  cards = await r.json();
  return cards;
}
export function allCards() { return cards || []; }
export const cardId = (c) => "card:" + c.id;
export const isCardId = (id) => typeof id === "string" && id.startsWith("card:");
export function cardById(id) { const bare = id.replace(/^card:/, ""); return (cards || []).find((c) => c.id === bare) || null; }
export function lessonOf(concept) { const t = TOPICS.find((x) => x.concept === concept); return t ? t.lesson : null; }
/** Cards for a topic: every card whose own topic is in the same lesson. */
export function cardsForConcept(concept) {
  const lesson = lessonOf(concept);
  if (lesson === null) return [];
  const concepts = new Set(TOPICS.filter((t) => t.lesson === lesson).map((t) => t.concept));
  return (cards || []).filter((c) => concepts.has(c.concept));
}
/** Cards grouped by lesson number, in course order. */
export function cardsByLesson() {
  const groups = new Map();
  for (const t of TOPICS) {
    const here = (cards || []).filter((c) => c.concept === t.concept);
    if (!here.length) continue;
    if (!groups.has(t.lesson)) groups.set(t.lesson, { lesson: t.lesson, titles: [], cards: [] });
    const g = groups.get(t.lesson);
    g.titles.push(t.title); g.cards.push(...here);
  }
  return [...groups.values()];
}
