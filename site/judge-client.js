// JudgeClient — runs the Godot judge inside a sandboxed iframe and talks to it
// with postMessage. Sandboxing (no allow-same-origin) gives the frame an opaque
// origin, which Chromium runs in its own process. That is what makes the
// watchdog possible: if user code loops forever the judge process freezes but
// this page does not, so we can remove the iframe (killing the loop) and load
// a fresh one.
export class JudgeClient {
  constructor({ src, container, timeoutMs = 5000, reloadDelayMs = 2000, onStatus = () => {}, onTimeout = null }) {
    this.src = src;
    this.container = container;
    this.timeoutMs = timeoutMs;
    this.reloadDelayMs = reloadDelayMs;
    this.onStatus = onStatus;
    this.onTimeout = onTimeout;   // if set, called instead of the automatic iframe reload
    this.frame = null;
    this.ready = null;
    this.pending = null;
    this.nextId = 1;
    this.loads = 0;
    window.addEventListener("message", (ev) => this._onMessage(ev));
  }

  /** Create the iframe. Resolves when the engine says it is ready. */
  load() {
    return this.reload(0);
  }

  /**
   * Remove the current iframe and create a new one after delayMs. The delay
   * matters after a timeout: Chromium keeps all sandboxed frames of a page in
   * one process, and a frozen process cannot detach its frame. Waiting lets
   * Chrome kill the orphaned process so the new frame gets a fresh one.
   */
  reload(delayMs) {
    this.destroy();
    this.onStatus("loading");
    const p = new Promise((r) => setTimeout(r, delayMs)).then(() => this._create());
    this.ready = p;
    p.catch(() => {});
    return p;
  }

  _create() {
    this.loads += 1;
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-scripts");
    f.src = this.src + (this.src.includes("?") ? "&" : "?") + "n=" + this.loads; // defeat bfcache reuse
    this.frame = f;
    this.container.appendChild(f);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("judge engine did not become ready in 90 s")), 90000);
      this._readyResolve = () => { clearTimeout(timer); resolve(); };
      this._readyReject = (e) => { clearTimeout(timer); reject(e); };
    });
  }

  destroy() {
    if (this.frame) { this.frame.remove(); this.frame = null; }
  }

  /**
   * Run user code against a problem. Resolves with {result, errors, ms}.
   * Rejects with err.timedOut === true if the judge did not answer in time;
   * in that case a fresh judge is already loading.
   */
  async run(code, problem) {
    await this.ready;
    if (this.pending) throw new Error("a run is already in progress");
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending = null;
        this.onStatus("timeout");
        const err = new Error("timed out after " + this.timeoutMs / 1000 + " s — check for an infinite loop");
        err.timedOut = true;
        reject(err);
        if (this.onTimeout) this.onTimeout(err); else this.reload(this.reloadDelayMs);
      }, this.timeoutMs);
      this.pending = { id, resolve, reject, timer };
      this.frame.contentWindow.postMessage({ type: "run", id, code, problem: JSON.stringify(problem) }, "*");
    });
  }

  _onMessage(ev) {
    if (!this.frame || ev.source !== this.frame.contentWindow) return; // ignore stale frames
    const m = ev.data || {};
    if (m.type === "ready") {
      this.onStatus("ready");
      this._readyResolve();
    } else if (m.type === "error") {
      this.onStatus("error");
      this._readyReject(new Error(m.error));
    } else if (m.type === "crash") {
      // The engine aborted (e.g. a WebAssembly trap). Same handling as a
      // timeout, but reported straight away with the real reason.
      this.onStatus("crash");
      if (this.pending) {
        clearTimeout(this.pending.timer);
        const p = this.pending;
        this.pending = null;
        const err = new Error("the judge crashed while running your code: " + m.error);
        err.timedOut = true;
        err.crashed = true;
        p.reject(err);
        if (this.onTimeout) this.onTimeout(err); else this.reload(this.reloadDelayMs);
      }
    } else if (m.type === "result" && this.pending && m.id === this.pending.id) {
      clearTimeout(this.pending.timer);
      const p = this.pending;
      this.pending = null;
      p.resolve({ result: m.result, errors: m.errors || [], ms: m.ms });
    }
  }
}

/** Godot reports line numbers counting our hidden "extends Judge" line. Fix that. */
export function tidyError(line) {
  return line.replace(/gdscript:\/\/[^:)]+\.gd:(\d+)/g, (_, n) => "line " + (Number(n) - 1))
             .replace(/^SCRIPT ERROR:\s*/, "");
}
