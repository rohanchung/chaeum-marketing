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

const { nextTaskOccurrence, recurringDatesInRange, recurrenceText } = require("../src/lib/task-recurrence.ts");

const task = (overrides = {}) => ({
  recurrence_frequency: "daily",
  recurrence_interval: 1,
  recurrence_until: null,
  start_at: "2026-09-21T12:00:00.000Z",
  ...overrides,
});

test("daily and weekly recurrence advance by the configured interval", () => {
  assert.equal(nextTaskOccurrence(task(), "2026-09-21"), "2026-09-22");
  assert.equal(
    nextTaskOccurrence(task({ recurrence_frequency: "weekly", recurrence_interval: 2 }), "2026-09-21"),
    "2026-10-05",
  );
});

test("monthly recurrence keeps the anchor day and respects its end date", () => {
  const monthly = task({ recurrence_frequency: "monthly", start_at: "2026-01-31T12:00:00.000Z" });
  assert.equal(nextTaskOccurrence(monthly, "2026-02-28"), "2026-03-31");
  assert.equal(nextTaskOccurrence({ ...monthly, recurrence_until: "2026-03-30" }, "2026-02-28"), null);
});

test("daily recurrence materializes every future calendar date in the month", () => {
  assert.deepEqual(
    recurringDatesInRange(task({ recurrence_next_on: "2026-09-28", recurrence_active: true }), "2026-09-01", "2026-09-30"),
    ["2026-09-28", "2026-09-29", "2026-09-30"],
  );
});

test("recurrence labels stay compact and readable", () => {
  assert.equal(recurrenceText(task()), "매일");
  assert.equal(recurrenceText(task({ recurrence_frequency: "weekly", recurrence_interval: 2 })), "2주마다");
});
