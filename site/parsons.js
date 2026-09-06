// Parsons problems: the reference solution's lines, shuffled; put them in
// order. Indentation stays on each line. Works by tapping the arrows or by
// dragging on a mouse. The assembled code is graded by the judge, so any
// correct ordering passes.
import { seededOrder } from "./mutate.js";

export function makeParsons(container, solution, seed) {
  const lines = solution.split("\n").filter((l) => l.trim() !== "");
  let order = seededOrder(seed, lines.length);
  if (order.every((v, i) => v === i)) order = order.slice(1).concat(order[0]);   // never start solved
  let items = order.map((i) => ({ text: lines[i] }));

  const render = () => {
    container.innerHTML = `<div class="parsons-hint label">Put the lines in order · tap ▲ ▼ or drag</div>` + items.map((it, i) => {
      const indent = (/^\t*/.exec(it.text) || [""])[0].length;
      return `<div class="pline" draggable="true" data-i="${i}" style="--indent:${indent}"><span class="grip">⋮⋮</span><code>${escapeHtml(it.text.replace(/^\t+/, ""))}</code><span class="moves"><button type="button" data-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move up">▲</button><button type="button" data-down="${i}" ${i === items.length - 1 ? "disabled" : ""} aria-label="Move down">▼</button></span></div>`;
    }).join("");
  };
  const move = (from, to) => { if (to < 0 || to >= items.length || from === to) return; const [it] = items.splice(from, 1); items.splice(to, 0, it); render(); container.dispatchEvent(new Event("change")); };

  container.addEventListener("click", (ev) => {
    const up = ev.target.closest("button[data-up]"); if (up) return move(Number(up.dataset.up), Number(up.dataset.up) - 1);
    const down = ev.target.closest("button[data-down]"); if (down) return move(Number(down.dataset.down), Number(down.dataset.down) + 1);
  });
  let dragging = null;
  container.addEventListener("dragstart", (ev) => { const row = ev.target.closest(".pline"); if (!row) return; dragging = Number(row.dataset.i); ev.dataTransfer.effectAllowed = "move"; row.classList.add("dragging"); });
  container.addEventListener("dragover", (ev) => { ev.preventDefault(); const row = ev.target.closest(".pline"); container.querySelectorAll(".pline").forEach((r) => r.classList.remove("over")); if (row) row.classList.add("over"); });
  container.addEventListener("drop", (ev) => { ev.preventDefault(); const row = ev.target.closest(".pline"); if (row && dragging !== null) move(dragging, Number(row.dataset.i)); dragging = null; });
  container.addEventListener("dragend", () => { dragging = null; container.querySelectorAll(".pline").forEach((r) => r.classList.remove("dragging", "over")); });
  render();

  return {
    get: () => items.map((it) => it.text).join("\n"),
    reset: () => { items = order.map((i) => ({ text: lines[i] })); render(); },
  };
}

function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
