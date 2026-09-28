import { Task } from "./domain";

const toDate = (value: string) => new Date(`${value}T12:00:00Z`);
const dateText = (value: Date) => value.toISOString().slice(0, 10);

export function nextTaskOccurrence(task: Task, occurrenceOn: string) {
  if (!task.recurrence_frequency) return null;
  const next = toDate(occurrenceOn);
  const interval = Math.max(1, task.recurrence_interval || 1);
  if (task.recurrence_frequency === "daily") next.setUTCDate(next.getUTCDate() + interval);
  else if (task.recurrence_frequency === "weekly") next.setUTCDate(next.getUTCDate() + interval * 7);
  else {
    const day = task.start_at
      ? toDate(task.start_at.slice(0, 10)).getUTCDate()
      : next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + interval);
    const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, last));
  }
  const result = dateText(next);
  return task.recurrence_until && result > task.recurrence_until ? null : result;
}

/** Returns the unsaved recurrence instances that belong in the requested calendar range. */
export function recurringDatesInRange(task: Task, start: string, end: string) {
  if (!task.recurrence_frequency || !task.recurrence_active) return [];
  let occurrenceOn = task.recurrence_next_on ?? task.start_at?.slice(0, 10) ?? null;
  const result: string[] = [];
  let safety = 0;
  while (occurrenceOn && occurrenceOn <= end && safety < 10_000) {
    if (occurrenceOn >= start) result.push(occurrenceOn);
    occurrenceOn = nextTaskOccurrence(task, occurrenceOn);
    safety += 1;
  }
  return result;
}

export function recurrenceText(task: Task) {
  if (!task.recurrence_frequency) return "";
  const unit = task.recurrence_frequency === "daily"
    ? "일"
    : task.recurrence_frequency === "weekly"
      ? "주"
      : "개월";
  return task.recurrence_interval > 1
    ? `${task.recurrence_interval}${unit}마다`
    : `매${unit}`;
}
