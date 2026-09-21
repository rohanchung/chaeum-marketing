export type Base = {
  id: string;
  workspace_id: string;
  deleted_at: string | null;
};
export type Channel = Base & {
  sort_order?: number;
  name: string;
  color: string | null;
  measurement_template: string;
  is_active: boolean;
};
export type Content = Base & {
  created_at?: string;
  keyword_metric_ids?: string[] | null;
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
export function compareContentCreated(a: Content, b: Content) {
  const time = (c: Content) => {
    const value = Date.parse(c.created_at ?? "");
    return Number.isFinite(value) ? value : Infinity;
  };
  return time(a) - time(b) || a.id.localeCompare(b.id);
}
export const isSearchKeyword = (content: Content) =>
  content.content_type === "search_keyword";
export const metricsForContent = (metrics: Metric[], content: Content) =>
  metrics.filter(
    (m) =>
      !m.deleted_at &&
      m.scope !== "channel" &&
      m.channel_id === content.channel_id &&
      (isSearchKeyword(content)
        ? m.unit === "rank" &&
          (!content.keyword_metric_ids ||
            content.keyword_metric_ids.includes(m.id))
        : m.unit !== "rank") &&
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
export type Purchase = Base & {
  title: string;
  purchased_on: string;
  quantity: number;
  total_amount: number;
  notes: string | null;
};
export type EventItem = Base & {
  event_id: string;
  purchase_id: string;
  quantity: number;
};
export type Metric = Base & {
  include_in_marketing?: boolean;
  funnel_role?: "inflows" | "consultations" | "enrollments" | null;
  channel_id: string | null;
  key: string;
  name: string;
  scope: "funnel" | "channel" | "total" | "organic" | "paid";
  unit: "count" | "currency" | "percent" | "rank";
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
    purchase_id?: string;
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
export type WorkArea = Base & {
  name: string;
  description: string | null;
  color: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};
export type WorkProject = Base & {
  area_id: string;
  name: string;
  description: string | null;
  status: "active" | "completed" | "paused";
  priority: "low" | "normal" | "high";
  start_on: string | null;
  due_on: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};
export type TaskSource = "self" | "requested" | "recurring";
export type TaskStatus =
  | "requested"
  | "planned"
  | "in_progress"
  | "waiting"
  | "on_hold"
  | "done"
  | "cancelled";
export type TaskPriority = "low" | "normal" | "high";
export type Task = Base & {
  area_id: string | null;
  project_id: string | null;
  title: string;
  description: string | null;
  result: string | null;
  next_action: string | null;
  source_type: TaskSource;
  requester_name: string | null;
  requested_on: string | null;
  request_note: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  start_at: string | null;
  due_at: string | null;
  remind_at: string | null;
  completed_at: string | null;
  depends_on_task_id: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  recurrence_frequency: "daily" | "weekly" | "monthly" | null;
  recurrence_interval: number;
  recurrence_weekday: number | null;
  recurrence_until: string | null;
  recurrence_next_on: string | null;
  recurrence_active: boolean;
  occurrence_on?: string;
  recurrence_template_id?: string;
};
export type TaskOccurrence = {
  id: string;
  workspace_id: string;
  task_id: string;
  occurrence_on: string;
  status: "planned" | "done" | "skipped";
  completed_at: string | null;
  result: string | null;
  created_at?: string;
  updated_at?: string;
};
export type WorkLink = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  task_id: string | null;
  entity_type: "channel" | "content" | "promotion" | "event" | "purchase";
  entity_id: string;
  created_at?: string;
};
export type Data = {
  channels: Channel[];
  contents: Content[];
  promotions: Promotion[];
  metrics: Metric[];
  values: Observation[];
  events: MarketingEvent[];
  purchases: Purchase[];
  eventItems: EventItem[];
  costs: Cost[];
  customers: Customer[];
  payments: Payment[];
  snapshots: Snapshot[];
  workAreas: WorkArea[];
  workProjects: WorkProject[];
  tasks: Task[];
  workLinks: WorkLink[];
  taskOccurrences: TaskOccurrence[];
};
export const emptyData: Data = {
  channels: [],
  contents: [],
  promotions: [],
  metrics: [],
  values: [],
  events: [],
  purchases: [],
  eventItems: [],
  costs: [],
  customers: [],
  payments: [],
  snapshots: [],
  workAreas: [],
  workProjects: [],
  tasks: [],
  workLinks: [],
  taskOccurrences: [],
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
    unit?: Metric["unit"];
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
  channel: "채널 전체 · 소재 없이 기록",
  total: "전체 성과 · 광고 포함 가능",
  organic: "자연 유입",
  paid: "광고 성과",
};
export const modeLabels = {
  daily: "기간 합계 · 일별 신규 수 합산",
  cumulative: "누적 총수 · 마지막 값",
  latest: "최근 관측값",
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
    add("bizProfileRegulars", "단골수", "total");
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
