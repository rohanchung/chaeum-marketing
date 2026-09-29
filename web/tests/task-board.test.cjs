const fs = require("node:fs");
const ts = require("typescript");
const assert = require("node:assert/strict");
const { test } = require("node:test");

require.extensions[".ts"] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    file,
  );

const { matchesSource, todayBoard } = require("../src/lib/task-board.ts");

const today = "2026-09-29";
const at = (date) => `${date}T12:00:00+09:00`;
const due = (date) => `${date}T23:59:00+09:00`;
const task = (id, overrides = {}) => ({
  id,
  title: id,
  deleted_at: null,
  status: "planned",
  source_type: "self",
  sort_order: 0,
  start_at: at(today),
  due_at: due(today),
  ...overrides,
});
const ids = (tasks) => tasks.map((item) => item.id);

test("each task lands in exactly one today-board section", () => {
  const board = todayBoard([
    task("late", { start_at: at("2026-09-25"), due_at: due("2026-09-26") }),
    task("now"),
    task("span", { start_at: at("2026-09-28"), due_at: due("2026-09-30") }),
    task("later", { start_at: at("2026-10-02"), due_at: due("2026-10-02") }),
    task("undated", { start_at: null, due_at: null }),
    task("late-done", { status: "done", start_at: at("2026-09-25"), due_at: due("2026-09-25") }),
    task("gone", { deleted_at: "2026-09-28T00:00:00Z" }),
  ], today);
  assert.deepEqual(ids(board.overdue), ["late"]);
  assert.deepEqual(ids(board.today), ["now", "span"]);
  assert.deepEqual(ids(board.undated), ["undated"]);
  assert.deepEqual(ids(board.recurring), []);
});

test("finished tasks stay on the board but sink below open ones", () => {
  const board = todayBoard([
    task("done-first", { status: "done", sort_order: 0 }),
    task("open-second", { sort_order: 100 }),
  ], today);
  assert.deepEqual(ids(board.today), ["open-second", "done-first"]);
});

test("recurring occurrences split into today and missed days", () => {
  const occurrence = (on, status = "planned") => task(`r:${on}`, {
    source_type: "recurring",
    recurrence_template_id: "r",
    occurrence_on: on,
    status,
    start_at: at(on),
    due_at: due(on),
  });
  const board = todayBoard([
    occurrence("2026-09-27"),
    occurrence("2026-09-28", "done"),
    occurrence("2026-09-29"),
  ], today);
  assert.deepEqual(ids(board.recurring), ["r:2026-09-29"]);
  assert.deepEqual(ids(board.overdue), ["r:2026-09-27"]);
});

test("the source filter is a single choice", () => {
  assert.equal(matchesSource(task("a"), "all"), true);
  assert.equal(matchesSource(task("a", { source_type: "requested" }), "requested"), true);
  assert.equal(matchesSource(task("a", { source_type: "requested" }), "recurring"), false);
});
