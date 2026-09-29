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
  laneCapacity,
  visibleLaneCount,
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

test("lane capacity follows the measured row height", () => {
  assert.equal(laneCapacity(0), 1);
  assert.equal(laneCapacity(81), 2);
  assert.equal(laneCapacity(113), 4);
});

test("overflowing weeks keep the last lane for +N labels", () => {
  assert.equal(visibleLaneCount(3, 4), 3);
  assert.equal(visibleLaneCount(9, 4), 3);
  assert.equal(visibleLaneCount(9, 1), 0);
  const { bars } = assignLanes(Array.from({ length: 5 }, () => ({ startColumn: 2, endColumn: 3 })));
  bars.push({ startColumn: 2, endColumn: 5, lane: 5 });
  assert.deepEqual(hiddenBarsByColumn(bars, 3), [0, 3, 1, 1, 0, 0, 0]);
});
