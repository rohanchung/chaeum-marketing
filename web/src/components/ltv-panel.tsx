"use client";

import { FormEvent, useState } from "react";
import { Data, Period, costPurposeLabels, money, number } from "@/lib/domain";
import {
  CHANNEL_MIN_SAMPLE,
  MEASURED_RETENTION_MIN_MONTHS,
  Verdict,
  channelEconomics,
  cohorts,
  defaultLtvAssumptions,
  launchRecovery,
  ltvAssumptions,
  unitEconomics,
} from "@/lib/ltv";
import { DataTable } from "./ui";

const verdictLabels: Record<Verdict, string> = { good: "적정", watch: "주의", review: "점검" };
const ratioText = (value: number | null) => (value === null ? "—" : `${number(Math.round(value * 10) / 10)} : 1`);
const monthsText = (value: number | null) =>
  value === null ? "—" : Number.isFinite(value) ? `${number(Math.round(value * 10) / 10)}개월` : "이탈 없음";
const VerdictBadge = ({ value }: { value: Verdict | null }) =>
  value ? <span className={`ltv-verdict ${value}`}>{verdictLabels[value]}</span> : null;

/**
 * 분석 > 장기 수익성: per-student unit economics for a monthly-tuition business.
 * Plan and defaults: docs/plan-20260929-ltv-marketing-cost.md
 */
export function LtvPanel({
  data,
  period,
  today,
  onOpenCustomers,
  onSaveSettings,
}: {
  data: Data;
  period: Period;
  today: string;
  onOpenCustomers: () => void;
  onSaveSettings: (record: Record<string, unknown>) => Promise<void>;
}) {
  const a = ltvAssumptions(data);
  const u = unitEconomics(data, period, today, a);
  const cohortRows = cohorts(data, today, a);
  const channels = channelEconomics(data, period, u.ltv, a);
  const launch = launchRecovery(data, today, a);
  const assumed = u.retention.source === "assumed";
  const cohortColumns = Math.max(0, ...cohortRows.map((row) => row.cumulative.length));

  return (
    <div className="ltv-panel">
      <p className="form-note">
        학생은 매달 수강료를 내므로, 이번 달 비용과 이번 달 매출을 맞대지 않고 <b>학생 한 명을 데려오는 비용(CAC)</b>과{" "}
        <b>그 학생이 다니는 동안 남기는 공헌이익(LTV)</b>을 비교합니다. 기간: {period.start} ~ {period.end}.
      </p>
      {u.fee.value === null && (
        <div className="ltv-callout" role="status">
          <span>
            학생 기록에 <b>월 수강료</b>가 아직 없어 LTV·회수 기간을 계산하지 않았습니다. 등록 학생의 월 수강료를 입력하면 바로 계산됩니다.
          </span>
          <button onClick={onOpenCustomers}>학생·전환 기록으로</button>
        </div>
      )}
      <div className="kpi-grid ltv-kpis">
        <article className="kpi">
          <span>등록당 획득비 (CAC)</span>
          <strong>{money(u.cac)}</strong>
          <small>
            신규 획득 비용 {money(u.spend.acquisition)} ÷ 신규 {number(u.enrollments)}명
            {u.enrollmentsSource === "customers" ? " (고객 기록)" : u.enrollmentsSource === "funnel" ? " (학원 퍼널)" : ""}
          </small>
        </article>
        <article className="kpi">
          <span>1인 월 공헌이익</span>
          <strong>{money(u.monthlyContribution)}</strong>
          <small>
            {u.fee.value === null
              ? "월 수강료 입력 필요"
              : `평균 수강료 ${money(Math.round(u.fee.value))} × ${number(a.contribution_rate * 100)}% · ${u.fee.count}명${u.fee.scope === "all" ? "(전체 기준)" : ""}`}
          </small>
        </article>
        <article className="kpi">
          <span>LTV (1인 생애 공헌이익)</span>
          <strong>{money(u.ltv === null ? null : Math.round(u.ltv))}</strong>
          <small>
            {assumed ? "가정" : "실측"} 유지 {monthsText(u.retention.months)}
            {assumed ? ` · ${MEASURED_RETENTION_MIN_MONTHS}개월 데이터 후 실측 전환` : ""}
          </small>
        </article>
        <article className="kpi accent">
          <span>LTV : CAC</span>
          <strong>
            {ratioText(u.ltvToCac)} <VerdictBadge value={u.verdict} />
          </strong>
          <small>목표 {number(a.target_ratio)} : 1 이상</small>
        </article>
        <article className="kpi">
          <span>CAC 회수 기간</span>
          <strong>{monthsText(u.payback)}</strong>
          <small>목표 {number(a.target_payback_months)}개월 이내</small>
        </article>
      </div>

      <div className="ltv-grid">
        <section className="panel">
          <div className="section-toolbar">
            <h2>유지 기간 시나리오</h2>
            <small>판단은 기본 시나리오 기준 · LTV 상한 {a.ltv_cap_months}개월</small>
          </div>
          <DataTable
            headers={["시나리오", "유지", "LTV", "LTV : CAC", `${number(a.target_ratio)}:1 기준 CAC 상한`]}
            rows={u.scenarios.map((s) => [
              <b key="label">{s.label}</b>,
              `${number(s.months)}개월`,
              money(s.ltv === null ? null : Math.round(s.ltv)),
              ratioText(s.ltvToCac),
              money(s.cacCeiling === null ? null : Math.round(s.cacCeiling)),
            ])}
          />
        </section>
        <section className="panel">
          <div className="section-toolbar">
            <h2>비용 성격</h2>
            <small>CAC에는 신규 획득만 포함</small>
          </div>
          <DataTable
            headers={["성격", "이번 기간 지급", "비고"]}
            rows={[
              [costPurposeLabels.acquisition, money(u.spend.acquisition), "등록당 획득비 계산에 사용"],
              [
                costPurposeLabels.launch,
                money(u.spend.launch),
                `누적 ${money(launch.launch)} · 공헌이익 회수 ${launch.recovered === null ? "—" : `${number(Math.round(launch.recovered * 100))}%`}`,
              ],
              [costPurposeLabels.retention, money(u.spend.retention), "재원생 대상 · CAC 제외"],
            ]}
          />
        </section>
      </div>

      <section className="panel">
        <div className="section-toolbar">
          <h2>등록월별 회수</h2>
          <small>그 달 신규 획득비 대비 그 달 등록 학생의 누적 공헌이익(실제 수납 × 공헌이익률)</small>
        </div>
        <DataTable
          headers={[
            "등록월",
            "신규",
            "획득비",
            ...Array.from({ length: cohortColumns }, (_, i) => `${i + 1}개월`),
            "회수",
          ]}
          rows={cohortRows.map((row) => [
            row.month,
            `${row.newStudents}명`,
            money(row.spend),
            ...Array.from({ length: cohortColumns }, (_, i) =>
              i < row.cumulative.length ? (
                <span key={i} className={row.spend > 0 && row.cumulative[i] >= row.spend ? "ltv-recovered" : ""}>
                  {money(Math.round(row.cumulative[i]))}
                </span>
              ) : (
                ""
              ),
            ),
            row.recoveredAt ? `${row.recoveredAt}개월 차` : row.spend > 0 ? "진행 중" : "—",
          ])}
        />
      </section>

      <section className="panel">
        <div className="section-toolbar">
          <h2>채널별 획득 효율</h2>
          <small>
            최근 3개월({channels.window.start} ~ {channels.window.end}) · 고객이 답했거나 직접 확인한 출처만 · 신규 {CHANNEL_MIN_SAMPLE}명 미만은 표본 부족
          </small>
        </div>
        <DataTable
          headers={["채널", "신규 획득비", "확인된 신규", "CAC", "LTV : CAC", "판단"]}
          rows={channels.rows.map((row) => [
            <b key="name">{row.name}</b>,
            money(row.spend),
            `${row.newStudents}명`,
            money(row.cac === null ? null : Math.round(row.cac)),
            ratioText(row.ltvToCac),
            row.enoughSample ? <VerdictBadge key="v" value={row.verdict} /> : <small key="s">표본 부족</small>,
          ])}
        />
      </section>

      <AssumptionForm
        key={JSON.stringify(a)}
        assumptions={a}
        settingsId={data.ltvSettings.find((row) => !row.deleted_at)?.id}
        onSave={onSaveSettings}
      />
    </div>
  );
}

function AssumptionForm({
  assumptions,
  settingsId,
  onSave,
}: {
  assumptions: ReturnType<typeof ltvAssumptions>;
  settingsId: string | undefined;
  onSave: (record: Record<string, unknown>) => Promise<void>;
}) {
  const [rate, setRate] = useState(String(assumptions.contribution_rate * 100));
  const [retention, setRetention] = useState(String(assumptions.retention_months));
  const [cap, setCap] = useState(String(assumptions.ltv_cap_months));
  const [target, setTarget] = useState(String(assumptions.target_ratio));
  const [payback, setPayback] = useState(String(assumptions.target_payback_months));
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const values = {
      contribution_rate: Number(rate) / 100,
      retention_months: Number(retention),
      ltv_cap_months: Math.round(Number(cap)),
      target_ratio: Number(target),
      target_payback_months: Number(payback),
    };
    if (
      !(values.contribution_rate > 0 && values.contribution_rate <= 1) ||
      !(values.retention_months > 0 && values.retention_months <= 120) ||
      !(values.ltv_cap_months > 0 && values.ltv_cap_months <= 120) ||
      !(values.target_ratio > 0) ||
      !(values.target_payback_months > 0)
    ) {
      setError("공헌이익률은 0~100%, 개월 수는 1~120, 목표값은 0보다 크게 입력하세요.");
      return;
    }
    setError("");
    await onSave({ ...(settingsId ? { id: settingsId } : {}), ...values });
  };
  const reset = () => {
    setRate(String(defaultLtvAssumptions.contribution_rate * 100));
    setRetention(String(defaultLtvAssumptions.retention_months));
    setCap(String(defaultLtvAssumptions.ltv_cap_months));
    setTarget(String(defaultLtvAssumptions.target_ratio));
    setPayback(String(defaultLtvAssumptions.target_payback_months));
  };
  return (
    <details className="panel ltv-settings">
      <summary>가정값 설정 · 공헌이익률 {number(assumptions.contribution_rate * 100)}% · 기대 유지 {number(assumptions.retention_months)}개월</summary>
      <form onSubmit={(event) => void submit(event)}>
        <label className="form-field">
          <span>공헌이익률 (%)</span>
          <input type="number" min={1} max={100} step={1} value={rate} onChange={(event) => setRate(event.target.value)} />
          <small>수강료 중 학생 수에 따라 늘어나는 비용(비율제 강사비, 교재, 로열티 등)을 뺀 몫</small>
        </label>
        <label className="form-field">
          <span>기대 유지 (개월)</span>
          <input type="number" min={1} max={120} step={1} value={retention} onChange={(event) => setRetention(event.target.value)} />
          <small>실측 데이터 {MEASURED_RETENTION_MIN_MONTHS}개월 이후에는 실제 퇴원율로 대체</small>
        </label>
        <label className="form-field">
          <span>LTV 상한 (개월)</span>
          <input type="number" min={1} max={120} step={1} value={cap} onChange={(event) => setCap(event.target.value)} />
        </label>
        <label className="form-field">
          <span>목표 LTV : CAC</span>
          <input type="number" min={0.5} step={0.5} value={target} onChange={(event) => setTarget(event.target.value)} />
        </label>
        <label className="form-field">
          <span>목표 회수 기간 (개월)</span>
          <input type="number" min={1} step={1} value={payback} onChange={(event) => setPayback(event.target.value)} />
        </label>
        {error && <p className="flow-error" role="alert">{error}</p>}
        <div className="ltv-settings-actions">
          <button type="button" onClick={reset}>기본값으로</button>
          <button className="primary" type="submit">가정값 저장</button>
        </div>
      </form>
    </details>
  );
}
