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

const {
  assignLanes,
  hiddenBarsByColumn,
  visibleLaneCount,
  weekRowHeight,
  weekSegment,
} = require("../src/lib/task-calendar.ts");

// 2026-09-27 (Sun) .. 2026-09-30 (Wed), then days outside the month.
const lastWeek = ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", null, null, null];

test("week segments clip ranges to the real dates of the week", () => {
  assert.deepEqual(weekSegment(lastWeek, "2026-09-28", "2026-09-30"), { startColumn: 2, endColumn: 5, continues: false });
  assert.deepEqual(weekSegment(lastWeek, "2026-09-21", "2026-10-03"), { startColumn: 1, endColumn: 5, continues: true });
  assert.deepEqual(weekSegment(lastWeek, "2026-09-30", "2026-09-28"), { startColumn: 2, endColumn: 5, continues: false });
  assert.equal(weekSegment(lastWeek, "2026-10-01", "2026-10-02"), null);
});

test("bars share a lane only when their columns do not overlap", () => {
  const { bars, laneCount } = assignLanes([
    { startColumn: 2, endColumn: 3 },
    { startColumn: 3, endColumn: 4 },
    { startColumn: 2, endColumn: 5 },
  ]);
  assert.deepEqual(bars.map((bar) => bar.lane), [0, 0, 1]);
  assert.equal(laneCount, 2);
});

test("weeks show up to ten lanes before collapsing into +N", () => {
  assert.equal(visibleLaneCount(3), 3);
  assert.equal(visibleLaneCount(10), 10);
  assert.equal(visibleLaneCount(14), 10);
  const { bars } = assignLanes(Array.from({ length: 5 }, () => ({ startColumn: 2, endColumn: 3 })));
  bars.push({ startColumn: 2, endColumn: 5, lane: 5 });
  assert.deepEqual(hiddenBarsByColumn(bars, 3), [0, 3, 1, 1, 0, 0, 0]);
});

test("quiet weeks keep a small base height and busy weeks grow", () => {
  // 22px date row + lanes * 21px + 4px bottom.
  assert.equal(weekRowHeight(0, false), 22 + 2 * 21 + 4);
  assert.equal(weekRowHeight(1, false), 22 + 2 * 21 + 4);
  assert.equal(weekRowHeight(7, false), 22 + 7 * 21 + 4);
  // Ten drawn lanes plus one line for the +N labels.
  assert.equal(weekRowHeight(10, true), 22 + 11 * 21 + 4);
});
