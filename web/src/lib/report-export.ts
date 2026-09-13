import * as XLSX from "xlsx";
import { Report, money, number, percent } from "./domain";
export function summaryRows(r: Report) {
  const s = r.summary;
  return [
    ["마케팅 비용", money(s.spend)],
    ["광고비", money(s.adSpend)],
    ["순수납 매출", money(s.revenue)],
    ["결제 고객", number(s.payers, "명")],
    ["객단가", money(s.aov)],
    ["서비스 원가", money(s.serviceCost)],
    ["기간 마케팅 ROI", percent(s.roi)],
    ["매출 / 마케팅비", number(s.revenueToSpend, "배")],
    ["유입", number(s.inflows)],
    ["상담 건수", number(s.consultations)],
    ["전체 신규 등록", number(s.enrollments)],
    ["전체 등록당 비용", money(s.cac)],
    ["출처 확인 등록", number(s.confirmedEnrollments)],
    ["출처 확인률", percent(s.coverage)],
    ["확인 고객 상담→등록", percent(s.conversion)],
  ];
}
export function downloadExcelReport(r: Report) {
  const wb = XLSX.utils.book_new();
  const append = (name: string, rows: unknown[][]) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = Array.from(
      { length: Math.max(...rows.map((r) => r.length)) },
      () => ({ wch: 24 }),
    );
    XLSX.utils.book_append_sheet(wb, sheet, name);
    return sheet;
  };
  const s = r.summary;
  const rawSummary = [
    s.spend,
    s.adSpend,
    s.revenue,
    s.payers,
    s.aov,
    s.serviceCost,
    s.roi,
    s.revenueToSpend,
    s.inflows,
    s.consultations,
    s.enrollments,
    s.cac,
    s.confirmedEnrollments,
    s.coverage,
    s.conversion,
  ];
  const summarySheet = append("요약", [
    [`${r.period.start} ~ ${r.period.end}`],
    ...summaryRows(r).map(([label], i) => [label, rawSummary[i]]),
    [],
    ...r.notes.map((n) => [n]),
  ]);
  rawSummary.forEach((_, i) => {
    const cell = summarySheet[`B${i + 2}`];
    if (cell)
      cell.z = [6, 13, 14].includes(i)
        ? "0.0%"
        : [0, 1, 2, 4, 5, 11].includes(i)
          ? '#,##0"원"'
          : "#,##0.##";
  });
  const activitySheet = append("활동별 성과", [
    [
      "구분",
      "활동",
      "비용",
      "확인 상담",
      "확인 등록",
      "확인 매출",
      "객단가",
      "확인 등록당 비용",
      "ROI",
      "광고 ROAS",
    ],
    ...r.activities.map((a) => [
      a.kind,
      a.name,
      a.spend,
      a.consultations,
      a.enrollments,
      a.revenue,
      a.aov,
      a.costPerEnrollment,
      a.roi,
      a.roas,
    ]),
  ]);
  r.activities.forEach((_, i) => {
    const cell = activitySheet[`I${i + 2}`];
    if (cell) cell.z = "0.0%";
  });
  append("기간 추이", [
    ["기간", "비용", "순수납", "등록"],
    ...r.trend.map((t) => [t.date, t.spend, t.revenue, t.enrollments]),
  ]);
  append("채널 원본 지표", [
    [
      "채널",
      "소재",
      "집행",
      "지표",
      "측정 범위",
      "집계 기준",
      "값",
      "마지막 관측일",
    ],
    ...r.metrics.map((m) => [
      m.channel,
      m.content,
      m.promotion,
      m.metric,
      m.scope,
      m.aggregation,
      m.value,
      m.observedOn,
    ]),
  ]);
  XLSX.writeFile(wb, `채움_마케팅_${r.period.start}_${r.period.end}.xlsx`);
}
const esc = (v: unknown) =>
  String(v ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function printableHTML(r: Report) {
  const table = (head: string[], rows: unknown[][]) =>
    `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const max = Math.max(
    ...r.trend.map((t) => Math.max(t.spend, Math.abs(t.revenue ?? 0))),
    1,
  );
  const chart = r.trend
    .map(
      (t) =>
        `<div class="barrow"><span>${esc(t.date)}</span><div><i style="width:${(100 * t.spend) / max}%;background:#ba793a"></i><i style="width:${(100 * Math.abs(t.revenue ?? 0)) / max}%;background:${(t.revenue ?? 0) < 0 ? "#b34242" : "#247a58"}"></i></div><small>${esc(money(t.spend))} / ${esc(money(t.revenue))}${(t.revenue ?? 0) < 0 ? " (순환불)" : ""}</small></div>`,
    )
    .join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>채움 마케팅 보고서</title><style>body{font:12px Arial,'Malgun Gothic',sans-serif;color:#243b32;margin:28px}h1{font-size:26px}h2{font-size:17px;margin-top:28px}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}th{background:#ecf4ef}tr{break-inside:avoid}small{color:#576b60}.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.card{padding:14px;border:1px solid #ddd;border-radius:8px}.card strong{display:block;font-size:18px;margin-top:8px}.barrow{display:grid;grid-template-columns:95px 1fr 190px;gap:10px;margin:6px 0}.barrow i{display:block;height:5px;min-width:0;margin:2px 0}@page{size:A4 landscape;margin:12mm} @media print{button{display:none}thead{display:table-header-group}}</style></head><body><button onclick="window.print()">인쇄 / PDF로 저장</button><h1>채움 마케팅 · 기간 보고서</h1><p>${esc(r.period.start)} ~ ${esc(r.period.end)} · 생성 ${esc(r.generatedAt)}</p><div class="cards">${summaryRows(
    r,
  )
    .map(
      ([k, v]) => `<div class="card">${esc(k)}<strong>${esc(v)}</strong></div>`,
    )
    .join(
      "",
    )}</div><h2>비용·매출 추이</h2><p>갈색: 마케팅 비용 · 초록: 순수납 매출 · 빨강: 순환불(절댓값 길이). 같은 시점의 추이이며 인과적 기여가 아닙니다.</p>${chart}<h2>활동별 확인 성과</h2>${table(
    ["구분", "활동", "비용", "확인 등록", "확인 매출", "객단가", "기간 ROI"],
    r.activities.map((a) => [
      a.kind,
      a.name,
      money(a.spend),
      a.enrollments,
      money(a.revenue),
      money(a.aov),
      percent(a.roi),
    ]),
  )}<h2>채널 원본 지표</h2>${table(
    ["채널", "소재 / 집행", "지표", "범위", "집계", "값", "관측일"],
    r.metrics.map((m) => [
      m.channel,
      `${m.content} ${m.promotion}`,
      m.metric,
      m.scope,
      m.aggregation,
      number(m.value),
      m.observedOn,
    ]),
  )}<h2>계산 기준</h2>${r.notes.map((n) => `<p>${esc(n)}</p>`).join("")}</body></html>`;
}
export function openPrintableReport(r: Report) {
  const w = window.open("", "_blank");
  if (!w) throw new Error("팝업을 허용한 후 다시 시도하세요.");
  w.opener = null;
  w.document.write(printableHTML(r));
  w.document.close();
}
