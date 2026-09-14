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
const { emptyData, metricTemplate, dates } = require("../src/lib/domain.ts");
const { metricValue, summary, report } = require("../src/lib/analytics.ts");
const {
  printableHTML,
  downloadExcelReport,
} = require("../src/lib/report-export.ts");
const period = { start: "2026-09-01", end: "2026-09-30" };
const base = { workspace_id: "ws", deleted_at: null };
const source = {
  channel_id: null,
  content_id: null,
  promotion_id: null,
  event_id: null,
};
function fixture() {
  const d = structuredClone(emptyData);
  d.channels = [{ ...base, id: "ch", name: "인스타그램" }];
  d.contents = [
    {
      ...base,
      id: "content",
      channel_id: "ch",
      title: "설명회",
      status: "published",
    },
  ];
  d.promotions = [
    {
      ...base,
      id: "promo",
      content_id: "content",
      title: "설명회 광고",
      start_date: period.start,
      end_date: period.end,
    },
  ];
  d.metrics = metricTemplate("social_content").map((m, i) => ({
    ...base,
    ...m,
    id: `m${i}`,
    channel_id: "ch",
  }));
  return d;
}
const row = (d, key, scope = "total") => ({
  id: key,
  label: key,
  metric: d.metrics.find((m) => m.key === key && m.scope === scope),
  kind: "metric",
  content_id: "content",
  promotion_id: scope === "paid" ? "promo" : null,
});
function observation(d, key, value, date, scope = "total") {
  d.values.push({
    ...base,
    id: `v${d.values.length}`,
    metric_id: row(d, key, scope).metric.id,
    content_id: "content",
    promotion_id: scope === "paid" ? "promo" : null,
    metric_date: date,
    value,
  });
}
function customer(d, id, patch = {}) {
  d.customers.push({
    ...base,
    ...source,
    id,
    reference_code: id,
    consulted_on: "2026-09-01",
    enrolled_on: "2026-09-02",
    confidence: "unknown",
    ...patch,
  });
}
function payment(d, id, amount, cost, date = "2026-09-03") {
  d.payments.push({
    ...base,
    id: `p${d.payments.length}`,
    customer_id: id,
    paid_on: date,
    amount,
    service_cost: cost,
    adjusts_id: null,
  });
}
test("server date crosses Korean midnight without trusting the device date", () => {
  const { projectedServerDate } = require("../src/lib/server-date.ts");
  assert.equal(projectedServerDate("2026-09-13T14:59:59Z", 0), "2026-09-13");
  assert.equal(projectedServerDate("2026-09-13T14:59:59Z", 2000), "2026-09-14");
  assert.equal(projectedServerDate("2026-12-31T14:59:59Z", 2000), "2027-01-01");
  assert.throws(() => projectedServerDate("invalid", 0));
});

test("Carrot template exposes raw metrics, independent reaction details, and computed ratios", () => {
  const d = fixture();
  d.metrics = metricTemplate("paid_ad").map((m, i) => ({
    ...base,
    ...m,
    id: `carrot${i}`,
    channel_id: "ch",
  }));
  for (const [key, value] of [
    ["impressions", 1000],
    ["clicks", 20],
    ["reactions", 5],
    ["regulars", 2],
    ["interests", 2],
    ["couponDownloads", 1],
  ])
    observation(d, key, value, "2026-09-01", "paid");
  d.costs = [
    {
      ...base,
      ...source,
      id: "spend",
      promotion_id: "promo",
      expense_date: "2026-09-01",
      category: "media",
      payment_status: "paid",
      amount: 10000,
    },
  ];
  assert.equal(metricValue(d, row(d, "ctr", "paid"), period).value, 2);
  assert.equal(metricValue(d, row(d, "cpc", "paid"), period).value, 500);
  assert.equal(metricValue(d, row(d, "reactions", "paid"), period).value, 5);
  assert.equal(row(d, "ctr", "paid").metric.mode, "ratio");
  assert.equal(d.metrics.filter((m) => m.mode === "ratio").length, 3);
});

test("Carrot reach preserves the latest observation without summing repeated people", () => {
  const d = fixture();
  d.metrics = metricTemplate("paid_ad").map((m, i) => ({
    ...base,
    ...m,
    id: `carrot${i}`,
    channel_id: "ch",
  }));
  observation(d, "paidReach", 1484, "2026-09-01", "paid");
  observation(d, "paidReach", 1200, "2026-09-02", "paid");
  assert.equal(metricValue(d, row(d, "paidReach", "paid"), period).value, 1200);
});

test("independent metrics, corrected cumulative snapshots use last value, not MAX or sum", () => {
  const d = fixture();
  observation(d, "views", 1000, "2026-09-01");
  observation(d, "views", 900, "2026-09-30");
  observation(d, "likes", 12, "2026-09-30");
  assert.equal(metricValue(d, row(d, "views"), period).value, 900);
  assert.equal(metricValue(d, row(d, "likes"), period).value, 12);
  assert.equal(metricValue(d, row(d, "reach"), period).value, null);
});
test("zero, missing, and historical boundary are distinct", () => {
  const d = fixture();
  observation(d, "views", 150, "2026-08-31");
  observation(d, "likes", 0, "2026-09-01");
  assert.equal(metricValue(d, row(d, "views"), period).value, null);
  assert.equal(metricValue(d, row(d, "likes"), period).value, 0);
});
test("ratio uses weighted raw totals, zero denominator is unavailable", () => {
  const d = fixture();
  observation(d, "clicks", 10, "2026-09-01", "paid");
  observation(d, "impressions", 100, "2026-09-01", "paid");
  observation(d, "clicks", 10, "2026-09-02", "paid");
  observation(d, "impressions", 900, "2026-09-02", "paid");
  assert.equal(metricValue(d, row(d, "ctr", "paid"), period).value, 2);
  assert.equal(
    metricValue(d, row(d, "ctr", "paid"), {
      start: "2026-10-01",
      end: "2026-10-31",
    }).value,
    null,
  );
});
test("refunds reduce revenue; repeated payments count distinct customers for AOV", () => {
  const d = fixture();
  customer(d, "a");
  customer(d, "b");
  payment(d, "a", 400, 100);
  payment(d, "a", 200, 50);
  payment(d, "a", -100, -25);
  payment(d, "b", 300, 75);
  d.costs = [
    {
      ...base,
      ...source,
      id: "expense",
      expense_date: "2026-09-01",
      amount: 200,
      category: "media",
      payment_status: "paid",
    },
  ];
  const s = summary(d, period);
  assert.equal(s.revenue, 800);
  assert.equal(s.payers, 2);
  assert.equal(s.aov, 400);
  assert.equal(s.serviceCost, 200);
  assert.equal(s.roi, 2);
});
test("missing costs suppress ROI, explicit zero costs allow ROI", () => {
  const d = fixture();
  customer(d, "a");
  payment(d, "a", 400, null);
  d.costs = [
    {
      ...base,
      ...source,
      id: "expense",
      expense_date: "2026-09-01",
      amount: 100,
      payment_status: "paid",
    },
  ];
  assert.equal(summary(d, period).roi, null);
  d.payments[0].service_cost = 0;
  assert.equal(summary(d, period).roi, 3);
});
test("unpaid/cancelled costs and soft-deleted payments are excluded", () => {
  const d = fixture();
  customer(d, "a");
  payment(d, "a", 100, 0);
  d.payments[0].deleted_at = "now";
  d.costs = ["planned", "pending", "cancelled"].map((payment_status, i) => ({
    ...base,
    ...source,
    id: `e${i}`,
    expense_date: "2026-09-01",
    amount: 100,
    payment_status,
  }));
  assert.equal(summary(d, period).spend, 0);
  assert.equal(summary(d, period).revenue, null);
});
test("customer deletion preserves financial ledger while removing active conversion count", () => {
  const d = fixture();
  customer(d, "a", { deleted_at: "now" });
  payment(d, "a", 100, 0);
  const s = summary(d, period);
  assert.equal(s.revenue, 100);
  assert.equal(s.cohort, 0);
});
test("prior-month consultation enrolling this month is not a new consultation cohort", () => {
  const d = fixture();
  customer(d, "a", { consulted_on: "2026-08-15" });
  customer(d, "b", { enrolled_on: "2026-10-02" });
  const s = summary(d, period);
  assert.equal(s.cohort, 1);
  assert.equal(s.cohortEnrolled, 0);
  assert.equal(s.conversion, 0);
});
test("unknown and inferred sources cannot create attributed ROAS", () => {
  const d = fixture();
  customer(d, "a", { promotion_id: "promo", confidence: "inferred" });
  payment(d, "a", 500, 0);
  d.costs = [
    {
      ...base,
      ...source,
      id: "e",
      promotion_id: "promo",
      expense_date: "2026-09-01",
      amount: 100,
      category: "media",
      payment_status: "paid",
    },
  ];
  let r = report(d, period);
  assert.equal(r.summary.revenue, 500);
  assert.equal(r.activities.find((a) => a.id === "promo").roas, null);
  d.customers[0].confidence = "reported";
  r = report(d, period);
  assert.equal(r.activities.find((a) => a.id === "promo").roas, 5);
  assert.equal(r.activities.find((a) => a.id === "ch").revenue, 500);
});
test("archived content stays in reports; trashed content metrics are excluded but ledger stays", () => {
  const d = fixture();
  observation(d, "views", 10, "2026-09-03");
  d.contents[0].status = "archived";
  assert.ok(
    report(d, period).metrics.some(
      (m) => m.metric === "조회수" && m.value === 10,
    ),
  );
  d.contents[0].deleted_at = "now";
  assert.ok(!report(d, period).metrics.some((m) => m.content === "설명회"));
});
test("annual AOV uses annual distinct payers, not monthly average; leap dates correct", () => {
  const d = fixture();
  customer(d, "a");
  payment(d, "a", 100, 0, "2026-01-01");
  payment(d, "a", 300, 0, "2026-09-01");
  const r = report(d, { start: "2026-01-01", end: "2026-12-31" }, true);
  assert.equal(r.summary.aov, 400);
  assert.equal(r.trend.length, 12);
  assert.equal(dates({ start: "2024-02-01", end: "2024-02-29" }).length, 29);
});
test("print output escapes stored text and never turns missing revenue into zero", () => {
  const d = fixture();
  d.channels[0].name = "<script>alert(1)</script>";
  const html = printableHTML(report(d, period));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("순수납 매출<strong>—"));
});

test("deleted raw metrics make dependent ratios unavailable", () => {
  const d = fixture();
  observation(d, "clicks", 10, "2026-09-01", "paid");
  observation(d, "impressions", 100, "2026-09-01", "paid");
  row(d, "impressions", "paid").metric.deleted_at = "now";
  assert.equal(metricValue(d, row(d, "ctr", "paid"), period).value, null);
});

test("refund-only report keeps negative cashflow and unavailable AOV", () => {
  const d = fixture();
  customer(d, "a");
  payment(d, "a", 300000, 100000, "2026-08-31");
  payment(d, "a", -30000, 0, "2026-09-13");
  const r = report(d, period);
  assert.equal(r.summary.revenue, -30000);
  assert.equal(r.summary.aov, null);
  const html = printableHTML(r);
  assert.ok(html.includes("width:100%;background:#b34242"));
  assert.ok(html.includes("-30,000원 (순환불)"));
});

test("Excel export serializes the same net receipts and preserves missing values", () => {
  const XLSX = require("xlsx");
  const writeFile = XLSX.writeFile;
  let workbook;
  XLSX.writeFile = (value) => {
    workbook = value;
  };
  try {
    const d = fixture();
    customer(d, "a");
    payment(d, "a", 300000, 100000);
    payment(d, "a", -30000, 0);
    downloadExcelReport(report(d, period));
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const parsed = XLSX.read(bytes, { type: "buffer" });
    assert.equal(parsed.SheetNames.length, 4);
    const rows = XLSX.utils.sheet_to_json(parsed.Sheets[parsed.SheetNames[0]], {
      header: 1,
    });
    assert.ok(rows.some((r) => r.includes(270000)));
    assert.ok(
      rows.some(
        (r) =>
          r[0] === "기간 마케팅 ROI" && (r[1] === undefined || r[1] === null),
      ),
    );
  } finally {
    XLSX.writeFile = writeFile;
  }
});
