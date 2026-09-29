import { Task, localDate } from "./domain";

export type SourceFilter = "all" | "requested" | "recurring";

const dateOnly = (value: string | null) => (value ? localDate(new Date(value)) : null);

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
