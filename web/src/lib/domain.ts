export type Base = {
  id: string;
  workspace_id: string;
  deleted_at: string | null;
};
export type Channel = Base & {
  name: string;
  color: string | null;
  measurement_template: string;
  is_active: boolean;
};
export type Content = Base & {
  channel_id: string | null;
  title: string;
  status: string;
  published_at: string | null;
  url: string | null;
  notes: string | null;
  content_type: string;
  archived_at: string | null;
};
export const isBusinessProfile = (content: Content) =>
  content.content_type === "business_profile";
export const metricsForContent = (metrics: Metric[], content: Content) =>
  metrics.filter(
    (m) =>
      !m.deleted_at &&
      m.channel_id === content.channel_id &&
      (isBusinessProfile(content)
        ? m.key.startsWith("bizProfile")
        : !m.key.startsWith("bizProfile")),
  );
export type Promotion = Base & {
  content_id: string;
  title: string;
  start_date: string;
  end_date: string;
  notes: string | null;
};
export type MarketingEvent = Base & {
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  notes: string | null;
  status: string;
  event_type: string;
};
export type Metric = Base & {
  include_in_marketing?: boolean;
  funnel_role?: "inflows" | "consultations" | "enrollments" | null;
  channel_id: string | null;
  key: string;
  name: string;
  scope: "funnel" | "total" | "organic" | "paid";
  unit: "count" | "currency" | "percent";
  mode: "daily" | "cumulative" | "latest" | "ratio";
  numerator: string | null;
  denominator: string | null;
  multiplier: number;
  sort_order: number;
};
export type Observation = Base & {
  metric_id: string;
  content_id: string | null;
  promotion_id: string | null;
  metric_date: string;
  value: number | null;
  notes: string | null;
};
export type Source = {
  channel_id: string | null;
  content_id: string | null;
  promotion_id: string | null;
  event_id: string | null;
};
export type Cost = Base &
  Source & {
    metric_value_id?: string;
    expense_date: string;
    category: string;
    amount: number;
    payment_status: string;
    title: string;
    notes: string | null;
    grid_entry: boolean;
  };
export type Customer = Base &
  Source & {
    reference_code: string;
    consulted_on: string;
    enrolled_on: string | null;
    confidence: "reported" | "direct" | "inferred" | "unknown";
    notes: string | null;
  };
export type Payment = Base & {
  customer_id: string;
  paid_on: string;
  amount: number;
  service_cost: number | null;
  adjusts_id: string | null;
  notes: string | null;
};
export type Snapshot = {
  id: string;
  title: string;
  period_start: string;
  period_end: string;
  created_at: string;
  snapshot: Report;
};
export type Data = {
  channels: Channel[];
  contents: Content[];
  promotions: Promotion[];
  metrics: Metric[];
  values: Observation[];
  events: MarketingEvent[];
  costs: Cost[];
  customers: Customer[];
  payments: Payment[];
  snapshots: Snapshot[];
};
export const emptyData: Data = {
  channels: [],
  contents: [],
  promotions: [],
  metrics: [],
  values: [],
  events: [],
  costs: [],
  customers: [],
  payments: [],
  snapshots: [],
};
export type Period = { start: string; end: string };
export type MetricRow = {
  id: string;
  label: string;
  content_id: string | null;
  promotion_id: string | null;
  metric: Metric | null;
  kind: "metric" | "cost";
  start?: string;
  end?: string;
};
export type CellChange = {
  kind: "metric" | "cost";
  metric_id?: string;
  content_id: string | null;
  promotion_id: string | null;
  date: string;
  value: number | null;
};
export type Summary = {
  spend: number;
  adSpend: number;
  revenue: number | null;
  serviceCost: number | null;
  roi: number | null;
  revenueToSpend: number | null;
  aov: number | null;
  payers: number;
  payments: number;
  costMissing: number;
  inflows: number | null;
  consultations: number | null;
  enrollments: number | null;
  cac: number | null;
  cohort: number;
  cohortEnrolled: number;
  conversion: number | null;
  confirmedEnrollments: number;
  coverage: number | null;
};
export type Activity = {
  id: string;
  name: string;
  kind: string;
  spend: number;
  adSpend: number;
  consultations: number;
  enrollments: number;
  revenue: number | null;
  aov: number | null;
  costPerEnrollment: number | null;
  roi: number | null;
  roas: number | null;
};
export type Report = {
  version: 3;
  generatedAt: string;
  period: Period;
  summary: Summary;
  activities: Activity[];
  trend: {
    date: string;
    spend: number;
    revenue: number | null;
    enrollments: number | null;
  }[];
  metrics: {
    channel: string;
    content: string;
    promotion: string;
    metric: string;
    scope: string;
    aggregation: string;
    value: number | null;
    observedOn: string | null;
  }[];
  notes: string[];
};
export const scopeLabels = {
  funnel: "학원 전체",
  total: "전체 성과 · 광고 포함 가능",
  organic: "자연 유입",
  paid: "광고 성과",
};
export const modeLabels = {
  daily: "기간 합계",
  cumulative: "마지막 누적",
  latest: "마지막 관측",
  ratio: "원시값 재계산",
};
export const categories: Record<string, string> = {
  media: "광고비",
  production: "제작비",
  goods: "굿즈",
  event: "이벤트",
  agency: "대행료",
  other: "공용·기타",
};
export const number = (v: number | null | undefined, suffix = "") =>
  v == null
    ? "—"
    : `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(v)}${suffix}`;
export const money = (v: number | null | undefined) => number(v, "원");
export const percent = (v: number | null | undefined) =>
  v == null ? "—" : number(v * 100, "%");
export const localDate = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const datePart = (v: string | null) => (v ? localDate(new Date(v)) : "");
export const timestamp = (date: string) => `${date}T12:00:00+09:00`;
export function monthPeriod(month: string): Period {
  const [y, m] = month.split("-").map(Number);
  return {
    start: `${month}-01`,
    end: `${month}-${new Date(y, m, 0).getDate()}`,
  };
}
export function dates(period: Period) {
  const result: string[] = [];
  for (
    const d = new Date(`${period.start}T00:00:00Z`);
    d.toISOString().slice(0, 10) <= period.end;
    d.setUTCDate(d.getUTCDate() + 1)
  )
    result.push(d.toISOString().slice(0, 10));
  return result;
}
export const inPeriod = (date: string | null, p: Period) =>
  date !== null && date >= p.start && date <= p.end;
export const confirmed = (c: Customer) =>
  c.confidence === "direct" || c.confidence === "reported";

type Seed = Pick<
  Metric,
  | "key"
  | "name"
  | "scope"
  | "mode"
  | "unit"
  | "numerator"
  | "denominator"
  | "multiplier"
  | "sort_order"
>;
export function metricTemplate(template: string): Seed[] {
  const result: Seed[] = [];
  const add = (
    key: string,
    name: string,
    scope: Metric["scope"],
    mode: Metric["mode"] = "daily",
    unit: Metric["unit"] = "count",
    numerator: string | null = null,
    denominator: string | null = null,
    multiplier = 100,
  ) =>
    result.push({
      key,
      name,
      scope,
      mode,
      unit,
      numerator,
      denominator,
      multiplier,
      sort_order: result.length,
    });
  if (template === "social_content")
    for (const [k, n] of [
      ["views", "조회수"],
      ["reach", "도달"],
      ["likes", "좋아요"],
      ["comments", "댓글"],
      ["saves", "저장"],
      ["shares", "공유"],
      ["profileVisits", "프로필 방문"],
      ["linkClicks", "외부 링크 누름"],
      ["addressClicks", "비즈니스 주소 누름"],
    ])
      add(k, n, "total", "cumulative");
  else if (template === "blog_content") {
    add("views", "조회수", "total", "daily");
    add("likes", "공감", "total", "cumulative");
    add("comments", "댓글", "total", "cumulative");
  }
  if (!["social_content", "paid_ad", "search_ad"].includes(template))
    return result;
  for (const [k, n] of [
    ["impressions", "노출수"],
    ["clicks", "클릭수"],
    ["reactions", "반응수"],
  ])
    add(k, n, "paid");
  if (template === "paid_ad") {
    add("bizProfileVisits", "방문수", "total");
    add("bizProfileRegulars", "단골수", "total", "latest");
    add("bizProfileCoupons", "쿠폰 발급수", "total");
  }
  add("ctr", "클릭률", "paid", "ratio", "percent", "clicks", "impressions");
  add("cpc", "클릭당 비용", "paid", "ratio", "currency", "$spend", "clicks", 1);
  add(
    "reactionCost",
    "반응당 비용",
    "paid",
    "ratio",
    "currency",
    "$spend",
    "reactions",
    1,
  );
  return result;
}
