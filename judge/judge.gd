class_name Judge
extends RefCounted
## Base class every user submission secretly extends.
## It gives the submission an out() function so we can capture anything
## the user "prints" and show it in the results panel later, and a loop
## budget so a runaway `while` ends instead of freezing the browser.
## The runner rewrites the user's print(...) calls into out(...).

const LOOP_LIMIT := 250_000
const _NONE := "__no_argument__"  # marks an argument that was not passed

var _out: Array[String] = []
var _judge_loop_ticks := 0
var _judge_loop_exceeded := false


## Behaves like Godot's print(): joins every argument with no separator.
## GDScript has no variable-length parameters for user functions, so we
## accept up to eight and ignore the ones that were not passed.
func out(a = _NONE, b = _NONE, c = _NONE, d = _NONE, e = _NONE, f = _NONE, g = _NONE, h = _NONE) -> void:
	var line := ""
	for v in [a, b, c, d, e, f, g, h]:
		if typeof(v) == TYPE_STRING and v == _NONE:
			break
		line += str(v)
	_out.append(line)


## The runner rewrites `while cond:` as `while _judge_loop_ok() and (cond):`
## so this runs once per iteration of every while loop.
func _judge_loop_ok() -> bool:
	_judge_loop_ticks += 1
	if _judge_loop_ticks > LOOP_LIMIT:
		_judge_loop_exceeded = true
		return false
	return true


func _judge_reset() -> void:
	_out.clear()
	_judge_loop_ticks = 0
	_judge_loop_exceeded = false
