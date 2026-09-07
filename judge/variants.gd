extends RefCounted

## Rolls fresh arguments from a problem's `generator`, the same way the
## site does (site/variants.js), so the validator can check that the
## reference solution runs on anything the generator can produce.
## Spec per argument: {"int": [lo, hi]}  {"float": [lo, hi, decimals]}
## {"bool": true}  {"pick": [...]}  {"array": {"len": [lo, hi], "of": spec}}
## {"v2": [[xlo, xhi], [ylo, yhi], decimals]}  {"rect": [[..], [..], [..], [..]]}


static func roll_args(generator: Array, rng: RandomNumberGenerator) -> Array:
	var args := []
	for spec in generator:
		args.append(roll(spec, rng))
	return args


static func roll(spec: Dictionary, rng: RandomNumberGenerator) -> Variant:
	if spec.has("int"):
		return rng.randi_range(int(spec["int"][0]), int(spec["int"][1]))
	if spec.has("float"):
		var d := int(spec["float"][2]) if spec["float"].size() > 2 else 1
		return snappedf(rng.randf_range(float(spec["float"][0]), float(spec["float"][1])), pow(10.0, -d))
	if spec.has("bool"):
		return rng.randf() < 0.5
	if spec.has("pick"):
		var options: Array = spec["pick"]
		return options[rng.randi_range(0, options.size() - 1)]
	if spec.has("array"):
		var a := []
		var n := rng.randi_range(int(spec["array"]["len"][0]), int(spec["array"]["len"][1]))
		for i in n:
			a.append(roll(spec["array"]["of"], rng))
		return a
	if spec.has("v2"):
		var d := int(spec["v2"][2]) if spec["v2"].size() > 2 else 0
		var step := pow(10.0, -d)
		return {"$v2": [snappedf(rng.randf_range(float(spec["v2"][0][0]), float(spec["v2"][0][1])), step), snappedf(rng.randf_range(float(spec["v2"][1][0]), float(spec["v2"][1][1])), step)]}
	if spec.has("rect"):
		var r := []
		for pair in spec["rect"]:
			r.append(rng.randi_range(int(pair[0]), int(pair[1])))
		return {"$rect": r}
	return null
