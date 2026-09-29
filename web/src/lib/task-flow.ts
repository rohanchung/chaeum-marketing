import { Task, TaskStatus, timestamp } from "./domain";
import { dateOnly, dueTimestamp } from "./task-dates";

/**
 * The flow page edits a project's tasks as a branching tree: each task has at
 * most one "앞 일" (depends_on_task_id) and any number of following tasks.
 * Edits stay in a local draft until saved, then become one bulk upsert.
 */
export type FlowNode = {
  id: string;
  title: string;
  startOn: string | null;
  dueOn: string | null;
  parentId: string | null;
  status: TaskStatus;
  /** Kept from the saved task so saving never rewrites an earlier completion time. */
  completedAt: string | null;
  areaId: string | null;
  sortOrder: number;
  isNew: boolean;
  deleted: boolean;
};
export type FlowDraft = FlowNode[];

export function draftFromTasks(tasks: Task[], projectId: string | null): FlowDraft {
  return tasks
    .filter((task) => !task.deleted_at && (task.project_id ?? null) === projectId)
    .map((task) => ({
      id: task.id,
      title: task.title,
      startOn: dateOnly(task.start_at),
      dueOn: dateOnly(task.due_at),
      parentId: task.depends_on_task_id,
      status: task.status,
      completedAt: task.completed_at,
      areaId: task.area_id,
      sortOrder: task.sort_order,
      isNew: false,
      deleted: false,
    }));
}

const live = (draft: FlowDraft) => draft.filter((node) => !node.deleted);

/** True when making `parentId` the 앞 일 of `nodeId` would close a loop. */
export function wouldCycle(draft: FlowDraft, nodeId: string, parentId: string | null) {
  const byId = new Map(draft.map((node) => [node.id, node]));
  const seen = new Set<string>();
  let current = parentId;
  while (current && !seen.has(current)) {
    if (current === nodeId) return true;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

const nextSortOrder = (draft: FlowDraft, parentId: string | null) =>
  Math.max(0, ...live(draft).filter((node) => node.parentId === parentId).map((node) => node.sortOrder)) + 100;

const newNode = (id: string, parentId: string | null, date: string | null, sortOrder: number): FlowNode => ({
  id,
  title: "",
  startOn: date,
  dueOn: date,
  parentId,
  status: "planned",
  completedAt: null,
  areaId: null,
  sortOrder,
  isNew: true,
  deleted: false,
});

/** A new task that starts a separate branch in the project. */
export function addRoot(draft: FlowDraft, id: string, date: string | null): FlowDraft {
  return [...draft, newNode(id, null, date, nextSortOrder(draft, null))];
}

/** A new 뒤 일 after `parentId`, dated on the parent's due date by default. */
export function addAfter(draft: FlowDraft, parentId: string, id: string, fallbackDate: string): FlowDraft {
  const parent = draft.find((node) => node.id === parentId);
  const date = parent?.dueOn ?? parent?.startOn ?? fallbackDate;
  return [...draft, newNode(id, parentId, date, nextSortOrder(draft, parentId))];
}

/** A new 앞 일 inserted between `nodeId` and its current 앞 일. */
export function addBefore(draft: FlowDraft, nodeId: string, id: string, fallbackDate: string): FlowDraft {
  const node = draft.find((item) => item.id === nodeId);
  if (!node) return draft;
  const date = node.startOn ?? node.dueOn ?? fallbackDate;
  const inserted = { ...newNode(id, node.parentId, date, node.sortOrder), sortOrder: node.sortOrder };
  return [
    ...draft.map((item) => (item.id === nodeId ? { ...item, parentId: id, sortOrder: 100 } : item)),
    inserted,
  ];
}

/** Sets or clears the 앞 일. Refuses loops by returning the draft unchanged. */
export function setParent(draft: FlowDraft, nodeId: string, parentId: string | null): FlowDraft {
  if (parentId === nodeId || wouldCycle(draft, nodeId, parentId)) return draft;
  return draft.map((node) =>
    node.id === nodeId
      ? { ...node, parentId, sortOrder: nextSortOrder(draft, parentId) }
      : node,
  );
}

/** Removes a task; its 뒤 일 move up to the removed task's 앞 일 so the chain stays connected. */
export function removeNode(draft: FlowDraft, nodeId: string): FlowDraft {
  const node = draft.find((item) => item.id === nodeId);
  if (!node) return draft;
  return draft
    .filter((item) => !(item.id === nodeId && item.isNew))
    .map((item) => {
      if (item.id === nodeId) return { ...item, deleted: true };
      if (item.parentId === nodeId) return { ...item, parentId: node.parentId };
      return item;
    });
}

export function updateNode(draft: FlowDraft, nodeId: string, patch: Partial<Pick<FlowNode, "title" | "startOn" | "dueOn" | "status">>): FlowDraft {
  return draft.map((node) => {
    if (node.id !== nodeId) return node;
    const next = { ...node, ...patch };
    if (patch.status && patch.status !== "done") next.completedAt = null;
    // Keep the range valid: a due date before the start moves with the start.
    if (next.startOn && next.dueOn && next.dueOn < next.startOn) {
      if ("startOn" in patch) next.dueOn = next.startOn;
      else next.startOn = next.dueOn;
    }
    return next;
  });
}

export type FlowLayout = {
  positions: Map<string, { col: number; row: number }>;
  edges: Array<{ from: string; to: string }>;
  columns: number;
  rows: number;
};

/**
 * Left-to-right tree layout: a task's column is its depth, leaves take
 * consecutive rows, and a parent sits at the middle of its children.
 * Separate branches are stacked with a small gap.
 */
export function layoutFlow(draft: FlowDraft): FlowLayout {
  const nodes = live(draft).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ko"));
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map<string, FlowNode[]>();
  const roots: FlowNode[] = [];
  for (const node of nodes) {
    if (node.parentId && ids.has(node.parentId)) {
      children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
    } else roots.push(node);
  }
  const positions = new Map<string, { col: number; row: number }>();
  const edges: Array<{ from: string; to: string }> = [];
  let nextRow = 0;
  let columns = 0;
  const place = (node: FlowNode, depth: number): number => {
    if (positions.has(node.id)) return positions.get(node.id)!.row;
    columns = Math.max(columns, depth + 1);
    positions.set(node.id, { col: depth, row: nextRow });
    const kids = children.get(node.id) ?? [];
    if (!kids.length) {
      nextRow += 1;
      return positions.get(node.id)!.row;
    }
    const rows = kids.map((kid) => {
      edges.push({ from: node.id, to: kid.id });
      return place(kid, depth + 1);
    });
    const row = (rows[0] + rows[rows.length - 1]) / 2;
    positions.set(node.id, { col: depth, row });
    return row;
  };
  roots.forEach((root, index) => {
    if (index > 0) nextRow += 0.35;
    place(root, 0);
  });
  // Anything left unplaced (only possible with a stored loop) starts its own branch.
  for (const node of nodes) if (!positions.has(node.id)) place(node, 0);
  return { positions, edges, columns, rows: nextRow };
}

/** Number of tasks whose saved state would change. */
export function changedCount(original: FlowDraft, draft: FlowDraft) {
  const before = new Map(original.map((node) => [node.id, node]));
  return draft.filter((node) => {
    if (node.isNew) return !node.deleted;
    const prior = before.get(node.id);
    return !prior || JSON.stringify(prior) !== JSON.stringify(node);
  }).length;
}

/**
 * Rows for one bulk upsert of mkt_tasks. Every row carries the same columns
 * so the request is a single statement (all saved or none).
 */
export function flowRows(
  original: FlowDraft,
  draft: FlowDraft,
  context: { projectId: string | null; areaId: string | null; now: string },
) {
  const before = new Map(original.map((node) => [node.id, node]));
  return draft
    .filter((node) => {
      if (node.isNew) return !node.deleted;
      const prior = before.get(node.id);
      return !prior || JSON.stringify(prior) !== JSON.stringify(node);
    })
    .map((node) => {
      const done = node.status === "done";
      const startOn = node.startOn ?? node.dueOn;
      const dueOn = node.dueOn ?? node.startOn;
      return {
        id: node.id,
        area_id: node.areaId ?? context.areaId,
        project_id: context.projectId,
        title: node.title.trim(),
        start_at: startOn ? timestamp(startOn) : null,
        due_at: dueOn ? dueTimestamp(dueOn) : null,
        depends_on_task_id: node.parentId,
        status: node.status,
        completed_at: done ? node.completedAt ?? context.now : null,
        sort_order: node.sortOrder,
        deleted_at: node.deleted ? context.now : null,
        updated_at: context.now,
      };
    });
}
