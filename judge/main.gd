extends Control
## Entry point.
## Web:     exposes window.gdjudge(code, problemJson) for the page to call.
## Desktop: `godot --headless --path judge` runs a quick self-test;
##          `godot --headless --path judge -- --problems` validates every
##          problem file (solution passes, starter compiles but does not pass).

var runner := preload("res://runner.gd").new()
var _js_cb: JavaScriptObject  # must stay referenced or the callback is freed

func _ready() -> void:
	add_child(runner)
	print("JUDGE_READY")
	if OS.has_feature("web"):
		_js_cb = JavaScriptBridge.create_callback(_js_run)
		JavaScriptBridge.get_interface("window").gdjudge = _js_cb
		JavaScriptBridge.eval("window.gdjudge_ready = true;")
		return
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--problems"):
			var dir := a.trim_prefix("--problems").trim_prefix("=")
			if dir.is_empty():
				dir = ProjectSettings.globalize_path("res://").path_join("../problems")
			get_tree().quit(_validate_problems(dir))
			return
	_selftest()
	get_tree().quit()


func _js_run(args: Array) -> Variant:
	var code: String = args[0]
	var problem = JSON.parse_string(args[1]) if args.size() > 1 else null
	var r: Dictionary
	if problem is Dictionary:
		r = runner.run_submission(code, problem)
	else:
		r = {"status": "error", "error": "problem JSON could not be parsed"}
	JavaScriptBridge.get_interface("window").gdjudge_result = JSON.stringify(r)
	return null


## Runs the three classic cases through the same JSON path the web page uses.
func _selftest() -> void:
	var problem_json := JSON.stringify({"tests": [
		{"args": [[1, 2, 3]], "expect": 6},
		{"args": [[]], "expect": 0},
		{"args": [[-5, 5, 10]], "expect": 10},
	]})
	var good := "func solve(nums: Array) -> int:\n\tvar s := 0\n\tfor n in nums:\n\t\ts += n\n\tout(\"sum was %d\" % s)\n\treturn s\n"
	var wrong := "func solve(nums: Array) -> int:\n\treturn 42\n"
	var broken := "func solve(nums: Array) -> int:\n\treturn nums +\n"
	var infinite := "func solve(nums: Array) -> int:\n\tvar i := 0\n\twhile true:\n\t\ti += 1\n\treturn i\n"
	var oneliner := "func solve(nums: Array) -> int:\n\twhile true: pass\n\treturn 0\n"
	# Syntax error inside a while condition: does Godot report the rewritten line?
	var badwhile := "func solve(nums: Array) -> int:\n\tvar i := 0\n\twhile i <:\n\t\ti += 1\n\treturn i\n"
	var recursion := "func solve(nums: Array) -> int:\n\treturn solve(nums)\n"
	for pair in [["good", good], ["wrong", wrong], ["broken", broken], ["infinite", infinite], ["oneliner", oneliner], ["badwhile", badwhile], ["recursion", recursion]]:
		var t0 := Time.get_ticks_msec()
		var r := runner.run_submission(pair[1], JSON.parse_string(problem_json))
		print("CASE ", pair[0], " (", Time.get_ticks_msec() - t0, " ms): ", JSON.stringify(r))
	# "Name the magic number" rules: declaration required, literal at most once.
	var naming := {"require_names": ["SPEED"], "once_only": [250], "tests": [{"args": [2], "expect": 500}]}
	var unused_const := "func solve(seconds: float) -> float:\n\tconst SPEED = 250\n\treturn 250 * seconds\n"
	var comment_only := "func solve(seconds: float) -> float:\n\t# const SPEED = 250\n\treturn 250 * seconds\n"
	var named_ok := "func solve(seconds: float) -> float:\n\tconst SPEED = 250  # 250 in a comment is fine\n\treturn SPEED * seconds\n"
	for pair in [["unused_const", unused_const], ["comment_only", comment_only], ["named_ok", named_ok]]:
		print("CASE ", pair[0], ": ", JSON.stringify(runner.run_submission(pair[1], naming)))
	# print() is rewritten to out(): whole word only, not inside strings/comments.
	var printing := {"tests": [{"args": [3], "expect": 3, "out": ["a1", "3", "x", "print(z)"]}]}
	var uses_print := "func solve(n: int) -> int:\n\tprint(\"a\", 1)\n\tprint(n)  # print(hidden)\n\tmy_print()\n\tprint(\"print(z)\")\n\treturn n\n\nfunc my_print() -> void:\n\tout(\"x\")\n"
	print("CASE print_rewrite: ", JSON.stringify(runner.run_submission(uses_print, printing)))
	# Vector2 / Rect2 travel as {"$v2": [x, y]} and {"$rect": [x, y, w, h]}.
	var vec_problem: Dictionary = JSON.parse_string(JSON.stringify({"tests": [
		{"args": [{"$v2": [3, 4]}], "expect": {"$v2": [6, 8]}},
		{"args": [{"$v2": [1, 1]}], "expect": {"$v2": [2, 2]}},
	]}))
	var vec_code := "func solve(v: Vector2) -> Vector2:\n\treturn v * 2\n"
	var vec_i_code := "func solve(v: Vector2) -> Vector2i:\n\treturn Vector2i(v * 2)\n"
	var rect_problem: Dictionary = JSON.parse_string(JSON.stringify({"tests": [{"args": [2, 3], "expect": {"$rect": [0, 0, 2, 3]}}]}))
	var rect_code := "func solve(w: int, h: int) -> Rect2:\n\treturn Rect2(0, 0, w, h)\n"
	# Beginner style must compile: untyped parameter, no return type, := on a Variant.
	var beginner := "func solve(items: Array):\n\tvar first := items.front()\n\tvar total = first + 1\n\treturn total\n"
	var beginner_problem := {"tests": [{"args": [[4, 5]], "expect": 5}]}
	print("CASE beginner_style: ", JSON.stringify(runner.run_submission(beginner, beginner_problem)))
	var hard := "func solve(items):
	var first := items[0]
	return first + 1
"
	print("CASE beginner_hard_error: ", JSON.stringify(runner.run_submission(hard, beginner_problem)))
	print("CASE vector: ", JSON.stringify(runner.run_submission(vec_code, vec_problem)))
	print("CASE vector_i: ", JSON.stringify(runner.run_submission(vec_i_code, vec_problem)))
	print("CASE rect: ", JSON.stringify(runner.run_submission(rect_code, rect_problem)))


## Returns 0 if every problem file is valid, 1 otherwise.
func _validate_problems(dir_path: String) -> int:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		printerr("cannot open problems dir: ", dir_path)
		return 1
	var files := Array(dir.get_files())
	files.sort()
	var failures := 0
	var count := 0
	for f in files:
		if not f.ends_with(".json") or f == "index.json":
			continue
		count += 1
		var problems := _check_problem(dir_path.path_join(f), f.trim_suffix(".json"))
		if problems.is_empty():
			print("OK   ", f)
		else:
			failures += 1
			print("FAIL ", f)
			for p in problems:
				print("       - ", p)
	print("%d problems checked, %d failed" % [count, failures])
	return 1 if failures > 0 else 0


func _check_problem(path: String, expected_id: String) -> Array[String]:
	var errs: Array[String] = []
	var text := FileAccess.get_file_as_string(path)
	var p = JSON.parse_string(text)
	if not p is Dictionary:
		return ["file is not valid JSON"]
	for field in ["id", "title", "concept", "difficulty", "prompt", "signature", "starter", "tests", "hint", "solution"]:
		if not p.has(field):
			errs.append("missing field: " + field)
	if not errs.is_empty():
		return errs
	if p["id"] != expected_id:
		errs.append("id %s does not match file name" % p["id"])
	if not (p["difficulty"] is float) or p["difficulty"] < 0 or p["difficulty"] > 3:
		errs.append("difficulty must be 0-3")
	if not (p["tests"] is Array) or p["tests"].is_empty():
		errs.append("tests must be a non-empty array")
		return errs
	for t in p["tests"]:
		if not (t is Dictionary) or not t.has("args") or not (t["args"] is Array) or not t.has("expect"):
			errs.append("each test needs \"args\" (array) and \"expect\"")
			return errs
	if not str(p["starter"]).begins_with(p["signature"]):
		errs.append("starter should begin with the signature")
	var sol := runner.run_submission(p["solution"], p)
	if sol["status"] != "ok":
		errs.append("solution did not run: " + str(sol.get("error")))
	elif sol["passed"] != sol["total"]:
		errs.append("solution passed only %d/%d tests" % [sol["passed"], sol["total"]])
		for r in sol["results"]:
			if not r["pass"]:
				errs.append("  args=%s expect=%s got=%s" % [JSON.stringify(r["args"]), JSON.stringify(r["expect"]), JSON.stringify(r["got"])])
	var st := runner.run_submission(p["starter"], p)
	if st["status"] == "compile_error":
		errs.append("starter does not compile: " + str(st.get("error")))
	elif st["status"] == "ok" and st["passed"] == st["total"]:
		errs.append("starter already passes every test")
	return errs
