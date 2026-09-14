import { Metric } from "./domain";

export const compareMetrics = (a: Metric, b: Metric) =>
  a.sort_order - b.sort_order || a.id.localeCompare(b.id);
export function metricGroup(metrics: Metric[], target: Metric) {
  return metrics
    .filter(
      (m) =>
        !m.deleted_at &&
        m.channel_id === target.channel_id &&
        (m.scope === "channel") === (target.scope === "channel") &&
        (m.scope === "paid") === (target.scope === "paid") &&
        m.key.startsWith("bizProfile") === target.key.startsWith("bizProfile"),
    )
    .sort(compareMetrics);
}
export function moveMetric(
  metrics: Metric[],
  id: string,
  direction: -1 | 1,
): Metric[] {
  const target = metrics.find((m) => m.id === id && !m.deleted_at);
  if (!target) return [];
  const group = metricGroup(metrics, target);
  const from = group.findIndex((m) => m.id === id),
    to = from + direction;
  if (to < 0 || to >= group.length) return [];
  [group[from], group[to]] = [group[to], group[from]];
  return group.map((m, index) => ({ ...m, sort_order: index }));
}
