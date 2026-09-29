import { Data, Task, TaskStatus, timestamp } from "./domain";
import { dateOnly, dueTimestamp } from "./task-dates";
import { recurringDatesInRange } from "./task-recurrence";

export type SourceFilter = "all" | "requested" | "recurring";

/** A task's source is single-valued, so the source filter is a single choice. */
export function matchesSource(task: Task, filter: SourceFilter) {
  return filter === "all" || task.source_type === filter;
}

/** Open tasks first by due date and manual order; finished tasks sink to the bottom. */
export function compareBoardTasks(a: Task, b: Task) {
  const aDone = a.status === "done" || a.status === "cancelled";
  const bDone = b.status === "done" || b.status === "cancelled";
  if (aDone !== bDone) return aDone ? 1 : -1;
  const aDue = dateOnly(a.due_at) ?? dateOnly(a.start_at) ?? "9999-12-31";
  const bDue = dateOnly(b.due_at) ?? dateOnly(b.start_at) ?? "9999-12-31";
  return aDue.localeCompare(bDue) || a.sort_order - b.sort_order;
}

export type TodayBoard = {
  overdue: Task[];
  today: Task[];
  recurring: Task[];
  undated: Task[];
};

/**
 * Splits materialized tasks into the sections of the default task panel.
 * Each task lands in at most one section.
 */
export function todayBoard(tasks: Task[], today: string): TodayBoard {
  const board: TodayBoard = { overdue: [], today: [], recurring: [], undated: [] };
  for (const task of tasks) {
    if (task.deleted_at || task.status === "cancelled") continue;
    const done = task.status === "done";
    if (task.recurrence_template_id && task.occurrence_on) {
      if (task.occurrence_on === today) board.recurring.push(task);
      else if (!done && task.occurrence_on < today) board.overdue.push(task);
      continue;
    }
    const start = dateOnly(task.start_at);
    const due = dateOnly(task.due_at) ?? start;
    const first = start ?? due;
    if (!first || !due) {
      if (!done) board.undated.push(task);
      continue;
    }
    if (!done && due < today) board.overdue.push(task);
    else if (first <= today && today <= due) board.today.push(task);
  }
  board.overdue.sort(compareBoardTasks);
  board.today.sort(compareBoardTasks);
  board.recurring.sort(compareBoardTasks);
  board.undated.sort(compareBoardTasks);
  return board;
}

/**
 * Expands recurring series into dated occurrences (with their completion
 * state) next to the one-off tasks. Without a range, a series yields its open
 * occurrences from the earliest unfinished one through today.
 */
export function materializedTasks(
  data: Data,
  today: string,
  calendarRange?: { start: string; end: string },
): Task[] {
  const occurrences = new Map(
    data.taskOccurrences.map((occurrence) => [
      `${occurrence.task_id}:${occurrence.occurrence_on}`,
      occurrence,
    ]),
  );
  return data.tasks
    .filter((task) => !task.deleted_at)
    .flatMap((task): Task[] => {
      if (task.source_type !== "recurring" || !task.recurrence_frequency) return [task];
      // Without a calendar range, show the open occurrences from the earliest
      // unfinished one through today, so missed occurrences stay visible.
      const nextOn = task.recurrence_next_on;
      const range = calendarRange ?? (nextOn
        ? { start: nextOn, end: nextOn > today ? nextOn : today }
        : null);
      if (!range) return [];
      return recurringDatesInRange(task, range.start, range.end).map((occurrenceOn) => {
        const occurrence = occurrences.get(`${task.id}:${occurrenceOn}`);
        const status: TaskStatus = occurrence?.status === "done"
          ? "done"
          : occurrence?.status === "skipped"
            ? "cancelled"
            : "planned";
        return {
          ...task,
          id: `${task.id}:${occurrenceOn}`,
          recurrence_template_id: task.id,
          occurrence_on: occurrenceOn,
          start_at: timestamp(occurrenceOn),
          due_at: dueTimestamp(occurrenceOn),
          status,
          completed_at: occurrence?.completed_at ?? null,
        } as Task;
      });
    });
}
