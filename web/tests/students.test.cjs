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

const { emptyData, metricTemplate } = require("../src/lib/domain.ts");
const { cellValue, metricValue } = require("../src/lib/analytics.ts");
const students = require("../src/lib/students.ts");

const student = (id, overrides = {}) => ({
  id,
  deleted_at: null,
  reference_code: id,
  consulted_on: "2026-09-10",
  level_test_on: "2026-09-10",
  enrolled_on: null,
  withdrawn_on: null,
  confidence: "unknown",
  student_name: id,
  ...overrides,
});
const september = { start: "2026-09-01", end: "2026-09-30" };

test("level-test students and their enrollment conversion", () => {
  const list = [
    student("a", { enrolled_on: "2026-09-15" }),
    student("b"),
    student("c", { level_test_on: "2026-08-20", consulted_on: "2026-08-20", enrolled_on: "2026-09-02" }),
  ];
  const stats = students.studentStats(list, september, "2026-10-06");
  assert.equal(stats.levelTests, 2);
  assert.equal(stats.levelTestEnrolled, 1);
  assert.equal(stats.conversion, 0.5);
  assert.equal(stats.enrolledInPeriod, 2);
  assert.equal(stats.active, 2);
});

test("tenure runs from enrollment to withdrawal or today", () => {
  const stayed = students.tenureMonths(student("a", { enrolled_on: "2026-01-01" }), "2026-07-02");
  assert.ok(stayed > 5.9 && stayed < 6.1);
  const left = students.tenureMonths(student("b", { enrolled_on: "2026-01-01", withdrawn_on: "2026-04-01" }), "2026-07-02");
  assert.ok(left > 2.9 && left < 3.1);
  assert.equal(students.tenureMonths(student("c"), "2026-07-02"), null);
});

test("day lists and enrollment candidates", () => {
  const list = [student("a"), student("b", { enrolled_on: "2026-09-12" }), student("c", { level_test_on: "2026-09-11" })];
  assert.deepEqual(students.studentsOn(list, "level_tests", "2026-09-10").map((s) => s.id), ["a", "b"]);
  assert.deepEqual(students.studentsOn(list, "enrollments", "2026-09-12").map((s) => s.id), ["b"]);
  assert.deepEqual(students.enrollmentCandidates(list).map((s) => s.id), ["c", "a"]);
});

test("lifetime metrics sum from the first record, while day cells keep the day value", () => {
  const d = structuredClone(emptyData);
  const regulars = { ...metricTemplate("social_content")[0], id: "regulars", key: "bizProfileRegulars", mode: "daily", scope: "total", unit: "count", channel_id: "ch", deleted_at: null, aggregation_scope: "lifetime" };
  d.metrics = [regulars];
  const row = { id: "r", label: "단골수", metric: regulars, kind: "metric", content_id: "profile", promotion_id: null };
  d.values = [
    { id: "v1", deleted_at: null, metric_id: "regulars", content_id: "profile", promotion_id: null, metric_date: "2026-09-10", value: 3 },
    { id: "v2", deleted_at: null, metric_id: "regulars", content_id: "profile", promotion_id: null, metric_date: "2026-10-02", value: 2 },
  ];
  const october = { start: "2026-10-01", end: "2026-10-31" };
  assert.equal(metricValue(d, row, october).value, 5);
  assert.equal(metricValue(d, { ...row, metric: { ...regulars, aggregation_scope: null } }, october).value, 2);
  assert.equal(cellValue(d, row, "2026-10-02").value, 2);
  // Viewing September does not include later records.
  assert.equal(metricValue(d, row, september).value, 3);
});
