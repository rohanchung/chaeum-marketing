import { Report, money, number, percent } from "@/lib/domain";

export function Kpis({
  report: r,
  compact = false,
}: {
  report: Report;
  compact?: boolean;
}) {
  const s = r.summary;
  const cards = compact
    ? [
        ["학원 유입", number(s.inflows), "전체 일일 집계"],
        ["상담 건수", number(s.consultations), "상담으로 분류한 학원 지표"],
        ["신규 등록", number(s.enrollments), "학원 전체"],
        ["마케팅 비용", money(s.spend), "지급 완료 기준"],
        ["순수납 매출", money(s.revenue), "등록 관련 결제 − 환불"],
      ]
    : [
        ["마케팅 비용", money(s.spend), `광고비 ${money(s.adSpend)}`],
        ["순수납 매출", money(s.revenue), `결제 고객 ${number(s.payers)}명`],
        ["객단가", money(s.aov), "순수납 / 결제 고객"],
        [
          "기간 마케팅 ROI",
          percent(s.roi),
          s.costMissing
            ? `서비스 원가 미입력 ${s.costMissing}건`
            : "원가·마케팅 비용 차감",
        ],
        [
          "전체 등록당 비용",
          money(s.cac),
          `전체 신규 등록 ${number(s.enrollments)}명`,
        ],
      ];
  return (
    <div className={`kpi-grid${compact ? " kpi-compact" : ""}`} aria-label="월간 핵심 성과">
      {cards.map(([label, value, hint], i) => (
        <article key={label} className={`kpi ${i === 3 ? "accent" : ""}`}>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{hint}</small>
        </article>
      ))}
    </div>
  );
}
