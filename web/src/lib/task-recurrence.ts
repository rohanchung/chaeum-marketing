import { Task } from "./domain";

const toDate = (value: string) => new Date(`${value}T12:00:00Z`);
const dateText = (value: Date) => value.toISOString().slice(0, 10);
const MAX_OCCURRENCES = 10_000;

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

/** First occurrence of the series. Every later occurrence is derived from this date. */
export function recurrenceAnchor(task: Task) {
  return task.start_at?.slice(0, 10) ?? task.recurrence_next_on ?? null;
}

/**
 * Returns every occurrence of the series inside the range, including completed
 * and missed ones, so completion history stays visible on the calendar.
 */
export function recurringDatesInRange(task: Task, start: string, end: string) {
  if (!task.recurrence_frequency) return [];
  let occurrenceOn = recurrenceAnchor(task);
  if (occurrenceOn && task.recurrence_until && occurrenceOn > task.recurrence_until) return [];
  const result: string[] = [];
  let safety = 0;
  while (occurrenceOn && occurrenceOn <= end && safety < MAX_OCCURRENCES) {
    if (occurrenceOn >= start) result.push(occurrenceOn);
    occurrenceOn = nextTaskOccurrence(task, occurrenceOn);
    safety += 1;
  }
  return result;
}

/** Earliest occurrence that is not completed yet, or null when the series is finished. */
export function firstOpenOccurrence(task: Task, doneDates: ReadonlySet<string>) {
  if (!task.recurrence_frequency) return null;
  let occurrenceOn = recurrenceAnchor(task);
  if (occurrenceOn && task.recurrence_until && occurrenceOn > task.recurrence_until) return null;
  let safety = 0;
  while (occurrenceOn && safety < MAX_OCCURRENCES) {
    if (!doneDates.has(occurrenceOn)) return occurrenceOn;
    occurrenceOn = nextTaskOccurrence(task, occurrenceOn);
    safety += 1;
  }
  return null;
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
