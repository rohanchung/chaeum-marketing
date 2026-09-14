import {
  Data,
  MetricRow,
  Period,
  Source,
  confirmed,
  scopeLabels,
} from "./domain";
import { metricValue, sourceChannel, summary } from "./analytics";

export type RollupTarget = {
  channelId?: string;
  contentId?: string;
  academy?: boolean;
};
export type RollupOption = { id: string; label: string; unit: string };
export function rollupOptions(
  rows: MetricRow[],
  finance = true,
): RollupOption[] {
  const metrics = new Map(
    rows.filter((r) => r.metric).map((r) => [r.metric!.id, r.metric!]),
  );
  return [
    ...Array.from(metrics.values()).map((m) => ({
      id: `metric:${m.id}`,
      label: `${scopeLabels[m.scope]} · ${m.name}`,
      unit: m.unit === "percent" ? "%" : m.unit === "currency" ? "원" : "",
    })),
    ...(finance ? [{ id: "spend", label: "마케팅 비용", unit: "원" }] : []),
  ];
}

export function rollupValue(
  data: Data,
  rows: MetricRow[],
  target: RollupTarget,
  selection: string,
  period: Period,
): number | null {
  if (target.academy) {
    const s = summary(data, period);
    const per = (n: number | null) =>
      n !== null && n > 0 ? s.spend / n : null;
    const values: Record<string, number | null> = {
      "academy:spend": s.spend,
      "academy:consultations": s.consultations,
      "academy:enrollments": s.enrollments,
      "academy:consultCost": per(s.consultations),
      "academy:enrollCost": per(s.enrollments),
    };
    return values[selection] ?? null;
  }
  if (selection === "spend" || selection === "roi") {
    const promoIds = new Set(
      data.promotions
        .filter((p) => p.content_id === target.contentId)
        .map((p) => p.id),
    );
    const matches = (source: Source) =>
      target.contentId
        ? source.content_id === target.contentId ||
          (source.promotion_id !== null && promoIds.has(source.promotion_id))
        : sourceChannel(data, source) === target.channelId;
    const result = summary(
      data,
      period,
      data.costs.filter(matches),
      data.customers.filter((c) => confirmed(c) && matches(c)),
    );
    return selection === "spend"
      ? result.spend
      : result.roi === null
        ? null
        : result.roi * 100;
  }
  const metric = data.metrics.find(
    (m) => `metric:${m.id}` === selection && !m.deleted_at,
  );
  if (!metric) return null;
  const sources = rows.filter((r) => r.metric?.id === metric.id);
  const sum = (values: (number | null)[]) =>
    values.every((v) => v === null)
      ? null
      : values.reduce<number>((s, v) => s + (v ?? 0), 0);
  if (metric.mode !== "ratio")
    return sum(sources.map((r) => metricValue(data, r, period).value));
  // Ratios use the combined raw counts, never the sum/average of child percentages.
  const operand = (key: string | null) => {
    if (key === "$spend")
      return sum(
        sources.map(
          (r) => metricValue(data, { ...r, kind: "cost" }, period).value,
        ),
      );
    const raw = data.metrics.find(
      (m) =>
        !m.deleted_at &&
        m.channel_id === metric.channel_id &&
        m.scope === metric.scope &&
        m.key === key &&
        m.mode === "daily",
    );
    return raw
      ? sum(
          sources.map(
            (r) => metricValue(data, { ...r, metric: raw }, period).value,
          ),
        )
      : null;
  };
  const n = operand(metric.numerator),
    d = operand(metric.denominator);
  return n === null || d === null || d <= 0
    ? null
    : (n / d) * metric.multiplier;
}
