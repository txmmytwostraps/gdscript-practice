// The header every page shares: brand, nav, streak/level/course, account.
import * as auth from "./auth.js";
import { renderHeaderStats, trackTime } from "./progress.js";
import { sync, onSynced } from "./sync.js";

const NAV = [["Today", "./"], ["Route", "route.html"], ["Practice", "practice.html"], ["Stats", "stats.html"]];

export function mountShell(active, { stats = true } = {}) {
  // Testing aid: ?today=YYYY-MM-DD makes every page believe it is that day.
  const t = new URLSearchParams(location.search).get("today");
  if (t !== null) { try { if (t) sessionStorage.setItem("gdp.today", t); else sessionStorage.removeItem("gdp.today"); } catch (e) {} }
  const header = document.createElement("header");
  header.className = "top";
  header.innerHTML = `
    <a class="brand" href="./"><span class="mark"></span><span class="name">GDScript Practice</span></a>
    <nav class="nav">${NAV.map(([n, href]) => `<a href="${href}" class="${n.toLowerCase() === active ? "active" : ""}">${n}</a>`).join("")}</nav>
    <div class="stats" id="header-stats" ${stats ? "" : "hidden"}></div>
    <div class="account">
      <div id="account-off" hidden><span class="muted">Progress stays in this browser</span></div>
      <div id="account-out" hidden>
        <button type="button" class="btn small" id="github-signin">Sign in with GitHub</button>
        <button type="button" class="btn small" id="email-toggle">Email</button>
        <form id="email-form" hidden onsubmit="return false">
          <input id="email" type="email" placeholder="email" autocomplete="username">
          <input id="password" type="password" placeholder="password" autocomplete="current-password">
          <button type="button" class="btn small" id="email-signin">Sign in</button>
          <button type="button" class="btn small" id="email-signup">Create account</button>
        </form>
      </div>
      <div id="account-in" hidden><span id="account-name" class="accent"></span><button type="button" class="btn small" id="signout">Sign out</button></div>
      <div id="account-note" hidden></div>
    </div>`;
  document.body.prepend(header);
  const $ = (id) => document.getElementById(id);

  const renderAccount = () => {
    const u = sync.user;
    $("account-off").hidden = Boolean(u) || !auth.enabled;
    $("account-out").hidden = Boolean(u) || !auth.enabled;
    $("account-in").hidden = !u;
    $("account-off").hidden = auth.enabled;
    if (u) $("account-name").textContent = auth.displayName(u);
    $("email-form").hidden = true;
  };
  const refresh = () => { renderHeaderStats($("header-stats")); renderAccount(); };
  onSynced(refresh);
  refresh();
  trackTime();

  if (auth.enabled) {
    $("github-signin").addEventListener("click", () => auth.signInWithGitHub());
    $("email-toggle").addEventListener("click", () => { const f = $("email-form"); f.hidden = !f.hidden; if (!f.hidden) $("email").focus(); });
    $("email-signin").addEventListener("click", async () => { const err = await auth.signInWithEmail($("email").value.trim(), $("password").value); sync.note(err || ""); });
    $("email-signup").addEventListener("click", async () => { const err = await auth.signUpWithEmail($("email").value.trim(), $("password").value); sync.note(err || "Account created."); });
    $("signout").addEventListener("click", async () => { await sync.flush(); await auth.signOut(); sync.note("Signed out. Progress stays in this browser."); });
    auth.onAuthChange((u) => { sync.setUser(u); });
    auth.currentUser().then((u) => { if (u) sync.setUser(u); });
    if (location.search.includes("code=")) history.replaceState(null, "", location.pathname + location.hash);
  }
  window.addEventListener("beforeunload", () => { sync.flush(); });
  return { refresh };
}
