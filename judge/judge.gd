class_name Judge
extends RefCounted
## Base class every user submission secretly extends.
## It gives the submission an out() function so we can capture anything
## the user "prints" and show it in the results panel later, a loop budget so
## a runaway `while` ends instead of freezing the browser, and a few recorder
## functions that stand in for Godot's own (show, rotate, the turtle): each
## call is recorded as an output line, so tests can check the calls made.
## The runner rewrites the user's print(...) calls into out(...).

const LOOP_LIMIT := 250_000
const _NONE := "__no_argument__"  # marks an argument that was not passed

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


## Recorders for the course's early lessons. They only note the call.
func show() -> void:
	_out.append("show")

func hide() -> void:
	_out.append("hide")

func rotate(degrees) -> void:
	_out.append("rotate " + _num(degrees))

func move(x, y) -> void:
	_out.append("move " + _num(x) + " " + _num(y))

func move_forward(distance) -> void:
	_out.append("forward " + _num(distance))

func turn_left(degrees = 90) -> void:
	_out.append("left" if _num(degrees) == "90" else "left " + _num(degrees))

func turn_right(degrees = 90) -> void:
	_out.append("right" if _num(degrees) == "90" else "right " + _num(degrees))

func jump(distance) -> void:
	_out.append("jump " + _num(distance))


## Whole-number floats print without ".0" so "forward 30" reads naturally.
static func _num(v) -> String:
	if typeof(v) == TYPE_FLOAT and v == floor(v):
		return str(int(v))
	return str(v)


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
