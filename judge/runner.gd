extends Node
## Compiles a code string the user typed, then runs its solve() against the
## tests in a problem. Returns a plain Dictionary so it can be turned into JSON.

func run_submission(user_code: String, problem: Dictionary) -> Dictionary:
	var tests: Array = problem.get("tests", [])
	var script := GDScript.new()
	# We prepend one line, so any line number Godot reports is off by +1
	# from what the user sees. The page must subtract 1 when displaying.
	script.source_code = "extends Judge\n" + instrument_loops(rewrite_print(user_code))
	var err := script.reload()
	if err != OK:
		return {"status": "compile_error", "error": error_string(err)}
	if not script.can_instantiate():
		return {"status": "compile_error", "error": "script cannot be instantiated"}
	var inst = script.new()
	if not inst.has_method("solve"):
		return {"status": "error", "error": "no solve() function"}
	# Some problems ask the user to write an extra helper function.
	for m in problem.get("require_methods", []):
		if not inst.has_method(m):
			return {"status": "error", "error": "missing function: %s()" % m}
	# Some problems ask the user to declare a named variable or constant.
	for n in problem.get("require_names", []):
		if not declares_name(user_code, n):
			return {"status": "error", "error": "expected a variable or constant named %s (var %s or const %s)" % [n, n, n]}
	# "Name the magic number" problems: the number may appear once (its declaration).
	for lit in problem.get("once_only", []):
		var uses := count_literal(user_code, str(lit))
		if uses > 1:
			return {"status": "error", "error": "the number %s appears %d times - declare it once and use the name everywhere else" % [lit, uses]}
	var results := []
	var passed := 0
	for t in tests:
		var args: Array = normalize(t.get("args", []))
		var expect = normalize(t.get("expect"))
		inst = script.new()   # a fresh instance per test, so member variables start over
		inst._judge_reset()
		# Frame harness: a test with "frames": N runs the user's _process(delta)
		# N times first, so game-loop problems can be checked through solve().
		if t.has("frames"):
			if not inst.has_method("_process"):
				return {"status": "error", "error": "missing function: _process(delta)"}
			var delta: float = float(t.get("delta", 1.0 / 60.0))
			for i in int(t["frames"]):
				inst.call("_process", delta)
		var got = inst.callv("solve", args)
		var out_lines: Array = inst._out.duplicate()  # copy: _out is cleared before the next test
		var ok := values_equal(got, expect)
		if t.has("out"):  # problem also checks what the user printed with out()
			ok = ok and values_equal(out_lines, normalize(t["out"]))
		var r := {"args": to_json_value(args), "expect": to_json_value(expect), "got": to_json_value(got), "out": out_lines, "pass": ok}
		if inst._judge_loop_exceeded:
			r["pass"] = false
			r["error"] = "a while loop ran more than %d times - probably an infinite loop" % Judge.LOOP_LIMIT
		if r["pass"]: passed += 1
		results.append(r)
	return {"status": "ok", "passed": passed, "total": tests.size(), "results": results}


## True if the code contains a real `var NAME` or `const NAME` declaration
## (comments do not count).
static func declares_name(code: String, name: String) -> bool:
	var re := RegEx.new()
	re.compile("(?m)^[ \\t]*(var|const)[ \\t]+" + name + "\\b")
	for line in code.split("\n"):
		var no_comment := line
		var hash := _header_colon_like(line, "#")
		if hash >= 0:
			no_comment = line.substr(0, hash)
		if re.search(no_comment) != null:
			return true
	return false


## How many times a number literal appears in the code, ignoring comments.
## "64" does not match "640" or "6.4"; "0.2" does not match "0.25".
static func count_literal(code: String, lit: String) -> int:
	var re := RegEx.new()
	re.compile("(?<![\\w.])" + lit.replace(".", "\\.") + "(?![\\w.])")
	var n := 0
	for line in code.split("\n"):
		var hash := _header_colon_like(line, "#")
		var text: String = line.substr(0, hash) if hash >= 0 else line
		n += re.search_all(text).size()
	return n


## Index of the first occurrence of `ch` outside quotes, or -1.
static func _header_colon_like(s: String, ch: String) -> int:
	var quote := ""
	var i := 0
	while i < s.length():
		var c := s[i]
		if quote != "":
			if c == "\\":
				i += 1
			elif c == quote:
				quote = ""
		elif c == "\"" or c == "'":
			quote = c
		elif c == ch:
			return i
		i += 1
	return -1


## Rewrites every print(...) call into out(...) so the output is captured.
## Whole word only: sprint(, my_print( and obj.print( are left alone, and
## so is anything inside a string or a comment. Line numbers are unchanged.
static func rewrite_print(code: String) -> String:
	var lines := code.split("\n")
	for i in lines.size():
		var s: String = lines[i]
		var result := ""
		var quote := ""
		var j := 0
		while j < s.length():
			var c := s[j]
			if quote != "":
				result += c
				if c == "\\" and j + 1 < s.length():
					j += 1
					result += s[j]
				elif c == quote:
					quote = ""
			elif c == "\"" or c == "'":
				quote = c
				result += c
			elif c == "#":
				result += s.substr(j)
				break
			elif s.substr(j, 6) == "print(" and not _is_word_char(prev_char(s, j)) and prev_char(s, j) != ".":
				result += "out("
				j += 5
			else:
				result += c
			j += 1
		lines[i] = result
	return "\n".join(lines)


static func prev_char(s: String, j: int) -> String:
	return s[j - 1] if j > 0 else " "


static func _is_word_char(c: String) -> bool:
	return c == "_" or (c >= "a" and c <= "z") or (c >= "A" and c <= "Z") or (c >= "0" and c <= "9")


## Rewrites every `while cond:` line as `while _judge_loop_ok() and (cond):`
## so the loop budget in Judge is checked on each iteration. Line numbers are
## unchanged. `for` loops are left alone: they always finish on their own.
static func instrument_loops(code: String) -> String:
	var lines := code.split("\n")
	for i in lines.size():
		var line: String = lines[i]
		var stripped := line.lstrip(" \t")
		if not stripped.begins_with("while ") and not stripped.begins_with("while\t"):
			continue
		var indent := line.substr(0, line.length() - stripped.length())
		var colon := _header_colon(stripped)
		if colon < 0:
			continue  # condition continues on the next line; leave it to the watchdog
		var cond := stripped.substr(6, colon - 6).strip_edges()
		var rest := stripped.substr(colon + 1)
		lines[i] = indent + "while _judge_loop_ok() and (" + cond + "):" + rest
	return "\n".join(lines)


## Index of the colon that ends a statement header: the first ":" that is
## outside quotes and brackets. -1 if there is none on this line.
static func _header_colon(s: String) -> int:
	var depth := 0
	var quote := ""
	var i := 0
	while i < s.length():
		var c := s[i]
		if quote != "":
			if c == "\\":
				i += 1
			elif c == quote:
				quote = ""
		elif c == "\"" or c == "'":
			quote = c
		elif c == "#":
			return -1
		elif c in "([{":
			depth += 1
		elif c in ")]}":
			depth -= 1
		elif c == ":" and depth == 0:
			return i
		i += 1
	return -1


## JSON has no int type: every number arrives as a float. Turn whole-number
## floats back into ints so [1, 2, 3] is what the user expects to receive.
## JSON has no vectors either, so problems write {"$v2": [x, y]} for a
## Vector2 and {"$rect": [x, y, w, h]} for a Rect2; those become real ones.
static func normalize(v: Variant) -> Variant:
	match typeof(v):
		TYPE_FLOAT:
			return int(v) if v == floor(v) and absf(v) < 9.0e15 else v
		TYPE_ARRAY:
			var a := []
			for x in v:
				a.append(normalize(x))
			return a
		TYPE_DICTIONARY:
			if v.size() == 1 and v.has("$v2") and v["$v2"] is Array and v["$v2"].size() == 2:
				return Vector2(v["$v2"][0], v["$v2"][1])
			if v.size() == 1 and v.has("$rect") and v["$rect"] is Array and v["$rect"].size() == 4:
				var r: Array = v["$rect"]
				return Rect2(r[0], r[1], r[2], r[3])
			var d := {}
			for k in v:
				d[k] = normalize(v[k])
			return d
	return v


## The reverse of normalize, for sending results back as JSON: vectors and
## rects become the {"$v2": ...} / {"$rect": ...} form so the page can show
## them nicely instead of Godot's default "(1, 2)" text.
static func to_json_value(v: Variant) -> Variant:
	match typeof(v):
		TYPE_VECTOR2, TYPE_VECTOR2I:
			return {"$v2": [v.x, v.y]}
		TYPE_RECT2, TYPE_RECT2I:
			return {"$rect": [v.position.x, v.position.y, v.size.x, v.size.y]}
		TYPE_ARRAY:
			var a := []
			for x in v:
				a.append(to_json_value(x))
			return a
		TYPE_DICTIONARY:
			var d := {}
			for k in v:
				d[k] = to_json_value(v[k])
			return d
	return v


## Lenient where it should be (2 == 2.0, tiny float error, typed vs untyped
## arrays) and strict where it matters (true != 1, "2" != 2).
static func values_equal(a: Variant, b: Variant) -> bool:
	var ta := typeof(a)
	var tb := typeof(b)
	if ta == TYPE_BOOL or tb == TYPE_BOOL:
		return ta == tb and a == b
	if (ta == TYPE_INT or ta == TYPE_FLOAT) and (tb == TYPE_INT or tb == TYPE_FLOAT):
		if ta == TYPE_INT and tb == TYPE_INT:
			return a == b
		return absf(float(a) - float(b)) <= 1e-6 * maxf(1.0, maxf(absf(a), absf(b)))
	if (ta == TYPE_VECTOR2 or ta == TYPE_VECTOR2I) and (tb == TYPE_VECTOR2 or tb == TYPE_VECTOR2I):
		var va := Vector2(a)
		var vb := Vector2(b)
		return values_equal(va.x, vb.x) and values_equal(va.y, vb.y)
	if (ta == TYPE_RECT2 or ta == TYPE_RECT2I) and (tb == TYPE_RECT2 or tb == TYPE_RECT2I):
		var ra := Rect2(a)
		var rb := Rect2(b)
		return values_equal(ra.position, rb.position) and values_equal(ra.size, rb.size)
	if _is_arrayish(a) and _is_arrayish(b):
		var aa := Array(a)
		var bb := Array(b)
		if aa.size() != bb.size():
			return false
		for i in aa.size():
			if not values_equal(aa[i], bb[i]):
				return false
		return true
	if ta == TYPE_DICTIONARY and tb == TYPE_DICTIONARY:
		if a.size() != b.size():
			return false
		for k in b:
			if not a.has(k) or not values_equal(a[k], b[k]):
				return false
		return true
	if ta == TYPE_STRING or ta == TYPE_STRING_NAME:
		return (tb == TYPE_STRING or tb == TYPE_STRING_NAME) and str(a) == str(b)
	return ta == tb and a == b


static func _is_arrayish(v: Variant) -> bool:
	var t := typeof(v)
	return t >= TYPE_ARRAY and t < TYPE_MAX  # Array and all Packed*Array types
