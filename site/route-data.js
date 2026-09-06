// The route: every topic in the order of GDQuest's "Learn GDScript From Zero",
// using the lesson numbers the course app shows. A lesson may have more than
// one sequence of problems; extras are marked so the main one comes first.
// Milestones sit between topics and unlock after the topic named in `after`.

export const TOPICS = [
  { concept: "gq-functions",  lesson: 5,  title: "Functions",                       course: "Your first function" },
  { concept: "gq-parameters", lesson: 6,  title: "Parameters",                      course: "Multiple function parameters" },
  { concept: "gq-variables",  lesson: 8,  title: "Introduction to variables",       course: "Defining variables" },
  { concept: "variables",     lesson: 8,  title: "Variables, extra practice",       course: "Defining variables", extra: true },
  { concept: "arithmetic",    lesson: 9,  title: "Adding and subtracting",          course: "Adding and subtracting" },
  { concept: "gq-delta",      lesson: 11, title: "Delta",                           course: "Time delta" },
  { concept: "gq-readable",   lesson: 12, title: "Variables for readable code",     course: "Using variables" },
  { concept: "gq-conditions", lesson: 13, title: "Conditions",                      course: "Conditions" },
  { concept: "ifelse",        lesson: 13, title: "If and else, extra practice",     course: "Conditions", extra: true },
  { concept: "comparisons",   lesson: 13, title: "Comparisons, extra practice",     course: "Conditions", extra: true },
  { concept: "gq-vectors",    lesson: 15, title: "2D vectors",                      course: "2D vectors" },
  { concept: "gq-rect",       lesson: 15, title: "Rectangles",                      course: "2D vectors", extra: true, note: "Rect2 is built from two Vector2 values" },
  { concept: "while",         lesson: 16, title: "While loops",                     course: "Introduction to while loops" },
  { concept: "for",           lesson: 17, title: "For loops",                       course: "Introduction to for loops" },
  { concept: "gq-arrays",     lesson: 18, title: "Arrays",                          course: "Creating arrays" },
  { concept: "arrays",        lesson: 18, title: "Arrays, extra practice",          course: "Creating arrays", extra: true },
  { concept: "gq-strings",    lesson: 20, title: "Strings",                         course: "Strings" },
  { concept: "strings",       lesson: 20, title: "Strings, extra practice",         course: "Strings", extra: true },
  { concept: "gq-return",     lesson: 21, title: "Functions that return a value",   course: "Functions that return a value" },
  { concept: "functions",     lesson: 21, title: "Return values, extra practice",   course: "Functions that return a value", extra: true },
  { concept: "dictionaries",  lesson: 24, title: "Dictionaries",                    course: "Creating dictionaries" },
];

export const MILESTONES = [
  { id: "m1", number: 1, title: "Make the character move", after: "gq-delta",
    uses: "Uses functions, parameters, variables and delta. 4 steps in the browser, then the same build in Godot on your machine.", steps: 4 },
  { id: "m2", number: 2, title: "A character with health", after: "gq-conditions",
    uses: "Uses variables, functions and conditions.", steps: 4, planned: true },
];

// The full lesson list of the course, as numbered in the app. Topics not in
// TOPICS yet show on the route as "no problems yet".
export const LESSONS = [
  [1, "What Code is Like"], [2, "Your First Error"], [3, "We Stand on the Shoulders of Giants"], [4, "Drawing a Rectangle"],
  [5, "Coding Your First Function"], [6, "Your First Function Parameter"], [7, "Introduction to Member Variables"], [8, "Defining Your Own Variables"],
  [9, "Adding and Subtracting"], [10, "The Game Loop"], [11, "Time Delta"], [12, "Using Variables to Make Code Easier to Read"], [13, "Conditions"],
  [14, "Multiplying"], [15, "2D Vectors"], [16, "Introduction to While Loops"], [17, "Introduction to For Loops"],
  [18, "Creating arrays"], [19, "Looping over arrays"], [20, "Strings"], [21, "Functions that return a value"],
  [22, "Appending and popping values from arrays"], [23, "Accessing values in arrays"], [24, "Creating Dictionaries"],
  [25, "Looping over dictionaries"], [26, "Value types"], [27, "Specifying types with type hints"],
];

export const DEFAULT_COURSE_LOCK = 20;   // "finished through lesson N"
export const NEW_PER_DAY = 5;
