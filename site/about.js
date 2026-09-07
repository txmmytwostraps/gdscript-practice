// The About page renders README.md: the short part up to the "about-more"
// marker is shown; the part between "about-more" and "about-end" sits under a
// collapsed "More detail"; the developer sections after "about-end" stay in
// the README only. One source, so the site and the repository agree.
import { mountShell } from "./shell.js";

const $ = (id) => document.getElementById(id);
const SITE = "https://txmmytwostraps.github.io/gdscript-practice/site/";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const local = (u) => (u.startsWith(SITE) ? (u.slice(SITE.length) || "./") : u);   // links to this site stay on this copy of it
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => `<a href="${local(u)}">${t}</a>`)
  .replace(/(^|[\s(])(https?:\/\/[^\s)]+)/g, (m, pre, u) => `${pre}<a href="${local(u)}">${u}</a>`);

// A small Markdown subset: headings, paragraphs, bullet lists, fenced code.
function render(md) {
  const out = [];
  let para = [], list = null, code = null;
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } if (list) { out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`); list = null; } };
  for (const raw of md.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (code !== null) { if (line.startsWith("```")) { out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); code = null; } else code.push(line); continue; }
    if (line.startsWith("```")) { flush(); code = []; continue; }
    if (/^<!--/.test(line)) continue;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { flush(); out.push(`<h${h[1].length} id="${slug(h[2])}">${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^- /.test(line)) { if (para.length) flush(); (list = list || []).push(line.slice(2)); continue; }
    if (line === "") { flush(); continue; }
    para.push(line);
  }
  flush();
  return out.join("\n");
}

async function main() {
  mountShell("about");
  const r = await fetch("../README.md");
  if (!r.ok) throw new Error("could not load the text");
  const text = await r.text();
  const more = text.indexOf("<!-- about-more -->"), end = text.indexOf("<!-- about-end -->");
  const short = text.slice(0, more >= 0 ? more : end >= 0 ? end : text.length);
  const detail = more >= 0 ? text.slice(more, end >= 0 ? end : text.length) : "";
  $("about").innerHTML = render(short).replace(/<h1[^>]*>.*?<\/h1>/, "<h1>About</h1>")
    + (detail.trim() ? `<details class="more" id="more"><summary>More detail</summary>${render(detail)}</details>` : "");
  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target) { const d = target.closest("details"); if (d) d.open = true; target.scrollIntoView({ block: "start" }); }
}
main().catch((e) => { $("about").innerHTML = `<h1>About</h1><p class="muted">Could not load: ${esc(e.message)}</p>`; });
