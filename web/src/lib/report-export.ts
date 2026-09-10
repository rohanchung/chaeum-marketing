import * as XLSX from "xlsx";

export type ReportChannel = { id: string; name: string; channelType: string };
export type ReportMetric = {
  impressions: number | null;
  inflows: number | null;
  consultations: number | null;
  enrollments: number | null;
  spend: number | null;
  notes: string;
};
export type ReportTotals = {
  impressions: number;
  inflows: number;
  consultations: number;
  enrollments: number;
  spend: number;
};

type ReportInput = {
  periodLabel: string;
  channels: ReportChannel[];
  days: number[];
  totals: ReportTotals;
  getMetric: (channelId: string, day: number) => ReportMetric;
};

const value = (number: number | null) => number ?? 0;
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ]!,
  );

export function downloadExcelReport(input: ReportInput) {
  const channelRows = input.channels.map((channel) => {
    const rows = input.days.map((day) => input.getMetric(channel.id, day));
    return {
      채널: channel.name,
      구분: channel.channelType,
      노출: rows.reduce((sum, row) => sum + value(row.impressions), 0),
      유입: rows.reduce((sum, row) => sum + value(row.inflows), 0),
      상담: rows.reduce((sum, row) => sum + value(row.consultations), 0),
      등록: rows.reduce((sum, row) => sum + value(row.enrollments), 0),
      집행액: rows.reduce((sum, row) => sum + value(row.spend), 0),
    };
  });
  const dailyRows = input.channels.flatMap((channel) =>
    input.days.map((day) => {
      const metric = input.getMetric(channel.id, day);
      return {
        날짜: `${input.periodLabel} ${day}일`,
        채널: channel.name,
        노출: value(metric.impressions),
        유입: value(metric.inflows),
        상담: value(metric.consultations),
        등록: value(metric.enrollments),
        집행액: value(metric.spend),
        메모: metric.notes,
      };
    }),
  );
  const summary = [
    { 지표: "노출", 값: input.totals.impressions },
    { 지표: "유입", 값: input.totals.inflows },
    { 지표: "상담", 값: input.totals.consultations },
    { 지표: "등록", 값: input.totals.enrollments },
    { 지표: "집행액", 값: input.totals.spend },
  ];
  const workbook = XLSX.utils.book_new();
  const overview = XLSX.utils.aoa_to_sheet([
    ["채움영어학원 풍무캠퍼스 마케팅 보고서"],
    [input.periodLabel],
    [],
    ["핵심 지표", "값"],
  ]);
  XLSX.utils.sheet_add_json(overview, summary, { origin: "A5" });
  XLSX.utils.sheet_add_json(overview, channelRows, { origin: "A13" });
  overview["!cols"] = [
    { wch: 22 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
  ];
  const daily = XLSX.utils.json_to_sheet(dailyRows);
  daily["!cols"] = [
    { wch: 14 },
    { wch: 20 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 40 },
  ];
  XLSX.utils.book_append_sheet(workbook, overview, "요약");
  XLSX.utils.book_append_sheet(workbook, daily, "일별 원본");
  XLSX.writeFile(
    workbook,
    `채움_마케팅_${input.periodLabel.replaceAll(" ", "")}.xlsx`,
  );
}

export function openPrintableReport(input: ReportInput) {
  const funnelMax = Math.max(
    input.totals.impressions,
    input.totals.inflows,
    input.totals.consultations,
    input.totals.enrollments,
    1,
  );
  const funnel = [
    ["노출", input.totals.impressions],
    ["유입", input.totals.inflows],
    ["상담", input.totals.consultations],
    ["등록", input.totals.enrollments],
  ]
    .map(
      ([label, amount]) =>
        `<div class="funnel-row"><span>${label}</span><div class="bar"><i style="width:${((Number(amount) / funnelMax) * 100).toFixed(1)}%"></i></div><b>${Number(amount).toLocaleString()}</b></div>`,
    )
    .join("");
  const channelRows = input.channels
    .map((channel) => {
      const rows = input.days.map((day) => input.getMetric(channel.id, day));
      return `<tr><td>${escapeHtml(channel.name)}</td><td>${rows.reduce((sum, row) => sum + value(row.impressions), 0).toLocaleString()}</td><td>${rows.reduce((sum, row) => sum + value(row.inflows), 0).toLocaleString()}</td><td>${rows.reduce((sum, row) => sum + value(row.consultations), 0).toLocaleString()}</td><td>${rows.reduce((sum, row) => sum + value(row.enrollments), 0).toLocaleString()}</td><td>${rows.reduce((sum, row) => sum + value(row.spend), 0).toLocaleString()}원</td></tr>`;
    })
    .join("");
  const report = window.open("", "_blank");
  if (!report) return;
  report.opener = null;
  report.document.write(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>채움 마케팅 보고서</title><style>body{font-family:'Malgun Gothic',Arial,sans-serif;color:#1c2720;margin:36px}h1{font-size:24px;margin:0 0 6px}h2{font-size:16px;margin:22px 0 10px}.period{color:#68756d;margin:0 0 28px}.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:28px}.card{border:1px solid #dfe5dd;border-radius:8px;padding:12px}.label{font-size:12px;color:#68756d}.number{font-size:20px;font-weight:700;margin-top:6px}.funnel{max-width:620px}.funnel-row{display:grid;grid-template-columns:44px 1fr 64px;gap:10px;align-items:center;font-size:12px;margin:8px 0}.funnel-row b{text-align:right}.bar{height:12px;background:#edf2ed;border-radius:8px;overflow:hidden}.bar i{display:block;height:100%;background:#246b45;border-radius:8px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#246b45;color:white;text-align:left;padding:10px}td{padding:10px;border-bottom:1px solid #e3e8e2}td:not(:first-child){text-align:right}@page{size:A4 landscape;margin:12mm}@media print{body{margin:0}}</style></head><body><h1>채움영어학원 풍무캠퍼스 마케팅 보고서</h1><p class="period">${escapeHtml(input.periodLabel)} · 데이터 기준: 운영 시트 수기 입력</p><section class="cards"><div class="card"><div class="label">노출</div><div class="number">${input.totals.impressions.toLocaleString()}</div></div><div class="card"><div class="label">유입</div><div class="number">${input.totals.inflows.toLocaleString()}</div></div><div class="card"><div class="label">상담</div><div class="number">${input.totals.consultations.toLocaleString()}</div></div><div class="card"><div class="label">등록</div><div class="number">${input.totals.enrollments.toLocaleString()}</div></div><div class="card"><div class="label">집행액</div><div class="number">${input.totals.spend.toLocaleString()}원</div></div></section><h2>퍼널 추이</h2><section class="funnel">${funnel}</section><h2>채널별 성과</h2><table><thead><tr><th>채널</th><th>노출</th><th>유입</th><th>상담</th><th>등록</th><th>집행액</th></tr></thead><tbody>${channelRows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`,
  );
  report.document.close();
}
