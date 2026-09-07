// The house style for problems, as a prompt for writing more of them. The
// "Request more problems" button on the Route copies this, filled in for
// one topic, to the clipboard.
export const CONTENT_RULES = `- Follow the GDQuest course "Learn GDScript From Zero" in lesson order: a problem may only use concepts from its own lesson or earlier ones.
- One recurring character: a robot with health, level and max_health. Prompts give a goal with a little context, not a bare instruction.
- A beginner (difficulty 1) prompt states the goal in game terms and the values only, never a line of code in English (no "create a variable", "set it to", "return it"); which variables and which operation go in hint 1.
- Every test has a plain-English name saying what is verified (e.g. "Exactly 20 leaves 0", "The message is printed").
- A problem with no inputs is a function called run(), as in the course; a problem with inputs is a function named after what it does (double, take_hit, is_even), and the goal says so.
- No type hints anywhere (no "x: int", no ":=", no "-> int"), except that the tested function may keep its return type where it matters.
- Starters extend existing code where that fits; a fix-the-error starter must not compile, a fix-the-bug starter runs but gives wrong answers.
- 2 to 4 staged hints that nudge without giving the answer; the last hint may name the exact line to write.
- A "docs" list of the built-ins the problem uses, each with a one-line "what".
- Backticks around code words; write "the number \`20\`" when a literal is meant.
- Print-style problems check printed lines; return-style problems check the returned value; problems that name a variable use "require_names" and "once_only" strictly.
- Ids are <prefix>-<nnn>, one JSON file per problem, with fields: id, title, concept, difficulty (0 novice, 1 beginner), prompt, signature, fn (the function the tests call), starter, tests[{name,args,expect,out?}], hints[], docs[], solution.`;

export function requestPrompt({ title, concept, lesson, titles, batch = 10 }) {
  return [
    `Write ${batch} new practice problems for the topic "${title}" (concept id "${concept}", course lesson ${lesson}) in this repository's house style. Put each in problems/<id>.json, run node tools/build-index.js and the judge validator, and show me the list by id and title before committing.`,
    "",
    "House style:",
    CONTENT_RULES,
    "",
    `Existing titles in this topic, do not repeat them:`,
    ...titles.map((t) => `- ${t}`),
  ].join("\n");
}
