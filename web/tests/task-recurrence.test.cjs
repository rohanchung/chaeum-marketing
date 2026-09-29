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

const { firstOpenOccurrence, nextTaskOccurrence, recurringDatesInRange, recurrenceText } = require("../src/lib/task-recurrence.ts");

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

test("daily recurrence materializes every occurrence from the series start", () => {
  assert.deepEqual(
    recurringDatesInRange(task({ start_at: "2026-09-28T03:00:00.000Z", recurrence_next_on: "2026-09-28" }), "2026-09-01", "2026-09-30"),
    ["2026-09-28", "2026-09-29", "2026-09-30"],
  );
});

test("completed and missed occurrences stay in the calendar range", () => {
  // A next_on that moved past 09-22 must not hide the earlier occurrences.
  assert.deepEqual(
    recurringDatesInRange(task({ recurrence_next_on: "2026-09-24" }), "2026-09-20", "2026-09-23"),
    ["2026-09-21", "2026-09-22", "2026-09-23"],
  );
  assert.deepEqual(
    recurringDatesInRange(task({ recurrence_until: "2026-09-22" }), "2026-09-01", "2026-09-30"),
    ["2026-09-21", "2026-09-22"],
  );
});

test("the next open occurrence is the earliest unfinished one", () => {
  // Completing a later day while an earlier day was missed keeps the missed day open.
  assert.equal(firstOpenOccurrence(task(), new Set(["2026-09-22"])), "2026-09-21");
  assert.equal(firstOpenOccurrence(task(), new Set(["2026-09-21", "2026-09-22"])), "2026-09-23");
  assert.equal(
    firstOpenOccurrence(task({ recurrence_until: "2026-09-22" }), new Set(["2026-09-21", "2026-09-22"])),
    null,
  );
});

test("recurrence labels stay compact and readable", () => {
  assert.equal(recurrenceText(task()), "매일");
  assert.equal(recurrenceText(task({ recurrence_frequency: "weekly", recurrence_interval: 2 })), "2주마다");
});
