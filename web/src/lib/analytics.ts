import {
  Activity,
  Cost,
  Customer,
  Data,
  MetricRow,
  Period,
  Report,
  Source,
  Summary,
  confirmed,
  dates,
  inPeriod,
  modeLabels,
  scopeLabels,
  metricsForContent,
} from "./domain";

const sum = (values: number[]) => values.reduce((a, b) => a + Number(b), 0);
const ratio = (a: number | null, b: number | null) =>
  a === null || b === null || b <= 0 ? null : a / b;
export function sourceChannel(d: Data, s: Source): string | null {
  const contentId =
    s.content_id ??
    d.promotions.find((p) => p.id === s.promotion_id)?.content_id;
  return (
    s.channel_id ??
    d.contents.find((c) => c.id === contentId)?.channel_id ??
    null
  );
}
export function sourceName(d: Data, s: Source): string {
  if (s.event_id)
    return d.events.find((e) => e.id === s.event_id)?.title ?? "이전 이벤트";
  if (s.promotion_id)
    return (
      d.promotions.find((p) => p.id === s.promotion_id)?.title ?? "이전 집행"
    );
  if (s.content_id)
    return d.contents.find((c) => c.id === s.content_id)?.title ?? "이전 소재";
  return d.channels.find((c) => c.id === s.channel_id)?.name ?? "공용 / 미확인";
}
export function metricValue(
  d: Data,
  row: MetricRow,
  p: Period,
  depth = 0,
): { value: number | null; observedOn: string | null } {
  if (depth > 2) return { value: null, observedOn: null };
  if (row.kind === "cost") {
    const items = d.costs.filter(
      (c) =>
        !c.deleted_at &&
        c.payment_status === "paid" &&
        c.promotion_id === row.promotion_id &&
        c.category === "media" &&
        inPeriod(c.expense_date, p),
    );
    return {
      value: items.length ? sum(items.map((c) => c.amount)) : null,
      observedOn: null,
    };
  }
  const metric = row.metric!;
  if (metric.mode === "ratio") {
    const operand = (key: string | null) =>
      key === "$spend"
        ? metricValue(d, { ...row, kind: "cost" }, p, depth + 1).value
        : (() => {
            const m = d.metrics.find(
              (m) =>
                m.channel_id === metric.channel_id &&
                m.scope === metric.scope &&
                m.key === key &&
                !m.deleted_at &&
                m.mode === "daily",
            );
            return m
              ? metricValue(d, { ...row, metric: m }, p, depth + 1).value
              : null;
          })();
    const n = ratio(operand(metric.numerator), operand(metric.denominator));
    return {
      value: n === null ? null : n * metric.multiplier,
      observedOn: null,
    };
  }
  const items = d.values
    .filter(
      (v) =>
        !v.deleted_at &&
        v.value !== null &&
        v.metric_id === metric.id &&
        v.content_id === row.content_id &&
        v.promotion_id === row.promotion_id &&
        inPeriod(v.metric_date, p),
    )
    .sort((a, b) => a.metric_date.localeCompare(b.metric_date));
  if (!items.length) return { value: null, observedOn: null };
  const last = items[items.length - 1];
  return {
    value:
      metric.mode === "daily"
        ? sum(items.map((v) => v.value!))
        : Number(last.value),
    observedOn: last.metric_date,
  };
}
export function summary(
  d: Data,
  p: Period,
  costs?: Cost[],
  customers?: Customer[],
): Summary {
  // Customer archival never removes actual payments from a financial report.
  const cs = customers ?? d.customers;
  const ids = new Set(cs.map((c) => c.id));
  const payments = d.payments.filter(
    (t) => !t.deleted_at && ids.has(t.customer_id) && inPeriod(t.paid_on, p),
  );
  const expenses = (costs ?? d.costs).filter(
    (c) =>
      !c.deleted_at &&
      c.payment_status === "paid" &&
      inPeriod(c.expense_date, p),
  );
  const spend = sum(expenses.map((c) => c.amount));
  const revenue = payments.length ? sum(payments.map((t) => t.amount)) : null;
  const costMissing = payments.filter((t) => t.service_cost === null).length;
  const serviceCost =
    payments.length && !costMissing
      ? sum(payments.map((t) => t.service_cost!))
      : null;
  const payers = new Set(
    payments.filter((t) => t.amount > 0).map((t) => t.customer_id),
  ).size;
  const funnel = (key: string) => {
    const items = d.metrics.filter(
      (m) =>
        m.scope === "funnel" &&
        !m.deleted_at &&
        (m.funnel_role === undefined
          ? ["kakao", "phone", "visit"].includes(m.key)
            ? "consultations"
            : m.key
          : m.funnel_role) === key,
    );
    const values = items.map(
      (m) =>
        metricValue(
          d,
          {
            id: m.id,
            label: m.name,
            metric: m,
            kind: "metric",
            content_id: null,
            promotion_id: null,
          },
          p,
        ).value,
    );
    return values.every((v) => v === null)
      ? null
      : sum(values.map((v) => v ?? 0));
  };
  const consultations = funnel("consultations");
  const cohort = cs.filter((c) => !c.deleted_at && inPeriod(c.consulted_on, p));
  const cohortEnrolled = cohort.filter(
    (c) => c.enrolled_on && c.enrolled_on <= p.end,
  ).length;
  const enrollments = funnel("enrollments");
  const confirmedEnrollments = cs.filter(
    (c) => !c.deleted_at && confirmed(c) && inPeriod(c.enrolled_on, p),
  ).length;
  return {
    spend,
    adSpend: sum(
      expenses.filter((c) => c.category === "media").map((c) => c.amount),
    ),
    revenue,
    serviceCost,
    costMissing,
    payments: payments.length,
    payers,
    aov: ratio(revenue, payers),
    roi:
      revenue !== null && serviceCost !== null
        ? ratio(revenue - serviceCost - spend, spend)
        : null,
    revenueToSpend: ratio(revenue, spend),
    inflows: funnel("inflows"),
    consultations,
    enrollments,
    cac: ratio(spend, enrollments),
    cohort: cohort.length,
    cohortEnrolled,
    conversion: ratio(cohortEnrolled, cohort.length),
    confirmedEnrollments,
    coverage: ratio(confirmedEnrollments, enrollments),
  };
}
export function report(d: Data, p: Period, annual = false): Report {
  const activity = (
    id: string,
    name: string,
    kind: string,
    costs: Cost[],
    customers: Customer[],
  ): Activity => {
    const s = summary(d, p, costs, customers);
    const n = customers.filter(
      (c) => !c.deleted_at && inPeriod(c.enrolled_on, p),
    ).length;
    return {
      id,
      name,
      kind,
      spend: s.spend,
      adSpend: s.adSpend,
      consultations: customers.filter(
        (c) => !c.deleted_at && inPeriod(c.consulted_on, p),
      ).length,
      enrollments: n,
      revenue: s.revenue,
      aov: s.aov,
      costPerEnrollment: ratio(s.spend, n),
      roi: s.roi,
      roas: kind === "집행" ? ratio(s.revenue, s.adSpend) : null,
    };
  };
  const confirmedCustomers = d.customers.filter(confirmed);
  const activities: Activity[] = [];
  d.channels.forEach((ch) => {
    activities.push(
      activity(
        ch.id,
        ch.name + (ch.deleted_at ? " · 휴지통" : ""),
        "채널",
        d.costs.filter((c) => sourceChannel(d, c) === ch.id),
        confirmedCustomers.filter((c) => sourceChannel(d, c) === ch.id),
      ),
    );
    d.contents
      .filter((c) => c.channel_id === ch.id)
      .forEach((c) => {
        const promoIds = new Set(
          d.promotions.filter((x) => x.content_id === c.id).map((x) => x.id),
        );
        const matches = (s: Source) =>
          s.content_id === c.id ||
          (s.promotion_id !== null && promoIds.has(s.promotion_id));
        activities.push(
          activity(
            c.id,
            c.title +
              (c.deleted_at
                ? " · 휴지통"
                : c.status === "archived"
                  ? " · 아카이브"
                  : ""),
            "소재",
            d.costs.filter(matches),
            confirmedCustomers.filter(matches),
          ),
        );
        d.promotions
          .filter((x) => x.content_id === c.id)
          .forEach((pr) =>
            activities.push(
              activity(
                pr.id,
                pr.title,
                "집행",
                d.costs.filter((c) => c.promotion_id === pr.id),
                confirmedCustomers.filter((c) => c.promotion_id === pr.id),
              ),
            ),
          );
      });
  });
  d.events.forEach((e) =>
    activities.push(
      activity(
        e.id,
        e.title,
        "이벤트",
        d.costs.filter((c) => c.event_id === e.id),
        confirmedCustomers.filter((c) => c.event_id === e.id),
      ),
    ),
  );
  activities.push(
    activity(
      "unassigned",
      "공용 비용 / 출처 미확인",
      "기타",
      d.costs.filter((c) => !sourceChannel(d, c) && !c.event_id),
      d.customers.filter((c) => !confirmed(c)),
    ),
  );
  const buckets = annual
    ? Array.from(
        { length: 12 },
        (_, i) => `${p.start.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`,
      )
    : dates(p);
  const trend = buckets.map((date) => {
    const period = annual
      ? { start: `${date}-01`, end: `${date}-31` }
      : { start: date, end: date };
    const s = summary(d, period);
    return {
      date,
      spend: s.spend,
      revenue: s.revenue,
      enrollments: s.enrollments,
    };
  });
  const metrics: Report["metrics"] = [];
  const push = (
    row: MetricRow,
    channel: string,
    content: string,
    promotion: string,
  ) => {
    const v = metricValue(d, row, p);
    metrics.push({
      channel,
      content,
      promotion,
      metric: row.label,
      scope: row.metric ? scopeLabels[row.metric.scope] : "광고비",
      aggregation: row.metric ? modeLabels[row.metric.mode] : "기간 합계",
      ...v,
    });
  };
  d.metrics
    .filter((m) => m.scope === "funnel" && !m.deleted_at)
    .forEach((m) =>
      push(
        {
          id: m.id,
          label: m.name,
          kind: "metric",
          metric: m,
          content_id: null,
          promotion_id: null,
        },
        "학원 전체",
        "",
        "",
      ),
    );
  d.channels
    .filter((c) => !c.deleted_at)
    .forEach((ch) =>
      d.contents
        .filter((c) => c.channel_id === ch.id && !c.deleted_at)
        .forEach((c) => {
          metricsForContent(d.metrics, c)
            .filter(
              (m) =>
                m.channel_id === ch.id && m.scope !== "paid" && !m.deleted_at,
            )
            .forEach((m) =>
              push(
                {
                  id: m.id,
                  label: m.name,
                  kind: "metric",
                  metric: m,
                  content_id: c.id,
                  promotion_id: null,
                },
                ch.name,
                c.title,
                "",
              ),
            );
          d.promotions
            .filter((pr) => pr.content_id === c.id && !pr.deleted_at)
            .forEach((pr) => {
              d.metrics
                .filter(
                  (m) =>
                    m.channel_id === ch.id &&
                    m.scope === "paid" &&
                    !m.deleted_at,
                )
                .forEach((m) =>
                  push(
                    {
                      id: m.id,
                      label: m.name,
                      kind: "metric",
                      metric: m,
                      content_id: c.id,
                      promotion_id: pr.id,
                    },
                    ch.name,
                    c.title,
                    pr.title,
                  ),
                );
              push(
                {
                  id: pr.id,
                  label: "광고비",
                  kind: "cost",
                  metric: null,
                  content_id: c.id,
                  promotion_id: pr.id,
                },
                ch.name,
                c.title,
                pr.title,
              );
            });
        }),
    );
  return {
    version: 3,
    generatedAt: new Date().toISOString(),
    period: p,
    summary: summary(d, p),
    activities,
    trend,
    metrics,
    notes: [
      "기간은 한국시간, 비용은 지급일, 매출은 실제 결제일 기준입니다. 빈 값은 미입력이며 0과 다릅니다.",
      "일일 학원 집계와 고객별 기록을 합산하지 않습니다. 고객별 출처 확인 기록은 전체의 일부일 수 있습니다.",
      "채널·소재·집행은 상하위 관계입니다. 활동별 행을 다시 합산하지 마세요. 광고 포함 전체 성과와 광고 성과도 합산하지 않습니다.",
      "객단가 = 순수납액 / 기간 내 양수 결제한 고유 고객 수. 매출 범위는 기록한 등록 관련 결제입니다.",
      "기간 ROI = (순수납액 - 서비스 원가 - 마케팅 비용) / 마케팅 비용. 원가 누락 시 미산출, 인과적 기여나 사업 순이익을 뜻하지 않습니다.",
      "ROAS는 집행을 주 출처로 확인한 매출 / 해당 집행 광고비입니다. 자연 유입·보조 접점에 매출을 임의 배분하지 않습니다.",
      "아카이브 성과는 포함, 휴지통 소재·채널 원본 성과는 제외합니다. 실제 지급·수납은 대상 삭제와 관계없이 원장 기준으로 보존합니다.",
      "누적 지표는 기간 중 마지막 관측값과 관측일을 표시합니다. 월간 신규 성과나 월간 고유 도달과 같지 않습니다.",
    ],
  };
}
