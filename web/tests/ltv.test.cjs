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

const { emptyData } = require("../src/lib/domain.ts");
const ltv = require("../src/lib/ltv.ts");

const september = { start: "2026-09-01", end: "2026-09-30" };
const cost = (id, amount, overrides = {}) => ({
  id,
  deleted_at: null,
  payment_status: "paid",
  expense_date: "2026-09-10",
  amount,
  category: "media",
  channel_id: null,
  content_id: null,
  promotion_id: null,
  event_id: null,
  ...overrides,
});
const student = (id, overrides = {}) => ({
  id,
  deleted_at: null,
  consulted_on: "2026-09-01",
  enrolled_on: "2026-09-05",
  withdrawn_on: null,
  monthly_fee: 250000,
  confidence: "reported",
  channel_id: null,
  content_id: null,
  promotion_id: null,
  event_id: null,
  ...overrides,
});
const data = (overrides = {}) => ({ ...emptyData, ...overrides });

test("CAC uses acquisition spend only; launch and retention are kept apart", () => {
  const d = data({
    costs: [cost("a", 1600000), cost("b", 400000, { cost_purpose: "launch" }), cost("c", 100000, { cost_purpose: "retention" })],
    customers: Array.from({ length: 8 }, (_, i) => student(`s${i}`)),
  });
  const u = ltv.unitEconomics(d, september, "2026-09-29");
  assert.deepEqual(u.spend, { acquisition: 1600000, launch: 400000, retention: 100000 });
  // No funnel enrollment metric → customer records count.
  assert.equal(u.enrollments, 8);
  assert.equal(u.cac, 200000);
});

test("default assumptions: 25만 × 40% × 6개월 = LTV 60만, CAC 20만 → 3:1, 2-month payback", () => {
  const d = data({ costs: [cost("a", 1600000)], customers: Array.from({ length: 8 }, (_, i) => student(`s${i}`)) });
  const u = ltv.unitEconomics(d, september, "2026-09-29");
  assert.equal(u.monthlyContribution, 100000);
  assert.equal(u.retention.source, "assumed");
  assert.equal(u.ltv, 600000);
  assert.equal(u.ltvToCac, 3);
  assert.equal(u.payback, 2);
  assert.equal(u.verdict, "good");
  assert.deepEqual(u.scenarios.map((s) => [s.months, s.ltv, s.cacCeiling]), [[6, 600000, 200000], [12, 1200000, 400000], [18, 1800000, 600000]]);
});

test("without entered tuition the lifetime value is not guessed", () => {
  const d = data({ costs: [cost("a", 1000000)], customers: [student("s", { monthly_fee: null })] });
  const u = ltv.unitEconomics(d, september, "2026-09-29");
  assert.equal(u.fee.value, null);
  assert.equal(u.ltv, null);
  assert.equal(u.verdict, null);
});

test("verdict bands follow the target ratio", () => {
  assert.equal(ltv.verdict(3.2, 3), "good");
  assert.equal(ltv.verdict(2.4, 3), "watch");
  assert.equal(ltv.verdict(1.5, 3), "review");
  assert.equal(ltv.verdict(null, 3), null);
});

test("measured retention waits for six months of history, then uses the withdrawal rate", () => {
  const early = ltv.measuredRetention([student("a"), student("b", { withdrawn_on: "2026-09-20" })], "2026-09-29");
  assert.equal(early.months, null);
  const later = ltv.measuredRetention(
    [
      student("a", { enrolled_on: "2026-01-01" }),
      student("b", { enrolled_on: "2026-01-01", withdrawn_on: "2026-04-01" }),
    ],
    "2026-09-01",
  );
  assert.ok(later.months > 9 && later.months < 12);
  assert.equal(later.withdrawals, 1);
});

test("cohorts accumulate contribution by months since enrollment and mark recovery", () => {
  const d = data({
    costs: [cost("a", 150000)],
    customers: [student("s")],
    payments: [
      { id: "p1", deleted_at: null, customer_id: "s", paid_on: "2026-09-05", amount: 250000 },
      { id: "p2", deleted_at: null, customer_id: "s", paid_on: "2026-10-05", amount: 250000 },
    ],
  });
  const [row] = ltv.cohorts(d, "2026-11-10");
  assert.equal(row.month, "2026-09");
  assert.equal(row.spend, 150000);
  assert.deepEqual(row.cumulative, [100000, 200000, 200000]);
  assert.equal(row.recoveredAt, 2);
});

test("channels under five confirmed students are not judged", () => {
  const d = data({
    channels: [{ id: "ch", name: "당근", deleted_at: null }],
    costs: [cost("a", 600000, { channel_id: "ch" })],
    customers: [student("s", { channel_id: "ch" })],
  });
  const { rows } = ltv.channelEconomics(d, september, 600000);
  assert.equal(rows[0].newStudents, 1);
  assert.equal(rows[0].cac, 600000);
  assert.equal(rows[0].enoughSample, false);
  assert.equal(rows[0].verdict, null);
});
