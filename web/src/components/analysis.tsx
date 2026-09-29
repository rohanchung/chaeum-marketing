"use client";

import { useState } from "react";
import { Report, money, number, percent } from "@/lib/domain";
import { Kpis } from "./kpis";
import { DataTable } from "./ui";

export function Analysis({ report: r }: { report: Report }) {
  const s = r.summary;
  const [level, setLevel] = useState("채널");
  const max = Math.max(...r.trend.flatMap((t) => [t.spend, t.revenue ?? 0]), 1);
  const min = Math.min(0, ...r.trend.map((t) => t.revenue ?? 0));
  const y = (value: number) => 175 - (155 * (value - min)) / (max - min);
  const points = (key: "spend" | "revenue") =>
    r.trend
      .map(
        (t, i) =>
          `${20 + (i * 960) / Math.max(r.trend.length - 1, 1)},${y(t[key] ?? 0)}`,
      )
      .join(" ");
  return (
    <>
      <Kpis report={r} />
      <div className="analysis-grid">
        <section className="panel chart-panel">
          <div className="section-toolbar">
            <h2>지출과 매출의 흐름</h2>
            <span className="chart-legend">
              <i />
              매출 <i />
              비용
            </span>
          </div>
          <p>동일 기간의 추이 · 활동의 인과적 기여를 뜻하지 않습니다.</p>
          <svg
            viewBox="0 0 1000 205"
            role="img"
            aria-label="기간별 마케팅 비용과 순수납 매출 추이"
          >
            <line x1="20" y1={y(0)} x2="980" y2={y(0)} stroke="#dce5df" />
            <text x="20" y={y(0) - 5} fontSize="12" fill="#7b8d83">
              0원
            </text>
            <line x1="20" y1="95" x2="980" y2="95" stroke="#edf1ed" />
            {r.trend.some((t) => t.revenue !== null) && (
              <polyline
                fill="none"
                stroke="#287a56"
                strokeWidth="3"
                points={points("revenue")}
              />
            )}
            <polyline
              fill="none"
              stroke="#be884d"
              strokeWidth="3"
              points={points("spend")}
            />
            {r.trend
              .filter(
                (_, i) => i % Math.max(1, Math.floor(r.trend.length / 6)) === 0,
              )
              .map((t) => (
                <text
                  key={t.date}
                  x={
                    20 +
                    (r.trend.indexOf(t) * 960) / Math.max(r.trend.length - 1, 1)
                  }
                  y="200"
                  fontSize="13"
                  textAnchor="middle"
                  fill="#7b8d83"
                >
                  {t.date.slice(5)}
                </text>
              ))}
          </svg>
          <details>
            <summary>일별 / 월별 수치 보기</summary>
            <DataTable
              headers={["기간", "지급 비용", "순수납", "등록"]}
              rows={r.trend.map((t) => [
                t.date,
                money(t.spend),
                money(t.revenue),
                number(t.enrollments),
              ])}
            />
          </details>
        </section>
        <section className="panel funnel-panel">
          <small className="eyebrow">학원 전체 결과</small>
          <h2>유입부터 등록까지</h2>
          {[
            ["유입", s.inflows],
            ["상담 건수", s.consultations],
            ["신규 등록", s.enrollments],
          ].map(([label, value]) => (
            <div className="funnel-step" key={String(label)}>
              <span>{label}</span>
              <strong>{number(value as number | null)}</strong>
            </div>
          ))}
          <p>상담 건수에는 같은 사람의 여러 경로 상담이 포함될 수 있습니다.</p>
          <div className="funnel-foot">
            <span>확인 고객 상담→등록</span>
            <b>{percent(s.conversion)}</b>
            <small>
              기간 내 최초 상담 {s.cohort}명 중 종료일까지 등록{" "}
              {s.cohortEnrolled}명
            </small>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="section-toolbar">
          <div>
            <h2>활동별 비용과 확인 성과</h2>
            <p>고객 답변·직접 확인한 주 출처 기준. 미확인은 별도로 남깁니다.</p>
          </div>
          <select
            aria-label="분석 대상"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            {["채널", "소재", "집행", "이벤트", "기타"].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>
        <div className="coverage">
          <span>
            전체 신규 등록 <b>{number(s.enrollments)}명</b>
          </span>
          <span>
            출처 확인 <b>{s.confirmedEnrollments}명</b>
          </span>
          <span>
            확인률 <b>{percent(s.coverage)}</b>
          </span>
          {s.coverage !== null && s.coverage > 1 && (
            <strong>전체 등록 집계와 고객 기록을 대조하세요.</strong>
          )}
        </div>
        <DataTable
          headers={[
            "활동",
            "지급 비용",
            "확인 상담",
            "확인 등록",
            "확인 매출",
            "객단가",
            "확인 등록당 비용",
            ...(level === "집행" ? ["광고 ROAS"] : []),
          ]}
          rows={r.activities
            .filter((a) => a.kind === level)
            .map((a) => [
              a.name,
              money(a.spend),
              number(a.consultations),
              number(a.enrollments),
              money(a.revenue),
              money(a.aov),
              money(a.costPerEnrollment),
              ...(level === "집행" ? [number(a.roas, "배")] : []),
            ])}
        />
      </section>
      <details className="panel calculation-notes">
        <summary>계산 기준과 데이터 범위</summary>
        {r.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
      </details>
    </>
  );
}
