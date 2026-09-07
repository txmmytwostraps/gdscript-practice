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
        // Tab indents (the selected lines, or inserts one tab); Shift-Tab removes one level.
        Tab: (cm) => { if (cm.somethingSelected() && cm.getCursor("from").line !== cm.getCursor("to").line) cm.execCommand("indentMore"); else cm.replaceSelection("\t"); },
        "Shift-Tab": (cm) => cm.execCommand("indentLess"),
        Enter: (cm) => {
          // Keep the current line's indentation; one more tab after a line ending in ':'.
          const cur = cm.getCursor();
          const line = cm.getLine(cur.line).slice(0, cur.ch);
          const indent = (/^\t*/.exec(line) || [""])[0];
          const extra = /:\s*(#.*)?$/.test(line) ? "\t" : "";
          cm.replaceSelection("\n" + indent + extra);
        },
        Backspace: (cm) => {
          // At the start of an indented line, remove one tab; otherwise the usual backspace.
          const cur = cm.getCursor();
          const before = cm.getLine(cur.line).slice(0, cur.ch);
          if (!cm.somethingSelected() && before.length && /^\t+$/.test(before)) cm.replaceRange("", { line: cur.line, ch: cur.ch - 1 }, cur);
          else cm.execCommand("delCharBefore");
        },
        "Ctrl-Enter": () => onRun(), "Cmd-Enter": () => onRun(),
      },
    });
    let marked = null;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => cm.refresh());   // re-measure once the web font is in
    // Loading code: when it ends with an empty line under a ':' header, that
    // line gets its indentation and the cursor, so typing starts in the body.
    const set = (t) => {
      cm.setValue(t);
      const last = cm.lastLine();
      if (last > 0 && cm.getLine(last) === "") {
        const prev = cm.getLine(last - 1);
        const indent = (/^\t*/.exec(prev) || [""])[0] + (/:\s*(#.*)?$/.test(prev) ? "\t" : "");
        if (indent) { cm.replaceRange(indent, { line: last, ch: 0 }); }
        cm.setCursor({ line: last, ch: indent.length });
      }
      cm.clearHistory(); cm.refresh();
    };
    return { get: () => cm.getValue(), set, onChange: (fn) => cm.on("change", fn), focus: () => cm.focus(),
      markError: (n) => { if (marked !== null) cm.removeLineClass(marked, "background", "cm-error-line"); marked = n; if (n !== null) cm.addLineClass(n, "background", "cm-error-line"); } };
  }
  ta.addEventListener("keydown", (ev) => {
    if (ev.key === "Tab") { ev.preventDefault(); const s = ta.selectionStart, e = ta.selectionEnd; ta.value = ta.value.slice(0, s) + "\t" + ta.value.slice(e); ta.selectionStart = ta.selectionEnd = s + 1; ta.dispatchEvent(new Event("input")); }
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); onRun(); }
  });
  return { get: () => ta.value, set: (t) => { ta.value = t; }, onChange: (fn) => ta.addEventListener("input", fn), focus: () => ta.focus(), markError: () => {} };
}
