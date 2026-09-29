import { Task, localDate } from "./domain";

/** Date helpers shared by the task page. Dates are Asia/Seoul calendar days. */
export const dateOnly = (value: string | null) =>
  value ? localDate(new Date(value)) : null;
export const dueTimestamp = (value: string) => `${value}T23:59:00+09:00`;
export const dateLabel = (value: string | null, today: string) => {
  const date = dateOnly(value);
  if (!date) return "날짜 미정";
  if (date < today) return "기한 초과";
  if (date === today) return "오늘";
  return date.slice(5).replace("-", "/");
};
export const compactDate = (value: string | null | undefined) => {
  const date = dateOnly(value ?? null);
  return date ? date.slice(5).replace("-", "/") : "—";
};
export const dayDistance = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
export const addDays = (value: string, amount: number) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
/** Recurring occurrences share their series record id. */
export const taskRecordId = (task: Task) => task.recurrence_template_id ?? task.id;
