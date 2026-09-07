// The code editor: CodeMirror with a small GDScript mode and Godot-like
// editing (tabs, auto-closed brackets, indent after a colon); a plain
// textarea when CodeMirror did not load.
export function makeEditor(ta, { onRun = () => {} } = {}) {
  if (window.CodeMirror && CodeMirror.defineSimpleMode) {
    if (!CodeMirror.modes.gdscript) CodeMirror.defineSimpleMode("gdscript", { start: [
      { regex: /"(?:[^\\]|\\.)*?(?:"|$)/, token: "string" }, { regex: /'(?:[^\\]|\\.)*?(?:'|$)/, token: "string" }, { regex: /#.*/, token: "comment" },
      { regex: /\b(?:func|var|const|if|elif|else|while|for|in|return|pass|break|continue|and|or|not|extends|class_name|match|is|as|self|static|enum|signal|await)\b/, token: "keyword" },
      { regex: /\b(?:true|false|null|PI|TAU|INF)\b/, token: "atom" },
      { regex: /\b(?:int|float|String|bool|Array|Dictionary|Vector2|Vector2i|Rect2|Rect2i|Variant|void)\b/, token: "type" },
      { regex: /\b\d+(?:\.\d+)?\b/, token: "number" }, { regex: /[A-Za-z_]\w*(?=\()/, token: "def" }, { regex: /[-+\/*=<>!%:]+/, token: "operator" },
    ] });
    const cm = CodeMirror.fromTextArea(ta, {
      mode: "gdscript", theme: "godot", lineNumbers: true, indentWithTabs: true, indentUnit: 4, tabSize: 4, viewportMargin: Infinity,
      // Like Godot's script editor: typing ( [ { " ' inserts the closing one
      // and puts the cursor between; typing the closer skips over it;
      // backspace on an empty pair removes both.
      autoCloseBrackets: { pairs: "()[]{}''\"\"", closeBefore: ")]}'\":;,", triples: "", explode: "()[]{}" },
      extraKeys: {
        Tab: (cm) => cm.replaceSelection("\t"), "Shift-Tab": (cm) => cm.indentSelection("subtract"),
        Enter: (cm) => {
          // Keep the indentation of the current line, or of the nearest
          // non-blank line above when this one is blank; add a level after ':'.
          const cur = cm.getCursor();
          let n = cur.line;
          let line = cm.getLine(n).slice(0, cur.ch);
          while (line.trim() === "" && n > 0) { n -= 1; line = cm.getLine(n); }
          const indent = (/^\t*/.exec(line) || [""])[0];
          const extra = /:\s*(#.*)?$/.test(line) && n === cur.line ? "\t" : "";
          cm.replaceSelection("\n" + indent + extra);
        },
        "Ctrl-Enter": () => onRun(), "Cmd-Enter": () => onRun(),
      },
    });
    let marked = null;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => cm.refresh());   // re-measure once the web font is in
    return { get: () => cm.getValue(), set: (t) => { cm.setValue(t); cm.clearHistory(); cm.refresh(); }, onChange: (fn) => cm.on("change", fn), focus: () => cm.focus(),
      markError: (n) => { if (marked !== null) cm.removeLineClass(marked, "background", "cm-error-line"); marked = n; if (n !== null) cm.addLineClass(n, "background", "cm-error-line"); } };
  }
  ta.addEventListener("keydown", (ev) => {
    if (ev.key === "Tab") { ev.preventDefault(); const s = ta.selectionStart, e = ta.selectionEnd; ta.value = ta.value.slice(0, s) + "\t" + ta.value.slice(e); ta.selectionStart = ta.selectionEnd = s + 1; ta.dispatchEvent(new Event("input")); }
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); onRun(); }
  });
  return { get: () => ta.value, set: (t) => { ta.value = t; }, onChange: (fn) => ta.addEventListener("input", fn), focus: () => ta.focus(), markError: () => {} };
}
