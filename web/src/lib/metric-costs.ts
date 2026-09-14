import { Cost, Data } from "./domain";

// Project opted-in daily expense observations into the ledger, without copying money.
export function withMetricCosts(data: Data): Data {
  const costs: Cost[] = data.values.flatMap((v) => {
    const metric = data.metrics.find((m) => m.id === v.metric_id);
    if (
      !metric?.include_in_marketing ||
      metric.unit !== "currency" ||
      metric.mode !== "daily" ||
      v.deleted_at ||
      v.value === null
    )
      return [];
    return [
      {
        id: `metric-value:${v.id}`,
        workspace_id: v.workspace_id,
        deleted_at: null,
        metric_value_id: v.id,
        expense_date: v.metric_date,
        amount: Number(v.value),
        title: metric.name,
        notes: "운영 시트 비용 지표",
        category: "other",
        payment_status: "paid",
        grid_entry: false,
        channel_id: v.content_id || v.promotion_id ? null : metric.channel_id,
        content_id: v.promotion_id ? null : v.content_id,
        promotion_id: v.promotion_id,
        event_id: null,
      },
    ];
  });
  return {
    ...data,
    costs: [...data.costs.filter((c) => !c.metric_value_id), ...costs],
  };
}
