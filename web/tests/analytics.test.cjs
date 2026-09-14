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
test("소재 없는 채널 지표는 일별·월간 보고서에 표시되고 소재에 중복되지 않는다", () => {
  const d = fixture();
  const { metricsForContent } = require("../src/lib/domain.ts");
  const metric = {
    ...base,
    id: "site-views",
    channel_id: "ch",
    key: "siteViews",
    name: "페이지뷰",
    scope: "channel",
    mode: "daily",
    unit: "count",
    sort_order: 0,
  };
  d.metrics.push(metric);
  d.values.push(
    {
      ...base,
      id: "sv1",
      metric_id: metric.id,
      content_id: null,
      promotion_id: null,
      metric_date: "2026-09-01",
      value: 20,
    },
    {
      ...base,
      id: "sv2",
      metric_id: metric.id,
      content_id: null,
      promotion_id: null,
      metric_date: "2026-09-02",
      value: 30,
    },
  );
  const channelRow = {
    id: metric.id,
    metric,
    kind: "metric",
    content_id: null,
    promotion_id: null,
  };
  assert.equal(metricValue(d, channelRow, period).value, 50);
  assert.equal(
    metricValue(d, channelRow, { start: "2026-09-02", end: "2026-09-02" })
      .value,
    30,
  );
  assert.ok(
    !metricsForContent(d.metrics, d.contents[0]).some(
      (m) => m.id === metric.id,
    ),
  );
  d.contents = [];
  d.promotions = [];
  const values = report(d, period).metrics.filter(
    (m) => m.metric === "페이지뷰",
  );
  assert.equal(values.length, 1);
  assert.equal(values[0].value, 50);
  assert.equal(values[0].content, "");
  assert.equal(
    rollupValue(
      d,
      [channelRow],
      { channelId: "ch" },
      `metric:${metric.id}`,
      period,
    ),
    50,
  );
});
const { navigateTab, navigationTab } = require("../src/lib/navigation.ts");
const { orderedChannels, moveChannel } = require("../src/lib/channel-order.ts");
test("메뉴 전환은 기록을 추가하고 뒤로·앞으로 이전 메뉴와 배포 경로를 복원한다", () => {
  const urls = ["https://example.com/chaeum-marketing/"];
  let cursor = 0,
    events = 0;
  const browser = {
    get location() {
      return new URL(urls[cursor]);
    },
    dispatchEvent() {
      events++;
      return true;
    },
    history: {
      state: { __NA: true },
      pushState(state, _, url) {
        assert.deepEqual(state, { __NA: true });
        urls.splice(cursor + 1);
        urls.push(url);
        cursor++;
      },
    },
  };
  navigateTab(browser, "콘텐츠");
  navigateTab(browser, "콘텐츠");
  navigateTab(browser, "분석");
  assert.equal(urls.length, 3);
  assert.equal(events, 2);
  cursor--;
  assert.equal(navigationTab(browser.location.hash), "콘텐츠");
  cursor--;
  assert.equal(navigationTab(browser.location.hash), "대시보드");
  cursor++;
  assert.equal(navigationTab(browser.location.hash), "콘텐츠");
  assert.equal(browser.location.pathname, "/chaeum-marketing/");
  navigateTab(browser, "리포트");
  assert.equal(urls.length, 3);
  assert.equal(navigationTab(browser.location.hash), "리포트");
});
test("채널 이동은 순서를 재저장하고 새 채널은 뒤에 추가하며 고정 패널은 제외한다", () => {
  const channels = [
    { id: "a", sort_order: 0 },
    { id: "b", sort_order: 1 },
    { id: "bitly", sort_order: 2147483647 },
  ];
  const moved = moveChannel(channels, "bitly", "a", "before");
  assert.deepEqual(
    orderedChannels([...moved].reverse()).map((c) => c.id),
    ["bitly", "a", "b"],
  );
  assert.deepEqual(
    moveChannel(moved, "bitly", "b", "after").map((c) => c.id),
    ["a", "b", "bitly"],
  );
  assert.deepEqual(
    orderedChannels([...moved, { id: "new" }]).map((c) => c.id),
    ["bitly", "a", "b", "new"],
  );
  assert.deepEqual(moveChannel(channels, "academy", "a", "before"), []);
  assert.deepEqual(
    channels.map((c) => c.sort_order),
    [0, 1, 2147483647],
  );
});
const { withMetricCosts } = require("../src/lib/metric-costs.ts");

test("선택한 비용 지표만 월·연간 비용과 채널 성과에 한 번 합산한다", () => {
  const d = fixture();
  d.metrics.push({
    ...base,
    id: "custom-cost",
    channel_id: "ch",
    key: "custom-cost",
    name: "비용",
    scope: "total",
    mode: "daily",
    unit: "currency",
    include_in_marketing: true,
    sort_order: 0,
  });
  d.values.push({
    ...base,
    id: "cost-value",
    metric_id: "custom-cost",
    content_id: "content",
    promotion_id: null,
    metric_date: "2026-09-10",
    value: 30000,
  });
  const loaded = withMetricCosts(withMetricCosts(d));
  assert.equal(loaded.costs.length, 1);
  assert.equal(summary(loaded, period).spend, 30000);
  assert.equal(
    report(loaded, period).activities.find((a) => a.id === "ch").spend,
    30000,
  );
  assert.equal(
    report(loaded, { start: "2026-01-01", end: "2026-12-31" }, true).summary
      .spend,
    30000,
  );
  loaded.values[0].value = 20000;
  assert.equal(summary(withMetricCosts(loaded), period).spend, 20000);
  loaded.metrics.find((m) => m.id === "custom-cost").include_in_marketing =
    false;
  assert.equal(summary(withMetricCosts(loaded), period).spend, 0);
});

test("추가한 학원 상담·신청·등록 지표도 지정한 분류와 전체 비용 효율에 반영된다", () => {
  const d = fixture();
  for (const [key, role, value] of [
    ["custom-consult", "consultations", 1],
    ["seminar", "inflows", 6],
    ["custom-enroll", "enrollments", 2],
  ]) {
    d.metrics.push({
      ...base,
      id: key,
      key,
      name: key,
      scope: "funnel",
      channel_id: null,
      mode: "daily",
      unit: "count",
      funnel_role: role,
    });
    d.values.push({
      ...base,
      id: `v:${key}`,
      metric_id: key,
      content_id: null,
      promotion_id: null,
      metric_date: "2026-09-10",
      value,
    });
  }
  d.costs.push({
    ...base,
    ...source,
    id: "expense",
    amount: 30000,
    expense_date: "2026-09-10",
    category: "other",
    payment_status: "paid",
  });
  const s = summary(d, period);
  assert.equal(s.consultations, 1);
  assert.equal(s.inflows, 6);
  assert.equal(s.enrollments, 2);
  assert.equal(
    rollupValue(d, [], { academy: true }, "academy:consultCost", period),
    30000,
  );
  assert.equal(
    rollupValue(d, [], { academy: true }, "academy:enrollCost", period),
    15000,
  );
  assert.equal(
    rollupValue(d, [], { academy: true }, "academy:enrollCost", {
      start: "2026-09-11",
      end: "2026-09-11",
    }),
    null,
  );
  assert.ok(rollupOptions([]).every((o) => o.id !== "roi"));
});
const { moveMetric, metricGroup } = require("../src/lib/metric-order.ts");

test("지표 이동은 중복 순번도 정리하고 다른 채널·프로필·광고 지표를 섞지 않는다", () => {
  const d = fixture();
  d.metrics.forEach((m) => {
    m.sort_order = 0;
  });
  const group = metricGroup(
    d.metrics,
    d.metrics.find((m) => m.scope === "total"),
  );
  const moved = moveMetric(d.metrics, group[1].id, -1);
  assert.equal(moved[0].id, group[1].id);
  assert.deepEqual(
    moved.map((m) => m.sort_order),
    moved.map((_, i) => i),
  );
  assert.ok(moved.every((m) => m.scope === "total"));
  assert.ok(d.metrics.every((m) => m.sort_order === 0));
  assert.deepEqual(moveMetric(d.metrics, group[0].id, -1), []);
  const extra = { ...group[0], id: "profile", key: "bizProfileCustom" };
  assert.deepEqual(
    metricGroup([...d.metrics, extra], extra).map((m) => m.id),
    ["profile"],
  );
});

test("삭제 지표는 이동에서 제외하고 순서 변경은 기록의 의미를 바꾸지 않는다", () => {
  const d = fixture();
  const group = metricGroup(d.metrics, d.metrics[0]);
  group[1].deleted_at = "2026-09-14";
  const moved = moveMetric(d.metrics, group[0].id, 1);
  assert.equal(moved[0].id, group[2].id);
  assert.ok(moved.every((m) => !m.deleted_at));
  for (const metric of moved) {
    const original = d.metrics.find((m) => m.id === metric.id);
    assert.deepEqual({ ...metric, sort_order: original.sort_order }, original);
  }
});
const { rollupOptions, rollupValue } = require("../src/lib/sheet-rollup.ts");

test("인스타 광고비 첫 입력은 기간 사전 설정 없이 저장 대상을 연결한다", async () => {
  const d = fixture();
  d.channels[0].measurement_template = "social_content";
  d.promotions = [];
  const result = await resolveSheetCells(
    d,
    [
      {
        kind: "cost",
        content_id: "content",
        promotion_id: sheetPromotions(d, "content", period)[0].id,
        date: "2026-09-14",
        value: 5000,
      },
    ],
    async (r) => ({ ...base, ...r, id: "instagram-promo" }),
  );
  assert.equal(result[0].promotion_id, "instagram-promo");
  assert.equal(result[0].value, 5000);
});

test("채널 요약은 소재별 마지막 누적값을 합치고 클릭률은 가중 계산한다", () => {
  const d = fixture();
  d.contents.push({ ...d.contents[0], id: "content2" });
  d.promotions.push({
    ...d.promotions[0],
    id: "promo2",
    content_id: "content2",
  });
  const rows = (key, scope) => [
    row(d, key, scope),
    {
      ...row(d, key, scope),
      content_id: "content2",
      promotion_id: scope === "paid" ? "promo2" : null,
    },
  ];
  for (const [content, promo, views, impressions, clicks] of [
    ["content", "promo", 90, 100, 10],
    ["content2", "promo2", 180, 1000, 10],
  ]) {
    for (const [key, scope, value, date] of [
      ["views", "total", views + 10, "2026-09-01"],
      ["views", "total", views, "2026-09-02"],
      ["impressions", "paid", impressions, "2026-09-01"],
      ["clicks", "paid", clicks, "2026-09-01"],
    ]) {
      d.values.push({
        ...base,
        id: `${content}:${key}:${date}`,
        metric_id: d.metrics.find((m) => m.key === key && m.scope === scope).id,
        content_id: content,
        promotion_id: scope === "paid" ? promo : null,
        metric_date: date,
        value,
      });
    }
  }
  const views = rows("views", "total"),
    ctr = rows("ctr", "paid");
  const target = { channelId: "ch" };
  assert.equal(
    rollupValue(d, views, target, `metric:${views[0].metric.id}`, period),
    270,
  );
  assert.equal(
    rollupValue(d, views, target, `metric:${views[0].metric.id}`, {
      start: "2026-09-01",
      end: "2026-09-01",
    }),
    290,
  );
  assert.ok(
    Math.abs(
      rollupValue(d, ctr, target, `metric:${ctr[0].metric.id}`, period) -
        (20 / 1100) * 100,
    ) < 1e-10,
  );
  assert.equal(
    rollupOptions([...views, ...ctr]).filter((o) => o.id.startsWith("metric:"))
      .length,
    2,
  );
});

test("소재·채널 ROI는 출처별 비용과 연결 수납·원가로 계산하고 미입력은 숨긴다", () => {
  const d = fixture();
  d.costs = [
    {
      ...base,
      ...source,
      id: "ad",
      promotion_id: "promo",
      amount: 100,
      expense_date: "2026-09-14",
      payment_status: "paid",
      category: "media",
    },
    {
      ...base,
      ...source,
      id: "channel",
      channel_id: "ch",
      amount: 100,
      expense_date: "2026-09-14",
      payment_status: "paid",
      category: "other",
    },
  ];
  const target = { contentId: "content" };
  assert.equal(rollupValue(d, [], target, "spend", period), 100);
  assert.equal(rollupValue(d, [], target, "roi", period), null);
  d.customers = [
    {
      ...base,
      ...source,
      id: "customer",
      content_id: "content",
      confidence: "direct",
      consulted_on: "2026-09-14",
      enrolled_on: "2026-09-14",
    },
  ];
  d.payments = [
    {
      ...base,
      id: "payment",
      customer_id: "customer",
      amount: 1000,
      service_cost: null,
      paid_on: "2026-09-14",
    },
  ];
  assert.equal(rollupValue(d, [], target, "roi", period), null);
  d.payments[0].service_cost = 300;
  assert.equal(rollupValue(d, [], target, "roi", period), 600);
  assert.equal(rollupValue(d, [], { channelId: "ch" }, "roi", period), 250);
});
const {
  sheetPromotions,
  resolveSheetCells,
  isEventChannel,
} = require("../src/lib/sheet-ad.ts");

test("당근은 집행 없는 달에도 매일 입력 가능하며 기존 기간을 보존한다", () => {
  const d = fixture();
  d.promotions[0].start_date = "2026-09-10";
  d.promotions[0].end_date = "2026-09-15";
  const periods = sheetPromotions(d, "content", period);
  assert.deepEqual(
    periods.map((p) => [p.start_date, p.end_date]),
    [
      ["2026-09-01", "2026-09-09"],
      ["2026-09-10", "2026-09-15"],
      ["2026-09-16", "2026-09-30"],
    ],
  );
  assert.equal(d.promotions.length, 1);
  assert.equal(periods[1].id, "promo");
});

test("당근 첫 입력·연속 입력은 같은 저장 대상을 사용하고 비용·CTR 계산에 연결된다", async () => {
  const d = fixture();
  d.channels[0].measurement_template = "paid_ad";
  d.promotions = [];
  d.metrics = metricTemplate("paid_ad").map((m, i) => ({
    ...base,
    ...m,
    id: `ad${i}`,
    channel_id: "ch",
  }));
  const slot = sheetPromotions(d, "content", period)[0].id;
  let created = 0;
  const create = async (r) => {
    created++;
    return { ...base, ...r, id: "new-promo" };
  };
  const cell = (key, value) => ({
    kind: key === "cost" ? "cost" : "metric",
    metric_id: d.metrics.find((m) => m.key === key)?.id,
    content_id: "content",
    promotion_id: slot,
    date: "2026-09-14",
    value,
  });
  const result = await resolveSheetCells(
    d,
    [cell("impressions", 1000), cell("clicks", 20), cell("cost", 10000)],
    create,
  );
  await resolveSheetCells(d, [cell("reactions", 5)], create);
  assert.equal(created, 1);
  assert.ok(result.every((c) => c.promotion_id === "new-promo"));
  d.values = result
    .filter((c) => c.kind === "metric")
    .map((c, i) => ({ ...base, ...c, id: `v${i}`, metric_date: c.date }));
  d.costs = [
    {
      ...base,
      ...source,
      id: "cost",
      promotion_id: "new-promo",
      expense_date: "2026-09-14",
      amount: 10000,
      category: "media",
      payment_status: "paid",
      grid_entry: true,
    },
  ];
  const metric = (key) =>
    metricValue(
      d,
      { ...row(d, key, "paid"), promotion_id: "new-promo" },
      period,
    ).value;
  assert.equal(metric("ctr"), 2);
  assert.equal(metric("cpc"), 500);
});

test("빈 광고 셀 삭제는 기록을 만들지 않고 일회성 채널만 시트에서 제외한다", async () => {
  const d = fixture();
  d.channels[0].measurement_template = "paid_ad";
  d.promotions = [];
  const cells = await resolveSheetCells(
    d,
    [
      {
        kind: "cost",
        content_id: "content",
        promotion_id: "sheet:empty",
        date: "2026-09-14",
        value: null,
      },
    ],
    async () => {
      throw new Error("should not create");
    },
  );
  assert.deepEqual(cells, []);
  assert.equal(isEventChannel({ name: "설명회 · 오프라인" }), true);
  assert.equal(isEventChannel({ name: "당근 광고" }), false);
  assert.equal(isEventChannel({ name: "인스타그램" }), false);
});
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

test("Carrot ad template keeps entered metrics and computed ratios", () => {
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

test("Business profile metrics stay separate from ads in the sheet and reports", () => {
  const d = fixture();
  d.metrics = metricTemplate("paid_ad").map((m, i) => ({
    ...base,
    ...m,
    id: `carrot${i}`,
    channel_id: "ch",
  }));
  const { metricsForContent } = require("../src/lib/domain.ts");
  const profile = {
    ...d.contents[0],
    id: "profile",
    title: "비즈프로필",
    content_type: "business_profile",
  };
  d.contents.push(profile);
  assert.deepEqual(
    metricsForContent(d.metrics, profile).map((m) => m.name),
    ["방문수", "단골수", "쿠폰 발급수"],
  );
  assert.ok(
    metricsForContent(d.metrics, d.contents[0]).every(
      (m) => m.scope === "paid",
    ),
  );
  const regulars = d.metrics.find((m) => m.key === "bizProfileRegulars");
  const visits = d.metrics.find((m) => m.key === "bizProfileVisits");
  d.values = [
    {
      ...base,
      id: "reg1",
      metric_id: regulars.id,
      content_id: "profile",
      promotion_id: null,
      metric_date: "2026-09-01",
      value: 12,
    },
    {
      ...base,
      id: "reg2",
      metric_id: regulars.id,
      content_id: "profile",
      promotion_id: null,
      metric_date: "2026-09-02",
      value: 10,
    },
    {
      ...base,
      id: "visit1",
      metric_id: visits.id,
      content_id: "profile",
      promotion_id: null,
      metric_date: "2026-09-01",
      value: 8,
    },
    {
      ...base,
      id: "visit2",
      metric_id: visits.id,
      content_id: "profile",
      promotion_id: null,
      metric_date: "2026-09-02",
      value: 9,
    },
  ];
  const r = report(d, period);
  const pm = r.metrics.filter((m) => m.content === "비즈프로필");
  assert.equal(pm.find((m) => m.metric === "단골수").value, 10);
  assert.equal(pm.find((m) => m.metric === "방문수").value, 17);
  assert.equal(pm.length, 3);
  assert.ok(
    r.metrics
      .filter((m) => m.content !== "비즈프로필")
      .every((m) => !["방문수", "단골수", "쿠폰 발급수"].includes(m.metric)),
  );
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
