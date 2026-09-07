// The milestone stage: a strip 600 pixels wide with a placeholder robot on
// it. The page feeds it snapshots ({x, speed}) that came out of the judge
// running the user's own script, and it draws or animates them.
export const STAGE_WIDTH = 600;
const H = 160, GROUND = 128;

export function makeScene(container) {
  container.innerHTML = `<canvas width="${STAGE_WIDTH}" height="${H}" style="width:100%;max-width:${STAGE_WIDTH}px;display:block;background:var(--bg);border:1px solid var(--line)"></canvas><div class="caps dim scene-readout" style="font-size:12px;margin-top:6px"></div>`;
  const canvas = container.querySelector("canvas"), readout = container.querySelector(".scene-readout");
  const ctx = canvas.getContext("2d");
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
  let state = { x: 0, speed: 0 };
  let anim = 0;

  function draw(s) {
    const accent = css("--accent"), line = css("--line-strong"), dim = css("--dim");
    ctx.clearRect(0, 0, STAGE_WIDTH, H);
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, GROUND + 0.5); ctx.lineTo(STAGE_WIDTH, GROUND + 0.5); ctx.stroke();
    ctx.fillStyle = dim; ctx.font = "10px IBM Plex Mono, monospace";
    for (let t = 0; t <= STAGE_WIDTH; t += 100) { ctx.fillRect(t, GROUND, 1, 6); ctx.fillText(String(t), t + 3, GROUND + 16); }
    const x = Number.isFinite(s.x) ? s.x : 0;
    const onStage = x >= -20 && x <= STAGE_WIDTH + 20;
    const px = Math.max(-20, Math.min(STAGE_WIDTH + 20, x));
    ctx.save(); ctx.translate(px, GROUND);
    ctx.strokeStyle = onStage ? accent : dim; ctx.fillStyle = onStage ? accent : dim; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(0, -46, 9, 0, Math.PI * 2); ctx.stroke();               // head
    ctx.beginPath(); ctx.rect(-10, -34, 20, 22); ctx.stroke();                         // body
    ctx.beginPath(); ctx.moveTo(-10, -26); ctx.lineTo(-20, -14); ctx.moveTo(10, -26); ctx.lineTo(20, -14); ctx.stroke();   // arms
    ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(-6, 0); ctx.moveTo(6, -12); ctx.lineTo(6, 0); ctx.stroke();           // legs
    ctx.fillRect(-4, -49, 3, 3); ctx.fillRect(1, -49, 3, 3);                          // eyes
    ctx.restore();
    const fmt = (v) => (Number.isFinite(v) ? (Number.isInteger(v) ? v : +v.toFixed(1)) : "?");
    readout.textContent = `x = ${fmt(x)}${s.speed !== undefined && s.speed !== null ? ` · speed = ${fmt(s.speed)}` : ""}${onStage ? "" : " · off the stage"}`;
  }

  return {
    /** Show one state at once. */
    set(s) { cancelAnimationFrame(anim); state = { ...state, ...s }; draw(state); },
    get() { return state; },
    /** Play a list of states, one per animation frame, then stay on the last. */
    play(frames) {
      cancelAnimationFrame(anim);
      if (!frames.length) return;
      let i = 0;
      const tick = () => { state = { ...state, ...frames[i] }; draw(state); i++; if (i < frames.length) anim = requestAnimationFrame(tick); };
      tick();
    },
    /** A looping demo for pages without the judge: the robot patrols. */
    demo(speed = 120) {
      cancelAnimationFrame(anim);
      let x = 0, dir = 1, last = performance.now();
      const tick = (now) => { x += dir * speed * Math.min(0.05, (now - last) / 1000); last = now; if (x > STAGE_WIDTH - 30) dir = -1; if (x < 30) dir = 1; state = { x, speed: speed * dir }; draw(state); anim = requestAnimationFrame(tick); };
      anim = requestAnimationFrame(tick);
    },
    stop() { cancelAnimationFrame(anim); },
  };
}

// Buttons that call the user's own functions. Every press is added to a
// history of actions; the whole history is replayed through the judge on the
// current code, and the frames the last action produced are animated. So the
// stage always shows what the script, as written now, would do.
export function wireScene(scene, judge, { buttonsEl, noteEl, getCode }) {
  let history = [];
  let buttons = [];
  let busy = false;
  const note = (t) => { if (noteEl) noteEl.textContent = t || ""; };
  async function replay(animateLast) {
    if (busy) return;
    busy = true;
    try {
      const { result } = await judge.run(getCode(), { tests: [{ script: history, trace: ["x", "speed"], expect: null }] });
      if (result.status !== "ok") { note(result.status === "compile_error" ? "the script does not compile yet" : result.error || "could not run"); return; }
      const r = result.results[0];
      const frames = (r.trace || []).map(([x, speed]) => ({ x, speed }));
      if (r.error) { note(r.error); history.pop(); }
      else note("");
      if (!frames.length) return;
      const last = history[history.length - 1];
      const count = animateLast && last ? (last.frames ? Number(last.frames) : 1) : 0;
      if (count > 0 && frames.length > count) scene.play(frames.slice(frames.length - count));
      else scene.set(frames[frames.length - 1]);
    } catch (e) { note(e.message); }
    finally { busy = false; }
  }
  function render() {
    buttonsEl.innerHTML = buttons.map((b, i) => `<button type="button" class="btn small" data-i="${i}">${b.label}</button>`).join("") + `<button type="button" class="btn small" data-reset>Reset stage</button>`;
  }
  buttonsEl.addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-reset")) { history = []; replay(false); return; }
    const spec = buttons[Number(b.dataset.i)]; if (!spec) return;
    if (history.length >= 60) history.shift();
    history.push(spec.frames ? { frames: spec.frames } : { call: spec.call, args: spec.args || [] });
    replay(true);
  });
  return {
    setButtons(list) { buttons = list || []; render(); },
    reset() { history = []; return replay(false); },
    refresh() { return replay(false); },   // after the code changed: same history, new script
  };
}
