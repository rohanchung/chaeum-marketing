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

const flow = require("../src/lib/task-flow.ts");

const task = (id, overrides = {}) => ({
  id,
  title: id,
  deleted_at: null,
  project_id: "p",
  area_id: "area",
  status: "planned",
  completed_at: null,
  sort_order: 100,
  start_at: "2026-09-29T12:00:00+09:00",
  due_at: "2026-09-29T23:59:00+09:00",
  depends_on_task_id: null,
  ...overrides,
});
const parentOf = (draft, id) => draft.find((node) => node.id === id).parentId;

test("the draft holds only the selected project's live tasks", () => {
  const draft = flow.draftFromTasks([
    task("a"),
    task("other", { project_id: "q" }),
    task("gone", { deleted_at: "2026-09-28T00:00:00Z" }),
  ], "p");
  assert.deepEqual(draft.map((node) => node.id), ["a"]);
});

test("adding after and before keeps the chain connected", () => {
  let draft = flow.draftFromTasks([task("a")], "p");
  draft = flow.addAfter(draft, "a", "b", "2026-09-29");
  assert.equal(parentOf(draft, "b"), "a");
  draft = flow.addBefore(draft, "b", "x", "2026-09-29");
  // a → x → b
  assert.equal(parentOf(draft, "x"), "a");
  assert.equal(parentOf(draft, "b"), "x");
});

test("links that would form a loop are refused", () => {
  let draft = flow.draftFromTasks([task("a"), task("b", { depends_on_task_id: "a" }), task("c", { depends_on_task_id: "b" })], "p");
  assert.equal(flow.wouldCycle(draft, "a", "c"), true);
  const unchanged = flow.setParent(draft, "a", "c");
  assert.equal(parentOf(unchanged, "a"), null);
  draft = flow.setParent(draft, "c", "a");
  assert.equal(parentOf(draft, "c"), "a");
});

test("removing a task moves its following tasks up to its 앞 일", () => {
  let draft = flow.draftFromTasks([task("a"), task("b", { depends_on_task_id: "a" }), task("c", { depends_on_task_id: "b" })], "p");
  draft = flow.removeNode(draft, "b");
  assert.equal(parentOf(draft, "c"), "a");
  assert.equal(draft.find((node) => node.id === "b").deleted, true);
});

test("layout places depth as columns and parents between their children", () => {
  let draft = flow.draftFromTasks([task("a")], "p");
  draft = flow.addAfter(draft, "a", "b", "2026-09-29");
  draft = flow.addAfter(draft, "a", "c", "2026-09-29");
  const { positions, edges, columns } = flow.layoutFlow(draft);
  assert.equal(columns, 2);
  assert.deepEqual(positions.get("b"), { col: 1, row: 0 });
  assert.deepEqual(positions.get("c"), { col: 1, row: 1 });
  assert.deepEqual(positions.get("a"), { col: 0, row: 0.5 });
  assert.equal(edges.length, 2);
});

test("save rows cover only changed tasks and keep earlier completion times", () => {
  const original = flow.draftFromTasks([
    task("a", { status: "done", completed_at: "2026-09-20T00:00:00Z" }),
    task("b"),
  ], "p");
  let draft = flow.updateNode(original, "a", { title: "a2" });
  draft = flow.addAfter(draft, "a", "n", "2026-09-29");
  draft = flow.updateNode(draft, "n", { title: "새 일" });
  const rows = flow.flowRows(original, draft, { projectId: "p", areaId: "area", now: "2026-09-29T09:00:00Z" });
  assert.deepEqual(rows.map((row) => row.id), ["a", "n"]);
  assert.equal(rows[0].completed_at, "2026-09-20T00:00:00Z");
  assert.equal(rows[1].depends_on_task_id, "a");
  assert.equal(rows[1].start_at, "2026-09-29T12:00:00+09:00");
  assert.equal(flow.changedCount(original, draft), 2);
});

test("a due date before the start follows the edited field", () => {
  const draft = flow.draftFromTasks([task("a")], "p");
  const moved = flow.updateNode(draft, "a", { startOn: "2026-10-02" });
  assert.equal(moved[0].dueOn, "2026-10-02");
});
