import { Cost, CostPurpose, Customer, Data, LtvSettings, Period, confirmed, inPeriod } from "./domain";
import { sourceChannel, summary } from "./analytics";

/**
 * Long-term unit economics for a tuition business: students pay every month,
 * so marketing is judged per student (CAC vs lifetime contribution), not by
 * comparing one month's spend with the same month's revenue.
 * Plan: docs/plan-20260929-ltv-marketing-cost.md
 */
export type LtvAssumptions = Pick<
  LtvSettings,
  "contribution_rate" | "retention_months" | "ltv_cap_months" | "target_ratio" | "target_payback_months"
>;

export const defaultLtvAssumptions: LtvAssumptions = {
  contribution_rate: 0.4,
  retention_months: 6,
  ltv_cap_months: 24,
  target_ratio: 3,
  target_payback_months: 3,
};

/** Months of history needed before measured retention replaces the assumption. */
export const MEASURED_RETENTION_MIN_MONTHS = 6;
/** Channels with fewer confirmed new students are shown but not judged. */
export const CHANNEL_MIN_SAMPLE = 5;
const DAYS_PER_MONTH = 30.4375;

const sum = (values: number[]) => values.reduce((a, b) => a + Number(b), 0);
const ratio = (a: number | null, b: number | null) =>
  a === null || b === null || b === 0 ? null : a / b;
const monthsBetween = (from: string, to: string) =>
  Math.max(0, (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000 / DAYS_PER_MONTH);
const monthKey = (date: string) => date.slice(0, 7);
const addMonths = (month: string, offset: number) => {
  const [year, value] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, value - 1 + offset, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
};
const monthEnd = (month: string) => {
  const [year, value] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(year, value, 0)).getUTCDate()).padStart(2, "0")}`;
};

export function ltvAssumptions(d: Data): LtvAssumptions {
  const row = d.ltvSettings.find((item) => !item.deleted_at);
  if (!row) return defaultLtvAssumptions;
  return {
    contribution_rate: Number(row.contribution_rate),
    retention_months: Number(row.retention_months),
    ltv_cap_months: Number(row.ltv_cap_months),
    target_ratio: Number(row.target_ratio),
    target_payback_months: Number(row.target_payback_months),
  };
}

export const costPurpose = (cost: Cost): CostPurpose => cost.cost_purpose ?? "acquisition";

const paidCosts = (d: Data, p: Period) =>
  d.costs.filter((c) => !c.deleted_at && c.payment_status === "paid" && inPeriod(c.expense_date, p));

export function spendByPurpose(d: Data, p: Period): Record<CostPurpose, number> {
  const costs = paidCosts(d, p);
  const of = (purpose: CostPurpose) => sum(costs.filter((c) => costPurpose(c) === purpose).map((c) => c.amount));
  return { acquisition: of("acquisition"), launch: of("launch"), retention: of("retention") };
}

const enrolledStudents = (customers: Customer[]) =>
  customers.filter((c) => !c.deleted_at && !!c.enrolled_on);

/** Average entered monthly tuition: students enrolled in the period first, else all enrolled students. */
export function averageMonthlyFee(customers: Customer[], p: Period) {
  const withFee = enrolledStudents(customers).filter((c) => c.monthly_fee != null);
  const inPeriodFees = withFee.filter((c) => inPeriod(c.enrolled_on, p));
  const pool = inPeriodFees.length ? inPeriodFees : withFee;
  return {
    value: pool.length ? sum(pool.map((c) => c.monthly_fee!)) / pool.length : null,
    count: pool.length,
    scope: inPeriodFees.length ? ("period" as const) : pool.length ? ("all" as const) : null,
  };
}

/**
 * Measured expected stay = 1 / monthly withdrawal rate, from student-months of
 * exposure. Only used once enough history exists; before that it is null.
 */
export function measuredRetention(customers: Customer[], today: string) {
  const students = enrolledStudents(customers).filter((c) => c.enrolled_on! <= today);
  if (!students.length) return { months: null, withdrawals: 0, exposureMonths: 0, observedMonths: 0 };
  const earliest = students.reduce((min, c) => (c.enrolled_on! < min ? c.enrolled_on! : min), today);
  const observedMonths = monthsBetween(earliest, today);
  const withdrawals = students.filter((c) => c.withdrawn_on && c.withdrawn_on <= today).length;
  const exposureMonths = sum(
    students.map((c) => monthsBetween(c.enrolled_on!, c.withdrawn_on && c.withdrawn_on <= today ? c.withdrawn_on : today)),
  );
  const enough = observedMonths >= MEASURED_RETENTION_MIN_MONTHS && exposureMonths > 0;
  return {
    months: enough ? (withdrawals ? exposureMonths / withdrawals : Number.POSITIVE_INFINITY) : null,
    withdrawals,
    exposureMonths,
    observedMonths,
  };
}

export type Verdict = "good" | "watch" | "review";
export function verdict(ltvToCac: number | null, target: number): Verdict | null {
  if (ltvToCac === null) return null;
  if (ltvToCac >= target) return "good";
  if (ltvToCac >= Math.min(2, target)) return "watch";
  return "review";
}

export function unitEconomics(d: Data, p: Period, today: string, a = ltvAssumptions(d)) {
  const spend = spendByPurpose(d, p);
  const s = summary(d, p);
  const customerEnrollments = enrolledStudents(d.customers).filter((c) => inPeriod(c.enrolled_on, p)).length;
  // The academy-wide funnel is the official count; customer records fill in when it is empty.
  const enrollments = s.enrollments ?? (customerEnrollments || null);
  const cac = ratio(spend.acquisition, enrollments);
  const fee = averageMonthlyFee(d.customers, p);
  const monthlyContribution = fee.value === null ? null : fee.value * a.contribution_rate;
  const measured = measuredRetention(d.customers, today);
  const retentionMonths = Math.min(measured.months ?? a.retention_months, a.ltv_cap_months);
  const ltvFor = (months: number) =>
    monthlyContribution === null ? null : monthlyContribution * Math.min(months, a.ltv_cap_months);
  const ltv = ltvFor(retentionMonths);
  const ltvToCac = ratio(ltv, cac);
  const scenarioMonths = [a.retention_months, a.retention_months * 2, a.retention_months * 3];
  return {
    assumptions: a,
    spend,
    enrollments,
    enrollmentsSource: s.enrollments !== null ? ("funnel" as const) : customerEnrollments ? ("customers" as const) : null,
    cac,
    fee,
    monthlyContribution,
    retention: { months: retentionMonths, source: measured.months === null ? ("assumed" as const) : ("measured" as const), measured },
    ltv,
    ltvToCac,
    payback: ratio(cac, monthlyContribution),
    verdict: verdict(ltvToCac, a.target_ratio),
    scenarios: scenarioMonths.map((months, index) => {
      const value = ltvFor(months);
      return {
        label: ["기본", "확장", "낙관"][index],
        months: Math.min(months, a.ltv_cap_months),
        ltv: value,
        ltvToCac: ratio(value, cac),
        cacCeiling: value === null ? null : value / a.target_ratio,
      };
    }),
  };
}

/**
 * Enrollment-month cohorts: new students of a month against that month's
 * acquisition spend, with cumulative contribution by months since enrollment.
 */
export function cohorts(d: Data, today: string, a = ltvAssumptions(d), maxMonths = 12) {
  const students = enrolledStudents(d.customers).filter((c) => c.enrolled_on! <= today);
  const months = [...new Set(students.map((c) => monthKey(c.enrolled_on!)))].sort();
  const current = monthKey(today);
  return months.map((month) => {
    const members = new Set(students.filter((c) => monthKey(c.enrolled_on!) === month).map((c) => c.id));
    const payments = d.payments.filter((t) => !t.deleted_at && members.has(t.customer_id));
    const spend = spendByPurpose(d, { start: `${month}-01`, end: monthEnd(month) }).acquisition;
    const elapsed: number[] = [];
    for (let k = 0; k < maxMonths && addMonths(month, k) <= current; k += 1) {
      const until = monthEnd(addMonths(month, k));
      elapsed.push(sum(payments.filter((t) => t.paid_on <= until).map((t) => t.amount)) * a.contribution_rate);
    }
    const recoveredAt = spend > 0 ? elapsed.findIndex((value) => value >= spend) : -1;
    return {
      month,
      newStudents: members.size,
      spend,
      cumulative: elapsed,
      recoveredAt: recoveredAt < 0 ? null : recoveredAt + 1,
    };
  });
}

/** Channel CAC over the three months ending with the period, confirmed sources only. */
export function channelEconomics(d: Data, p: Period, ltvPerStudent: number | null, a = ltvAssumptions(d)) {
  const endMonth = monthKey(p.end);
  const window = { start: `${addMonths(endMonth, -2)}-01`, end: monthEnd(endMonth) };
  const costs = paidCosts(d, window).filter((c) => costPurpose(c) === "acquisition");
  const students = enrolledStudents(d.customers).filter((c) => confirmed(c) && inPeriod(c.enrolled_on, window));
  return {
    window,
    rows: d.channels
      .filter((channel) => !channel.deleted_at)
      .map((channel) => {
        const spend = sum(costs.filter((c) => sourceChannel(d, c) === channel.id).map((c) => c.amount));
        const newStudents = students.filter((c) => sourceChannel(d, c) === channel.id).length;
        const cac = ratio(spend, newStudents);
        const ltvToCac = ratio(ltvPerStudent, cac);
        const enoughSample = newStudents >= CHANNEL_MIN_SAMPLE;
        return {
          id: channel.id,
          name: channel.name,
          spend,
          newStudents,
          cac,
          ltvToCac,
          enoughSample,
          verdict: enoughSample ? verdict(ltvToCac, a.target_ratio) : null,
        };
      })
      .filter((row) => row.spend > 0 || row.newStudents > 0)
      .sort((x, y) => y.spend - x.spend),
  };
}

/** One-off launch/branding investment against all contribution earned so far. */
export function launchRecovery(d: Data, today: string, a = ltvAssumptions(d)) {
  const launch = sum(
    d.costs
      .filter((c) => !c.deleted_at && c.payment_status === "paid" && costPurpose(c) === "launch" && c.expense_date <= today)
      .map((c) => c.amount),
  );
  const contribution =
    sum(d.payments.filter((t) => !t.deleted_at && t.paid_on <= today).map((t) => t.amount)) * a.contribution_rate;
  return { launch, contribution, recovered: ratio(contribution, launch) };
}
