// The milestone stage: a strip with a placeholder robot on it. The page feeds
// it states that came out of the judge running the user's own script, and it
// draws or animates them. Two kinds: "move" watches x and speed and slides the
// robot along; "health" watches health and max_health and shows a bar and the
// last printed line as a status.
export const STAGE_WIDTH = 600;
const H = 160, GROUND = 128;
// What each milestone adds to the character, for the "so far" views on the Gallery and Today.
export const GAINS = { m1: { key: "move", text: "moves along the stage", fns: "move_right, move_left, speed_up, slow_down" }, m2: { key: "health", text: "has health that never goes below zero", fns: "take_damage, heal, report" }, m3: { key: "walk", text: "walks the floor between two walls", fns: "move, go_left, go_right, stop" }, m4: { key: "bag", text: "carries a bag of four items", fns: "pick_up, has, count, use" }, m5: { key: "fight", text: "fights an enemy to the end", fns: "attack, enemy_turn, is_alive, fight" } };
export const KINDS = { move: { watch: ["x", "speed"] }, health: { watch: ["health", "max_health"] }, walk: { watch: ["position", "speed", "facing"] }, bag: { watch: ["items", "capacity", "health", "max_health"] }, fight: { watch: ["health", "max_health", "attack_power", "enemy_health", "enemy_max_health", "enemy_attack"] }, character: { watch: [] } };

export function makeScene(container, kind = "move") {
  container.classList.add("gridbg");
  container.innerHTML = `<canvas width="${STAGE_WIDTH}" height="${H}" style="width:100%;max-width:${STAGE_WIDTH}px;display:block;background:transparent;border:1px solid var(--line)"></canvas><div class="caps dim scene-readout" style="font-size:12px;margin-top:6px"></div>`;
  const canvas = container.querySelector("canvas"), readout = container.querySelector(".scene-readout");
  const ctx = canvas.getContext("2d");
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
  let state = kind === "health" ? { health: 100, max_health: 100, out: [] } : kind === "walk" ? { position: null, speed: null, facing: null } : kind === "bag" ? { items: null, capacity: null, health: null, max_health: null } : kind === "fight" ? { health: null, max_health: null, enemy_health: null, enemy_max_health: null, returned: null } : kind === "character" ? { x: 300, facing: "right", has: {} } : { x: 0, speed: 0 };
  let anim = 0;
  const fmt = (v) => (Number.isFinite(v) ? (Number.isInteger(v) ? v : +v.toFixed(1)) : "?");

  function robot(px, color) {
    ctx.save(); ctx.translate(px, GROUND);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(0, -46, 9, 0, Math.PI * 2); ctx.stroke();               // head
    ctx.beginPath(); ctx.rect(-10, -34, 20, 22); ctx.stroke();                         // body
    ctx.beginPath(); ctx.moveTo(-10, -26); ctx.lineTo(-20, -14); ctx.moveTo(10, -26); ctx.lineTo(20, -14); ctx.stroke();   // arms
    ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(-6, 0); ctx.moveTo(6, -12); ctx.lineTo(6, 0); ctx.stroke();           // legs
    ctx.fillRect(-4, -49, 3, 3); ctx.fillRect(1, -49, 3, 3);                          // eyes
    ctx.restore();
  }
  function ground() {
    ctx.strokeStyle = css("--line-strong"); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, GROUND + 0.5); ctx.lineTo(STAGE_WIDTH, GROUND + 0.5); ctx.stroke();
  }

  function drawMove(s) {
    const accent = css("--accent"), dim = css("--dim");
    ctx.clearRect(0, 0, STAGE_WIDTH, H);
    ground();
    ctx.fillStyle = dim; ctx.font = "10px IBM Plex Mono, monospace";
    for (let t = 0; t <= STAGE_WIDTH; t += 100) { ctx.fillRect(t, GROUND, 1, 6); ctx.fillText(String(t), t + 3, GROUND + 16); }
    const x = Number.isFinite(s.x) ? s.x : 0;
    const onStage = x >= -20 && x <= STAGE_WIDTH + 20;
    robot(Math.max(-20, Math.min(STAGE_WIDTH + 20, x)), onStage ? accent : dim);
    readout.textContent = `x = ${fmt(x)}${s.speed !== undefined && s.speed !== null ? ` · speed = ${fmt(s.speed)}` : ""}${onStage ? "" : " · off the stage"}`;
  }
  function drawHealth(s) {
    const accent = css("--accent"), dim = css("--dim"), error = css("--error"), line = css("--line-strong"), text = css("--text");
    ctx.clearRect(0, 0, STAGE_WIDTH, H);
    ground();
    const hp = Number.isFinite(s.health) ? s.health : null, max = Number.isFinite(s.max_health) && s.max_health > 0 ? s.max_health : null;
    const down = hp !== null && hp <= 0;
    robot(STAGE_WIDTH / 2, down ? dim : accent);
    // the bar
    const bx = STAGE_WIDTH / 2 - 100, by = 24, bw = 200, bh = 12;
    ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
    if (hp !== null && max !== null) { ctx.fillStyle = down ? error : accent; ctx.fillRect(bx + 1, by + 1, Math.max(0, Math.min(1, hp / max)) * (bw - 1), bh - 1); }
    ctx.fillStyle = text; ctx.font = "12px IBM Plex Mono, monospace"; ctx.textAlign = "center";
    ctx.fillText(hp === null || max === null ? "HP ?" : `HP ${fmt(hp)} / ${fmt(max)}`, STAGE_WIDTH / 2, by + bh + 16);
    const last = Array.isArray(s.out) && s.out.length ? s.out[s.out.length - 1] : "";
    if (last) { ctx.fillStyle = down ? error : accent; ctx.font = "bold 14px Space Grotesk, sans-serif"; ctx.fillText(last, STAGE_WIDTH / 2, GROUND - 62); }
    ctx.textAlign = "start";
    readout.textContent = `${hp === null ? "no health yet" : `health = ${fmt(hp)}`}${max !== null ? ` · max_health = ${fmt(max)}` : ""}${last ? ` · printed: ${last}` : ""}`;
  }
  // A floor with a wall at each end; position is a Vector2 ({$v2: [x, y]}) and facing a word.
  function drawWalk(s) {
    const accent = css("--accent"), dim = css("--dim"), line = css("--line-strong"), error = css("--error");
    ctx.clearRect(0, 0, STAGE_WIDTH, H);
    ground();
    ctx.fillStyle = line; ctx.fillRect(0, GROUND - 70, 3, 70); ctx.fillRect(STAGE_WIDTH - 3, GROUND - 70, 3, 70);   // the walls
    ctx.fillStyle = dim; ctx.font = "10px IBM Plex Mono, monospace";
    for (let t = 0; t <= STAGE_WIDTH; t += 100) { ctx.fillRect(t, GROUND, 1, 6); ctx.fillText(String(t), Math.min(t + 3, STAGE_WIDTH - 22), GROUND + 16); }
    const v = s.position && s.position.$v2 ? s.position.$v2 : null;
    const x = v ? v[0] : null;
    if (x === null) { readout.textContent = "no position yet"; return; }
    const inside = x >= 0 && x <= STAGE_WIDTH;
    const px = Math.max(-20, Math.min(STAGE_WIDTH + 20, x));
    robot(px, inside ? accent : error);
    if (s.facing === "left" || s.facing === "right") {   // a small arrow the way it faces
      const d = s.facing === "left" ? -1 : 1;
      ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(px + d * 26, GROUND - 40); ctx.lineTo(px + d * 16, GROUND - 46); ctx.lineTo(px + d * 16, GROUND - 34); ctx.closePath(); ctx.fill();
    }
    readout.textContent = `position = (${fmt(v[0])}, ${fmt(v[1])})${s.speed !== null && s.speed !== undefined ? ` · speed = ${fmt(s.speed)}` : ""}${s.facing ? ` · facing ${s.facing}` : ""}${inside ? "" : " · past the wall"}`;
  }
  // The robot with a bag panel listing its items, and the health bar once the script has health.
  function drawBag(s) {
    const accent = css("--accent"), dim = css("--dim"), line = css("--line-strong"), text = css("--text"), muted = css("--muted"), error = css("--error");
    ctx.clearRect(0, 0, STAGE_WIDTH, H);
    ground();
    robot(120, accent);
    const items = Array.isArray(s.items) ? s.items : null;
    const cap = Number.isFinite(s.capacity) ? s.capacity : null;
    // the bag panel
    const bx = 220, by = 18, bw = 360, bh = 104;
    ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
    ctx.fillStyle = muted; ctx.font = "10px IBM Plex Mono, monospace"; ctx.textAlign = "left";
    ctx.fillText(items === null ? "BAG" : `BAG ${items.length}${cap !== null ? " / " + cap : ""}`, bx + 10, by + 16);
    if (items === null) { ctx.fillStyle = dim; ctx.fillText("no bag yet", bx + 10, by + 40); }
    else if (!items.length) { ctx.fillStyle = dim; ctx.fillText("empty", bx + 10, by + 40); }
    else {
      const slots = Math.max(cap || 0, items.length);
      for (let i = 0; i < slots; i++) {
        const col = i % 4, row = Math.floor(i / 4);
        const sx = bx + 10 + col * 86, sy = by + 26 + row * 36;
        ctx.strokeStyle = i < items.length ? accent : line; ctx.strokeRect(sx + 0.5, sy + 0.5, 78, 28);
        if (i < items.length) { ctx.fillStyle = text; ctx.font = "12px IBM Plex Mono, monospace"; ctx.fillText(String(items[i]).slice(0, 9), sx + 8, sy + 19); }
      }
    }
    const hp = Number.isFinite(s.health) ? s.health : null, max = Number.isFinite(s.max_health) && s.max_health > 0 ? s.max_health : null;
    if (hp !== null && max !== null) {
      const hx = 70, hy = 24, hw = 100, hh = 10;
      ctx.strokeStyle = line; ctx.strokeRect(hx + 0.5, hy + 0.5, hw, hh);
      ctx.fillStyle = hp <= 0 ? error : accent; ctx.fillRect(hx + 1, hy + 1, Math.max(0, Math.min(1, hp / max)) * (hw - 1), hh - 1);
      ctx.fillStyle = text; ctx.font = "11px IBM Plex Mono, monospace"; ctx.fillText(`HP ${fmt(hp)} / ${fmt(max)}`, hx, hy + hh + 14);
    }
    readout.textContent = `${items === null ? "no bag yet" : `items = [${items.join(", ")}]`}${cap !== null ? ` · capacity = ${cap}` : ""}${hp !== null ? ` · health = ${fmt(hp)}` : ""}`;
  }
  // Two fighters facing each other with a health bar each; the last returned value shows as the verdict.
  function bar(x, y, w, hp, max, label, color) {
    const line = css("--line-strong"), text = css("--text"), error = css("--error");
    ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, 10);
    if (hp !== null && max !== null) { ctx.fillStyle = hp <= 0 ? error : color; ctx.fillRect(x + 1, y + 1, Math.max(0, Math.min(1, hp / max)) * (w - 1), 9); }
    ctx.fillStyle = text; ctx.font = "11px IBM Plex Mono, monospace"; ctx.textAlign = "left";
    ctx.fillText(`${label} ${hp === null ? "?" : fmt(hp)}${max !== null ? " / " + fmt(max) : ""}`, x, y + 24);
  }
  function drawFight(s) {
    const accent = css("--accent"), dim = css("--dim"), error = css("--error"), milestone = css("--milestone");
    ctx.clearRect(0, 0, STAGE_WIDTH, H);
    ground();
    const hp = Number.isFinite(s.health) ? s.health : null, max = Number.isFinite(s.max_health) ? s.max_health : null;
    const ehp = Number.isFinite(s.enemy_health) ? s.enemy_health : null, emax = Number.isFinite(s.enemy_max_health) ? s.enemy_max_health : null;
    robot(150, hp !== null && hp <= 0 ? dim : accent);
    // the enemy: a spikier shape
    const ex = 450, down = ehp !== null && ehp <= 0;
    ctx.save(); ctx.translate(ex, GROUND); ctx.strokeStyle = down ? dim : milestone; ctx.fillStyle = down ? dim : milestone; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-14, -30); ctx.lineTo(-22, -46); ctx.lineTo(-6, -38); ctx.lineTo(0, -54); ctx.lineTo(6, -38); ctx.lineTo(22, -46); ctx.lineTo(14, -30); ctx.lineTo(14, 0); ctx.closePath(); ctx.stroke();
    ctx.fillRect(-7, -32, 4, 4); ctx.fillRect(3, -32, 4, 4); ctx.restore();
    bar(90, 18, 120, hp, max, "ROBOT", accent);
    bar(390, 18, 120, ehp, emax, "ENEMY", milestone);
    const verdict = typeof s.returned === "string" ? s.returned : null;
    if (verdict) { ctx.fillStyle = verdict === "won" ? accent : error; ctx.font = "bold 16px Space Grotesk, sans-serif"; ctx.textAlign = "center"; ctx.fillText(verdict.toUpperCase(), STAGE_WIDTH / 2, 74); ctx.textAlign = "left"; }
    readout.textContent = `${hp === null ? "no fighters yet" : `health = ${fmt(hp)}`}${ehp !== null ? ` · enemy_health = ${fmt(ehp)}` : ""}${s.returned !== null && s.returned !== undefined ? ` · returned ${JSON.stringify(s.returned)}` : ""}`;
  }
  // Everything earned so far in one picture: the robot, and each milestone's addition once it is done.
  function drawCharacter(s) {
    const accent = css("--accent"), dim = css("--dim"), line = css("--line-strong"), text = css("--text"), muted = css("--muted"), milestone = css("--milestone");
    const has = s.has || {};
    ctx.clearRect(0, 0, STAGE_WIDTH, H);
    ground();
    if (has.walk) { ctx.fillStyle = line; ctx.fillRect(0, GROUND - 70, 3, 70); ctx.fillRect(STAGE_WIDTH - 3, GROUND - 70, 3, 70); }
    const px = Math.max(30, Math.min(STAGE_WIDTH - 30, Number.isFinite(s.x) ? s.x : 300));
    robot(px, accent);
    if (has.walk && (s.facing === "left" || s.facing === "right")) {
      const d = s.facing === "left" ? -1 : 1;
      ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(px + d * 26, GROUND - 40); ctx.lineTo(px + d * 16, GROUND - 46); ctx.lineTo(px + d * 16, GROUND - 34); ctx.closePath(); ctx.fill();
    }
    if (has.health) {   // full health bar over the robot
      const bx = px - 40, by = GROUND - 78;
      ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, 80, 8);
      ctx.fillStyle = accent; ctx.fillRect(bx + 1, by + 1, 79, 7);
      ctx.fillStyle = muted; ctx.font = "10px IBM Plex Mono, monospace"; ctx.textAlign = "center"; ctx.fillText("HP 100 / 100", px, by - 4); ctx.textAlign = "left";
    }
    if (has.bag) {   // a small bag on the back
      ctx.strokeStyle = milestone; ctx.lineWidth = 2; ctx.strokeRect(px + 12.5, GROUND - 32.5, 12, 14);
    }
    if (has.fight) {   // the enemy waiting at the far end
      const ex = px < 300 ? STAGE_WIDTH - 60 : 60;
      ctx.save(); ctx.translate(ex, GROUND); ctx.strokeStyle = milestone; ctx.fillStyle = milestone; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-14, -30); ctx.lineTo(-22, -46); ctx.lineTo(-6, -38); ctx.lineTo(0, -54); ctx.lineTo(6, -38); ctx.lineTo(22, -46); ctx.lineTo(14, -30); ctx.lineTo(14, 0); ctx.closePath(); ctx.stroke();
      ctx.fillRect(-7, -32, 4, 4); ctx.fillRect(3, -32, 4, 4); ctx.restore();
    }
    const labels = [has.move && "moves", has.health && "has health", has.walk && "walks the floor", has.bag && "carries a bag", has.fight && "fights"].filter(Boolean);
    readout.textContent = labels.length ? labels.join(" · ") : "nothing built yet";
  }
  const draw = kind === "health" ? drawHealth : kind === "walk" ? drawWalk : kind === "bag" ? drawBag : kind === "fight" ? drawFight : kind === "character" ? drawCharacter : drawMove;

  return {
    kind,
    /** Show one state at once. */
    set(s) { cancelAnimationFrame(anim); state = { ...state, ...s }; draw(state); },
    get() { return state; },
    /** Play a list of states, one per animation frame, then stay on the last. */
    play(frames) {
      cancelAnimationFrame(anim);
      if (!frames.length) return;
      // A hidden tab gets no animation frames: show the end state at once.
      if (document.hidden) { state = { ...state, ...frames[frames.length - 1] }; draw(state); return; }
      let i = 0;
      const tick = () => { state = { ...state, ...frames[i] }; draw(state); i++; if (i < frames.length) anim = requestAnimationFrame(tick); };
      tick();
    },
    /** A looping demo for pages without the judge: the robot patrols. */
    /** Patrol back and forth; range narrows the walk (the Today panel shows the middle of the stage). */
    demo(speed = 120, range = [30, STAGE_WIDTH - 30]) {
      cancelAnimationFrame(anim);
      let x = range[0], dir = 1, last = performance.now();
      const tick = (now) => { x += dir * speed * Math.min(0.05, (now - last) / 1000); last = now; if (x > range[1]) dir = -1; if (x < range[0]) dir = 1; state = { ...state, x, speed: speed * dir, facing: dir < 0 ? "left" : "right" }; draw(state); anim = requestAnimationFrame(tick); };
      anim = requestAnimationFrame(tick);
    },
    stop() { cancelAnimationFrame(anim); },
  };
}

// Buttons that call the user's own functions. Every press is added to a
// history of actions; the whole history is replayed through the judge on the
// current code, and the frames the last action produced are animated. So the
// stage always shows what the script, as written now, would do.
export function wireScene(scene, judge, { buttonsEl, noteEl, getCode, watch }) {
  const names = watch || KINDS[scene.kind].watch;
  let history = [];
  let buttons = [];
  let busy = false;
  const note = (t) => { if (noteEl) noteEl.textContent = t || ""; };
  const toState = (vals) => Object.fromEntries(names.map((n, i) => [n, vals[i]]));
  async function replay(animateLast) {
    if (busy) return;
    busy = true;
    try {
      const { result } = await judge.run(getCode(), { tests: [{ script: history, trace: names, expect: null }] });
      if (result.status !== "ok") { note(result.status === "compile_error" ? "the script does not compile yet" : result.error || "could not run"); return; }
      const r = result.results[0];
      const frames = (r.trace || []).map(toState);
      if (r.error) { note(r.error); history.pop(); }
      else note("");
      if (!frames.length) return;
      frames[frames.length - 1] = { ...frames[frames.length - 1], out: r.out || [], returned: history.length ? (r.returned === undefined ? null : r.returned) : null };
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
