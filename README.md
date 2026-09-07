# GDScript Practice

Daily GDScript practice that follows the GDQuest course "Learn GDScript From Zero" lesson by lesson. Your code runs in the browser and is checked by Godot itself, at https://txmmytwostraps.github.io/gdscript-practice/site/ with nothing to install.

## How a day works

- Reviews: the problems and concept cards due today.
- New problems: a few from the topic you are on, five by default.
- One more: a milestone step when one is unlocked, otherwise an extra problem.
- The streak counts days in a row with at least one solve or review; full runs are counted separately.

## The pages

- [Today](https://txmmytwostraps.github.io/gdscript-practice/site/): the day's run, your character, the route nearby.
- [Route](https://txmmytwostraps.github.io/gdscript-practice/site/route.html): every topic in lesson order, milestones, settings.
- [Practice](https://txmmytwostraps.github.io/gdscript-practice/site/practice.html): the problem page: prompt, tests, editor, results.
- [Concepts](https://txmmytwostraps.github.io/gdscript-practice/site/concepts.html): one card per concept, flashcards, card reviews.
- [Stats](https://txmmytwostraps.github.io/gdscript-practice/site/stats.html): solves, streak, misses, badges, activity grid.
- [This week](https://txmmytwostraps.github.io/gdscript-practice/site/week.html): the last seven days as text to copy.
- [Notes](https://txmmytwostraps.github.io/gdscript-practice/site/notes.html): everything written in a problem's notes box.
- [Gallery](https://txmmytwostraps.github.io/gdscript-practice/site/gallery.html): finished milestones, running.
- Profile: the account area in the header; sign in, sign out.

<!-- about-more -->

## The problem page

Every problem asks for a function called `solve`. That function is only how this site hands your code its inputs and reads back the answer; Godot itself never looks for one. The line under the prompt explains what solve receives and what it must give back, and the tests list shows each call the judge makes with the answer it expects.

Hints come in two to four stages and open one at a time. How many are available depends on the topic's hint level. At the full level every hint opens on request. At the reduced level only the first hint opens until you have missed the problem once. At the minimal level hints stay closed until two misses. The level moves on its own with your pass rate over the last twenty attempts in the topic, and can be set by hand on the Route.

The reference solution is locked until you solve the problem or miss it twice, three times at the minimal level. Opening a hint never counts as a miss.

Each problem has a notes box for what you did not get or what you missed; notes save as you type and gather on the Notes page. "Ask Claude" copies a prepared prompt to the clipboard, with the problem, your code, the failing tests and your note, asking for a nudge rather than the answer, to paste into a chat.

Under the editor you can try the same problem in other forms: put the lines of the solution in order, or find and fix one planted bug. A topic drill serves problems with fresh numbers for as long as you like; a drill pass counts as practice, not as a solve. "Request more" on the Route copies a brief for writing more problems in this topic.

## The review schedule

When you solve the first problem of a topic, its concept cards enter the queue, due from the next day, at most four cards a day. When you clear a topic, its problems enter the queue: two a day for a week, then each one comes back after 3, 7, 14 and 30 days, and then at growing intervals up to 90 days. A miss pulls a problem back to daily until it is solved cleanly twice. Later reviews of a problem may come as the ordering or the fix-the-bug form so they are not a straight repeat. At most six problem reviews are served a day; the rest roll to tomorrow.

## Milestones

A milestone is a small script built in four steps beside a live stage. Each step adds to the same script, has visible checks, and the stage runs whatever you have written so far, with buttons that call your own functions. Milestones unlock on the Route once every topic before them is cleared. Finishing one adds it to the Gallery, awards a badge, and offers a guided version: a checklist for building the same thing in a real Godot project on your machine.

## The Delta app

Delta is a companion app for the phone for the parts that work well away from the keyboard: cards and light reviews. Get it here: [Delta for Android](#the-delta-app) (placeholder until release; the real link replaces it then).

## Settings

The course lock, the daily set size and the hint levels are on the Route. Signed in, they are kept in your account and every machine shows the same; signed out, they stay in the browser.

## How it works

The judge is the Godot engine exported to the web and loaded inside the page. Your code is compiled and run by that engine in your browser, in a sandbox, with a limit on runaway loops. Nothing you write is sent to a server; only your progress, reviews, notes and settings go to your account when you are signed in.

<!-- about-end -->

## Running it locally

Requirements: Node.js, and Godot 4.7.2 with the web export templates installed.

```
godot --headless --path judge -- --problems        # check every problem and milestone step
godot --headless --path judge --export-debug WebNoThreads   # export the judge to web/
node tools/serve.js                                # serve the folder on http://localhost:8060
```

Then open http://localhost:8060/site/ in Chrome.

## Repository layout

- `judge/` is the Godot project that compiles submitted code at runtime, runs it against a problem's tests, and reports the results.
- `problems/` holds one JSON file per problem; `index.json` is generated by `tools/build-index.js`, which also checks the house style.
- `milestones/` holds one JSON file per milestone, `cards/` the concept cards.
- `site/` is the page: static HTML, CSS and JavaScript, no build step.
- `supabase/` holds the SQL for the tables behind sign-in.
- The GitHub Actions workflow validates every problem with the headless judge, exports the judge, and publishes the site on each push.

## Adding a problem

One JSON file per problem in `problems/`, named after its `id`. Fields:

- `id`, `title`, `concept` (a topic id from `tools/build-index.js`), `difficulty` (0 novice, 1 beginner).
- `prompt`: what to do, in plain words; backticks around code words.
- `signature`: the first line of the function the tests call, for example `func solve(hp):`.
- `starter`: the code the editor opens with. `starter_broken: true` marks a fix-the-error starter that must not compile.
- `tests`: a list of `{ "name", "args", "expect" }`; `out` lists the lines the code must print, `frames` runs `_process(delta)` that many times first, and `script` performs calls before `read` reads a member variable.
- `hints`: two to four strings that nudge without giving the answer. `docs`: the built-ins used, as `{ "name", "what" }`.
- `solution`: a reference solution that passes every test.
- Optional: `require_methods`, `require_names`, `once_only` (a number that may appear only once), `generator` (ranges per argument for fresh variants; `variants: false` opts out).

Run `node tools/build-index.js` to rebuild the index and check the house style, then the validator above. It refuses a problem whose solution fails a test, whose starter already passes, or whose generator rolls arguments the solution cannot handle.
