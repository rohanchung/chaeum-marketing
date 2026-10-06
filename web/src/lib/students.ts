import { Customer, Period, inPeriod } from "./domain";

/** Funnel roles whose day cells open a student list instead of a number input. */
export type StudentRole = "level_tests" | "enrollments";
export const studentRoles: StudentRole[] = ["level_tests", "enrollments"];

export const gradeOptions = [
  "초1", "초2", "초3", "초4", "초5", "초6",
  "중1", "중2", "중3",
  "고1", "고2", "고3",
];

export const studentName = (c: Customer) => c.student_name || c.reference_code;

const DAYS_PER_MONTH = 30.4375;
const monthsBetween = (from: string, to: string) =>
  Math.max(0, (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000 / DAYS_PER_MONTH);

/** Months a student has stayed: enrollment through withdrawal (or today). */
export function tenureMonths(c: Customer, today: string) {
  if (c.deleted_at || !c.enrolled_on || c.enrolled_on > today) return null;
  const until = c.withdrawn_on && c.withdrawn_on <= today ? c.withdrawn_on : today;
  return monthsBetween(c.enrolled_on, until);
}

/** Students on one funnel day for a role. */
export function studentsOn(customers: Customer[], role: StudentRole, date: string) {
  return customers.filter((c) =>
    !c.deleted_at && (role === "level_tests" ? c.level_test_on === date : c.enrolled_on === date),
  );
}

/** Level-tested students not enrolled yet, most recent test first. */
export function enrollmentCandidates(customers: Customer[]) {
  return customers
    .filter((c) => !c.deleted_at && !c.enrolled_on && !!c.level_test_on)
    .sort((a, b) => b.level_test_on!.localeCompare(a.level_test_on!));
}

/**
 * Student-level funnel for a period: level tests taken in the period and how
 * many of them enrolled by the period end, plus tenure of enrolled students.
 */
export function studentStats(customers: Customer[], p: Period, today: string) {
  const live = customers.filter((c) => !c.deleted_at);
  const tested = live.filter((c) => inPeriod(c.level_test_on ?? null, p));
  const testedEnrolled = tested.filter((c) => c.enrolled_on && c.enrolled_on <= p.end).length;
  const enrolled = live.filter((c) => !!c.enrolled_on && c.enrolled_on <= today);
  const active = enrolled.filter((c) => !c.withdrawn_on || c.withdrawn_on > today);
  const withdrawn = enrolled.length - active.length;
  const tenures = enrolled.map((c) => tenureMonths(c, today)!).filter((value) => value !== null);
  return {
    levelTests: tested.length,
    levelTestEnrolled: testedEnrolled,
    conversion: tested.length ? testedEnrolled / tested.length : null,
    enrolledInPeriod: live.filter((c) => inPeriod(c.enrolled_on, p)).length,
    active: active.length,
    withdrawn,
    averageTenure: tenures.length ? tenures.reduce((a, b) => a + b, 0) / tenures.length : null,
  };
}
