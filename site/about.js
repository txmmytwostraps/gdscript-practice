// The About page renders the top of README.md, up to the "about-end" marker,
// so the site and the repository describe the site with the same words.
import { mountShell } from "./shell.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => `<a href="${u}">${t}</a>`)
  .replace(/(^|[\s(])(https?:\/\/[^\s)]+)/g, (m, pre, u) => `${pre}<a href="${u}">${u}</a>`);

// A small Markdown subset: headings, paragraphs, bullet lists, fenced code.
function render(md) {
  const out = [], toc = [];
  let para = [], list = null, code = null;
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } if (list) { out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`); list = null; } };
  for (const raw of md.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (code !== null) { if (line.startsWith("```")) { out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); code = null; } else code.push(line); continue; }
    if (line.startsWith("```")) { flush(); code = []; continue; }
    if (/^<!--/.test(line)) continue;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { flush(); const level = h[1].length, text = h[2]; const id = slug(text); if (level === 2) toc.push({ id, text }); out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`); continue; }
    if (/^- /.test(line)) { if (para.length) flush(); (list = list || []).push(line.slice(2)); continue; }
    if (line === "") { flush(); continue; }
    para.push(line);
  }
  flush();
  return { html: out.join("\n"), toc };
}

async function main() {
  mountShell("about");
  const r = await fetch("../README.md");
  if (!r.ok) throw new Error("could not load the text");
  const text = await r.text();
  const cut = text.indexOf("<!-- about-end -->");
  const { html, toc } = render(cut >= 0 ? text.slice(0, cut) : text);
  $("about").innerHTML = html.replace(/<h1[^>]*>.*?<\/h1>/, "<h1>About</h1>");
  $("toc").innerHTML = toc.map((t) => `<a href="#${t.id}">${esc(t.text)}</a>`).join("");
  if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) el.scrollIntoView({ block: "start" }); }
}
main().catch((e) => { $("about").innerHTML = `<h1>About</h1><p class="muted">Could not load: ${esc(e.message)}</p>`; });
