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

const { eventInPeriod, eventOnDate, toggledEventStatus } = require("../src/lib/events.ts");

const event = (overrides = {}) => ({
  id: "e",
  title: "설명회",
  deleted_at: null,
  status: "planned",
  starts_at: "2026-09-29T03:00:00+00:00",
  ends_at: null,
  ...overrides,
});

test("a multi-day event appears on every day it covers, in every view", () => {
  const multi = event({ ends_at: "2026-10-01T03:00:00+00:00" });
  assert.equal(eventOnDate(multi, "2026-09-29"), true);
  assert.equal(eventOnDate(multi, "2026-09-30"), true);
  assert.equal(eventOnDate(multi, "2026-10-01"), true);
  assert.equal(eventOnDate(multi, "2026-10-02"), false);
  assert.equal(eventInPeriod(multi, { start: "2026-10-01", end: "2026-10-31" }), true);
});

test("a one-day event and trashed events", () => {
  assert.equal(eventOnDate(event(), "2026-09-29"), true);
  assert.equal(eventOnDate(event(), "2026-09-30"), false);
  assert.equal(eventOnDate(event({ deleted_at: "2026-09-29T00:00:00Z" }), "2026-09-29"), false);
});

test("the completion checkbox toggles completed and planned", () => {
  assert.equal(toggledEventStatus(event()), "completed");
  assert.equal(toggledEventStatus(event({ status: "completed" })), "planned");
  assert.equal(toggledEventStatus(event({ status: "active" })), "completed");
});
