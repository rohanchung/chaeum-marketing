import { Data, MetricRow, Period } from "./domain";

export const rankText = (value: number | null | undefined) =>
  value == null ? "—" : value === 0 ? "미노출" : `${value}위`;
export function parseRank(raw: string): number | null {
  const clean = raw.trim().replace(/위$/, "");
  if (!clean || clean === "—") return null;
  if (clean === "미노출") return 0;
  const value = Number(clean);
  if (!Number.isInteger(value) || value < 1)
    throw new Error(
      "순위는 1 이상의 정수로 입력하세요. 노출되지 않으면 ‘미노출’, 기록을 지우려면 빈칸으로 입력하세요.",
    );
  return value;
}
export function rankSummary(data: Data, row: MetricRow, period: Period) {
  const values = data.values
    .filter(
      (v) =>
        !v.deleted_at &&
        v.value !== null &&
        v.metric_id === row.metric?.id &&
        v.content_id === row.content_id &&
        v.promotion_id === row.promotion_id &&
        v.metric_date <= period.end,
    )
    .sort((a, b) => a.metric_date.localeCompare(b.metric_date));
  const current = values.filter((v) => v.metric_date >= period.start);
  const last = current.at(-1);
  if (!last) return "—";
  const previous = values[values.indexOf(last) - 1];
  let change = "";
  if (previous) {
    if (last.value === 0 && previous.value! > 0) change = "미노출 전환";
    else if (last.value! > 0 && previous.value === 0) change = "재노출";
    else {
      const delta = previous.value! - last.value!;
      change = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${-delta}` : "유지";
    }
  }
  const visible = current.filter((v) => v.value! > 0).map((v) => v.value!);
  const best = visible.length ? `최고 ${Math.min(...visible)}위` : "";
  return [rankText(last.value), change, best].filter(Boolean).join(" · ");
}
