import { supabase } from "./supabase";
import { CellChange, Channel, Data, Metric, metricTemplate } from "./domain";
import { withMetricCosts } from "./metric-costs";
export const tables = {
  channels: "channels",
  contents: "contents",
  promotions: "mkt_promotions",
  metrics: "mkt_metrics",
  values: "mkt_values",
  events: "marketing_events",
  costs: "mkt_costs",
  customers: "mkt_customers",
  payments: "mkt_payments",
  snapshots: "report_snapshots",
} as const;
export type Collection = keyof typeof tables;
export async function fetchRows(table: string, workspace: string) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("workspace_id", workspace)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}
export async function loadData(workspace: string): Promise<Data> {
  const entries = await Promise.all(
    Object.entries(tables).map(async ([key, table]) => [
      key,
      await fetchRows(table, workspace),
    ]),
  );
  return withMetricCosts(Object.fromEntries(entries) as Data);
}
export async function saveRecord(
  workspace: string,
  collection: Collection,
  record: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from(tables[collection])
    .upsert({ ...record, workspace_id: workspace })
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("저장 결과를 확인하지 못했습니다.");
  return data;
}
export async function updateRecord(
  workspace: string,
  collection: Collection,
  id: string,
  patch: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from(tables[collection])
    .update(patch)
    .eq("workspace_id", workspace)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
export async function saveCells(workspace: string, cells: CellChange[]) {
  const { error } = await supabase.rpc("mkt_save_cells", {
    p_workspace: workspace,
    p_cells: cells,
  });
  if (error) throw new Error(error.message);
}
export async function saveMetricOrder(workspace: string, metrics: Metric[]) {
  if (!metrics.length) return;
  const { error } = await supabase.from("mkt_metrics").upsert(
    metrics.map((m) => ({
      id: m.id,
      workspace_id: workspace,
      channel_id: m.channel_id,
      key: m.key,
      name: m.name,
      scope: m.scope,
      unit: m.unit,
      mode: m.mode,
      numerator: m.numerator,
      denominator: m.denominator,
      multiplier: m.multiplier,
      sort_order: m.sort_order,
      deleted_at: m.deleted_at,
      include_in_marketing: m.include_in_marketing ?? false,
      funnel_role: m.funnel_role ?? null,
    })),
  );
  if (error) throw new Error(error.message);
}
export async function saveChannelOrder(workspace: string, channels: Channel[]) {
  if (!channels.length) return;
  const { error } = await supabase.from("channels").upsert(
    channels.map((c) => ({
      id: c.id,
      workspace_id: workspace,
      name: c.name,
      color: c.color,
      measurement_template: c.measurement_template,
      is_active: c.is_active,
      deleted_at: c.deleted_at,
      sort_order: c.sort_order,
    })),
  );
  if (error) throw new Error(error.message);
}
export async function saveChannel(
  workspace: string,
  channel: Record<string, unknown>,
) {
  const { error } = await supabase.rpc("mkt_save_channel", {
    p_workspace: workspace,
    p_channel: channel,
    p_metrics: metricTemplate(String(channel.measurement_template)),
  });
  if (error) throw new Error(error.message);
}
export async function saveAdContent(
  workspace: string,
  record: Record<string, unknown>,
) {
  const { initial_promotion, ...content } = record;
  const { error } = await supabase.rpc("mkt_create_ad_content", {
    p_workspace: workspace,
    p_content: content,
    p_promotion: initial_promotion,
  });
  if (error) throw new Error(error.message);
}
export async function exportBackup(workspace: string) {
  const extra = [
    "performance_records",
    "daily_funnel_records",
    "expenses",
    "leads",
    "consultations",
    "enrollments",
    "metric_definitions",
    "custom_metric_values",
    "audit_logs",
  ];
  const entries = await Promise.all(
    [...Object.values(tables), ...extra].map(async (table) => [
      table,
      await fetchRows(table, workspace),
    ]),
  );
  return {
    version: 3,
    workspace_id: workspace,
    exported_at: new Date().toISOString(),
    tables: Object.fromEntries(entries),
  };
}
export function downloadJSON(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
