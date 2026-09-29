"use client";

import { DragEvent, WheelEvent, useMemo, useRef, useState } from "react";
import { Data, MarketingEvent, Task, TaskChecklistItem, WorkProject, dates, eventStatusLabels, monthPeriod, timestamp } from "@/lib/domain";
import { SourceFilter, materializedTasks, matchesSource, todayBoard } from "@/lib/task-board";
import { addDays, dateOnly, dayDistance, dueTimestamp, taskRecordId } from "@/lib/task-dates";
import {
  CALENDAR_DAY_HEADER,
  CALENDAR_LANE_HEIGHT,
  assignLanes,
  hiddenBarsByColumn,
  visibleLaneCount,
  weekRowHeight,
  weekSegment,
} from "@/lib/task-calendar";
import { ProjectForm, TaskForm } from "./task-form";
import { TaskRow } from "./task-row";
import {
  CardDropPosition,
  CardDropTarget,
  Save,
  Update,
  projectColor,
  readableOnColor,
} from "./task-shared";

export function TaskWorkspace({
  data,
  events,
  today,
  serverNow,
  month,
  onMonthChange,
  onSave,
  onUpdate,
  onEditEvent,
  initialCreate = false,
  onCompleteRecurring,
}: {
  data: Data;
  events: MarketingEvent[];
  today: string;
  serverNow: string;
  month: string;
  onMonthChange: (month: string) => void;
  onSave: Save;
  onUpdate: Update;
  onEditEvent: (event: MarketingEvent | null, date?: string) => void;
  initialCreate?: boolean;
  onCompleteRecurring?: (task: Task, completed: boolean) => void | Promise<void>;
}) {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [panelMode, setPanelMode] = useState<"today" | "date">("today");
  const [showProjects, setShowProjects] = useState(false);
  const [taskEditor, setTaskEditor] = useState<Task | null | undefined>(initialCreate ? null : undefined);
  const [newTaskProjectId, setNewTaskProjectId] = useState("");
  const [newTaskDate, setNewTaskDate] = useState("");
  const [newTaskParentId, setNewTaskParentId] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [selectedDate, setSelectedDate] = useState(today);
  const [projectEditor, setProjectEditor] = useState<WorkProject | null | undefined>();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [draggedListTaskId, setDraggedListTaskId] = useState<string | null>(null);
  const [listDropTarget, setListDropTarget] = useState<CardDropTarget | null>(null);
  const [openChecklistTaskIds, setOpenChecklistTaskIds] = useState<Set<string>>(new Set());
  const calendarWheelLocked = useRef(false);
  const materialized = useMemo(
    () => materializedTasks(data, today, monthPeriod(month)),
    [data, today, month],
  );
  const visibleTasks = useMemo(() => {
    const tasks = materialized.filter((task) => matchesSource(task, sourceFilter));
    return tasks.sort((a, b) => {
      const aDue = dateOnly(a.due_at) ?? "9999-12-31";
      const bDue = dateOnly(b.due_at) ?? "9999-12-31";
      return aDue.localeCompare(bDue) || a.sort_order - b.sort_order;
    });
  }, [materialized, sourceFilter]);
  const board = useMemo(
    () => todayBoard(materializedTasks(data, today).filter((task) => matchesSource(task, sourceFilter)), today),
    [data, today, sourceFilter],
  );
  const toggle = (task: Task) => {
    if (task.recurrence_template_id && task.occurrence_on && onCompleteRecurring) {
      if (task.occurrence_on > today) return;
      void Promise.resolve(onCompleteRecurring(task, task.status !== "done")).catch(() => {});
      return;
    }
    onUpdate("tasks", task.id, {
      status: task.status === "done" ? "planned" : "done",
      completed_at: task.status === "done" ? null : serverNow,
      updated_at: serverNow,
    });
  };
  const calendarDays = dates(monthPeriod(month));
  const firstWeekday = new Date(`${calendarDays[0]}T12:00:00Z`).getUTCDay();
  const calendarCells: Array<string | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...calendarDays,
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);
  const calendarTasks = new Map<string, Task[]>();
  const selectCalendarDate = (day: string) => {
    setSelectedDate(day);
    setPanelMode("date");
  };
  const showTodayBoard = () => {
    setSelectedDate(today);
    setPanelMode("today");
  };
  const openTaskForDate = (day: string) => {
    setNewTaskProjectId("");
    setNewTaskDate(day);
    setNewTaskParentId("");
    setNewTaskTitle("");
    setTaskEditor(null);
  };
  // The month lives in the global header. When it changes, keep the selected
  // date inside the shown month (today for the current month).
  const [shownMonth, setShownMonth] = useState(month);
  if (shownMonth !== month) {
    setShownMonth(month);
    setSelectedDate(month === today.slice(0, 7) ? today : `${month}-01`);
  }
  // Page actions add to the date the side panel is showing.
  const contextDate = panelMode === "date" ? selectedDate : today;
  const moveCalendarMonth = (offset: number) => {
    const [year, currentMonth] = month.split("-").map(Number);
    const next = new Date(Date.UTC(year, currentMonth - 1 + offset, 1));
    const nextMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    onMonthChange(nextMonth);
  };
  // Shift + wheel changes the month. Browsers may report Shift + wheel as a
  // horizontal delta, so either axis counts.
  const handleCalendarWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.shiftKey) return;
    const delta = event.deltaY || event.deltaX;
    if (!delta) return;
    event.preventDefault();
    if (calendarWheelLocked.current) return;
    calendarWheelLocked.current = true;
    moveCalendarMonth(delta > 0 ? 1 : -1);
    window.setTimeout(() => {
      calendarWheelLocked.current = false;
    }, 320);
  };
  for (const task of visibleTasks) {
    const start = dateOnly(task.start_at) ?? dateOnly(task.due_at);
    const due = dateOnly(task.due_at) ?? start;
    if (!start || !due) continue;
    const rangeStart = start <= due ? start : due;
    const rangeEnd = start <= due ? due : start;
    for (const day of calendarDays) {
      if (day >= rangeStart && day <= rangeEnd) {
        calendarTasks.set(day, [...(calendarTasks.get(day) ?? []), task]);
      }
    }
  }
  const activeEvents = events.filter((event) => !event.deleted_at);
  const calendarWeeks = Array.from({ length: calendarCells.length / 7 }, (_, weekIndex) => {
    const week = calendarCells.slice(weekIndex * 7, weekIndex * 7 + 7);
    const projectBars = !showProjects ? [] : data.workProjects
      .filter((project) => !project.deleted_at && project.start_on && project.due_on)
      .flatMap((project) => {
        const segment = weekSegment(week, project.start_on!, project.due_on!);
        return segment ? [{
          kind: "project" as const,
          project,
          ...segment,
          label: segment.continues ? `↳ ${project.name}` : project.name,
        }] : [];
      });
    const eventBars = activeEvents.flatMap((event) => {
      const start = dateOnly(event.starts_at);
      const end = dateOnly(event.ends_at) ?? start;
      const segment = start && end ? weekSegment(week, start, end) : null;
      return segment ? [{
        kind: "event" as const,
        event,
        ...segment,
        label: segment.continues ? `↳ ${event.title}` : event.title,
      }] : [];
    });
    const taskBars = visibleTasks.flatMap((task) => {
      const start = dateOnly(task.start_at) ?? dateOnly(task.due_at);
      const end = dateOnly(task.due_at) ?? start;
      const segment = start && end ? weekSegment(week, start, end) : null;
      return segment ? [{
        kind: "task" as const,
        task,
        ...segment,
        label: segment.continues ? `↳ ${task.title}` : task.title,
      }] : [];
    });
    const priority = { event: 0, task: 1, project: 2 } as const;
    const { bars, laneCount } = assignLanes(
      [...projectBars, ...eventBars, ...taskBars].sort((a, b) =>
        priority[a.kind] - priority[b.kind] ||
        a.startColumn - b.startColumn ||
        a.endColumn - b.endColumn,
      ),
    );
    const visibleLanes = visibleLaneCount(laneCount);
    return {
      week,
      bars: bars.filter((bar) => bar.lane < visibleLanes),
      hidden: hiddenBarsByColumn(bars, visibleLanes),
      overflowLane: visibleLanes,
      rowHeight: weekRowHeight(visibleLanes, laneCount > visibleLanes),
    };
  });
  const dailyTasks = (calendarTasks.get(selectedDate) ?? []).filter(
    (task, index, tasks) => tasks.findIndex((item) => item.id === task.id) === index,
  );
  const dailyTaskCards = (() => {
    // Finished tasks sink below open ones; open tasks keep the manual order.
    const finished = (task: Task) => task.status === "done" || task.status === "cancelled";
    const ordered = [...dailyTasks].sort(
      (a, b) =>
        Number(finished(a)) - Number(finished(b)) ||
        a.sort_order - b.sort_order ||
        a.title.localeCompare(b.title, "ko"),
    );
    const tasksById = new Map(ordered.map((task) => [taskRecordId(task), task]));
    const children = new Map<string, Task[]>();
    for (const task of ordered) {
      if (!task.depends_on_task_id || !tasksById.has(task.depends_on_task_id)) continue;
      children.set(task.depends_on_task_id, [...(children.get(task.depends_on_task_id) ?? []), task]);
    }
    const cards: Array<{ task: Task; depth: number }> = [];
    const visited = new Set<string>();
    const addTask = (task: Task, depth: number) => {
      const id = taskRecordId(task);
      if (visited.has(id)) return;
      visited.add(id);
      cards.push({ task, depth });
      for (const child of children.get(id) ?? []) addTask(child, depth + 1);
    };
    for (const task of ordered) {
      if (!task.depends_on_task_id || !tasksById.has(task.depends_on_task_id)) addTask(task, 0);
    }
    for (const task of ordered) addTask(task, 0);
    return cards;
  })();
  const dailyEvents = activeEvents.filter((event) => {
    const start = dateOnly(event.starts_at);
    const end = dateOnly(event.ends_at) ?? start;
    return !!start && !!end && start <= selectedDate && selectedDate <= end;
  });
  const moveTaskToDate = (taskId: string, targetDate: string) => {
    const task = visibleTasks.find((item) => item.id === taskId) ?? materialized.find((item) => item.id === taskId);
    if (!task || task.recurrence_template_id) return;
    const start = dateOnly(task.start_at);
    const due = dateOnly(task.due_at);
    const duration = start && due ? Math.max(0, dayDistance(start, due)) : 0;
    const nextDue = due ? addDays(targetDate, duration) : null;
    onUpdate("tasks", task.id, {
      start_at: timestamp(targetDate),
      due_at: nextDue ? dueTimestamp(nextDue) : null,
      updated_at: serverNow,
    });
    setSelectedDate(targetDate);
    setDraggedTaskId(null);
    setDragOverDate(null);
  };
  const openFollowUpTask = (parent: Task, title: string) => {
    setNewTaskProjectId(parent.project_id ?? "");
    setNewTaskDate(dateOnly(parent.due_at) ?? dateOnly(parent.start_at) ?? selectedDate);
    setNewTaskParentId(taskRecordId(parent));
    setNewTaskTitle(title);
    setTaskEditor(null);
  };
  const checklistForTask = (task: Task) => data.taskChecklistItems
    .filter((item) => !item.deleted_at && item.task_id === taskRecordId(task))
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const toggleChecklist = (task: Task) => {
    const id = taskRecordId(task);
    setOpenChecklistTaskIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const addChecklistItem = (task: Task, title: string) => {
    const items = checklistForTask(task);
    void onSave("taskChecklistItems", {
      task_id: taskRecordId(task),
      title,
      completed_at: null,
      sort_order: Math.max(0, ...items.map((item) => item.sort_order)) + 100,
    });
  };
  const updateChecklistItem = (item: TaskChecklistItem, patch: Record<string, unknown>) => {
    onUpdate("taskChecklistItems", item.id, { ...patch, updated_at: serverNow });
  };
  const deleteChecklistItem = (item: TaskChecklistItem) => {
    onUpdate("taskChecklistItems", item.id, { deleted_at: serverNow });
  };
  const wouldCreateTaskCycle = (taskId: string, parentId: string | null) => {
    const visited = new Set<string>();
    let currentId = parentId;
    while (currentId && !visited.has(currentId)) {
      if (currentId === taskId) return true;
      visited.add(currentId);
      currentId = data.tasks.find((task) => task.id === currentId)?.depends_on_task_id ?? null;
    }
    return false;
  };
  // Dropping on the right third of a card nests the task under it; anywhere
  // else only reorders, so a plain reorder cannot nest a task by accident.
  const cardDropPosition = (event: DragEvent<HTMLElement>): CardDropPosition => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / Math.max(bounds.width, 1);
    if (x > 2 / 3) return "child";
    const y = (event.clientY - bounds.top) / Math.max(bounds.height, 1);
    return y < 0.5 ? "before" : "after";
  };
  const startTaskCardDrag = (event: DragEvent<HTMLElement>, task: Task) => {
    const id = taskRecordId(task);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-rohan-task-card", id);
    setDraggedListTaskId(id);
  };
  const dropTaskCard = (event: DragEvent<HTMLElement>, target: Task) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("application/x-rohan-task-card") || draggedListTaskId;
    const targetId = taskRecordId(target);
    const intent = listDropTarget?.id === targetId
      ? listDropTarget.position
      : cardDropPosition(event);
    const source = dailyTaskCards.find(({ task }) => taskRecordId(task) === sourceId)?.task;
    if (!source || !sourceId || sourceId === targetId) {
      setDraggedListTaskId(null);
      setListDropTarget(null);
      return;
    }
    if (intent === "child") {
      if (!wouldCreateTaskCycle(sourceId, targetId)) {
        const siblingOrders = data.tasks
          .filter((task) => !task.deleted_at && task.depends_on_task_id === targetId)
          .map((task) => task.sort_order);
        onUpdate("tasks", sourceId, {
          depends_on_task_id: targetId,
          sort_order: Math.max(0, ...siblingOrders) + 100,
          updated_at: serverNow,
        });
      }
    } else {
      const parentId = target.depends_on_task_id;
      if (!wouldCreateTaskCycle(sourceId, parentId)) {
        const siblings = dailyTaskCards
          .filter(({ task }) => taskRecordId(task) !== sourceId && task.depends_on_task_id === parentId)
          .map(({ task }) => task);
        const targetIndex = siblings.findIndex((task) => taskRecordId(task) === targetId);
        const insertionIndex = intent === "before" ? targetIndex : targetIndex + 1;
        siblings.splice(Math.max(0, insertionIndex), 0, source);
        siblings.forEach((task, index) => {
          onUpdate("tasks", taskRecordId(task), {
            depends_on_task_id: parentId ?? null,
            sort_order: (index + 1) * 100,
            updated_at: serverNow,
          });
        });
      }
    }
    setDraggedListTaskId(null);
    setListDropTarget(null);
  };
  // Event completion is only toggled here on the task page; the event editor
  // keeps the full status choice.
  const toggleEvent = (event: MarketingEvent) => {
    onUpdate("events", event.id, {
      status: event.status === "completed" ? "planned" : "completed",
    });
  };
  const renderTaskRow = (task: Task, depth: number, reorderable: boolean) => (
    <TaskRow
      key={task.id}
      task={task}
      data={data}
      today={today}
      serverNow={serverNow}
      depth={depth}
      reorderable={reorderable}
      dragging={draggedListTaskId === taskRecordId(task)}
      dropPosition={listDropTarget?.id === taskRecordId(task) ? listDropTarget.position : null}
      onToggle={toggle}
      onEdit={(item) => setTaskEditor(item)}
      onResult={(item, result) => onUpdate("tasks", taskRecordId(item), { result, updated_at: serverNow })}
      onDragStart={startTaskCardDrag}
      onDragOver={(event, target) => {
        if (!draggedListTaskId || draggedListTaskId === taskRecordId(target)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setListDropTarget({ id: taskRecordId(target), position: cardDropPosition(event) });
      }}
      onDragLeave={() => {
        if (listDropTarget?.id === taskRecordId(task)) setListDropTarget(null);
      }}
      onDrop={dropTaskCard}
      onDragEnd={() => {
        setDraggedListTaskId(null);
        setListDropTarget(null);
      }}
      checklistItems={checklistForTask(task)}
      checklistOpen={openChecklistTaskIds.has(taskRecordId(task))}
      onChecklistOpen={toggleChecklist}
      onChecklistAdd={addChecklistItem}
      onChecklistUpdate={updateChecklistItem}
      onChecklistDelete={deleteChecklistItem}
    />
  );
  return (
    <div className="work-page">
      <div className="task-2l">
        <div className="task-2l-leading">
          <h1>업무</h1>
          <div className="segmented task-filters">
            {([
              ["all", "전체"],
              ["requested", "요청받은 업무"],
              ["recurring", "반복 업무"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                className={sourceFilter === value ? "selected" : ""}
                aria-pressed={sourceFilter === value}
                onClick={() => setSourceFilter(value)}
              >
                {label}
              </button>
            ))}
            <button className={showProjects ? "selected project-toggle" : "project-toggle"} onClick={() => setShowProjects((current) => !current)}>
              프로젝트
            </button>
          </div>
        </div>
        <div className="task-2l-tools">
          <button onClick={() => setProjectEditor(null)}>＋ 프로젝트</button>
          <button onClick={() => onEditEvent(null, contextDate)} title={`${contextDate.slice(5).replace("-", "/")} 이벤트 추가`}>＋ 이벤트</button>
          <button className="primary" onClick={() => openTaskForDate(contextDate)} title={`${contextDate.slice(5).replace("-", "/")} 업무 추가`}>＋ 업무</button>
        </div>
      </div>
      <div className="work-layout">
        <main className="work-main">
          <div className="work-overview-grid">
            <section className="task-calendar calendar-main panel">
              <h2 className="visually-hidden">{month.replace("-", "년 ")}월 업무 캘린더</h2>
              <div className="calendar-weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <b key={day}>{day}</b>)}</div>
              <div className="calendar-grid" title="날짜 선택 · ＋로 업무 추가 · Shift+휠로 월 전환" onWheel={handleCalendarWheel}>
                {calendarWeeks.map(({ week, bars, hidden, overflowLane, rowHeight }, weekIndex) => (
                  <div className="calendar-week" key={`week-${weekIndex}`} style={{ flex: `1 0 ${rowHeight}px`, minHeight: `${rowHeight}px` }}>
                    <div className="calendar-days">
                      {week.map((day, index) => <div className={`${day ? "calendar-day" : "calendar-day calendar-day-outside"}${day === today ? " today" : ""}${day === selectedDate ? " selected" : ""}${day && dragOverDate === day ? " drag-over" : ""}`} key={day ?? `outside-${weekIndex}-${index}`} onClick={() => day && selectCalendarDate(day)} onDragOver={(event) => { if (day && draggedTaskId) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverDate(day); } }} onDragLeave={() => day && dragOverDate === day && setDragOverDate(null)} onDrop={(event) => { if (!day) return; event.preventDefault(); const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId; if (taskId) moveTaskToDate(taskId, day); }}>
                        {day && <button className="calendar-day-add" aria-label={`${day} 업무 추가`} onClick={(event) => { event.stopPropagation(); selectCalendarDate(day); openTaskForDate(day); }}>
                          <b>{Number(day.slice(-2))}</b><span>＋</span>
                        </button>}
                      </div>)}
                    </div>
                    <div className="calendar-week-bars" aria-label="일정 흐름">
                      {bars.map((bar) => {
                        const task = bar.kind === "task" ? bar.task : undefined;
                        const project = bar.kind === "project" ? bar.project : task ? data.workProjects.find((item) => item.id === task.project_id) : undefined;
                        const event = bar.kind === "event" ? bar.event : undefined;
                        const color = event ? "#8b68b6" : projectColor(project);
                        const draggable = bar.kind === "task" && !bar.task.recurrence_template_id;
                        return <button
                          className={`calendar-task-bar${bar.kind === "project" ? " calendar-project-bar" : ""}${bar.kind === "event" ? " calendar-event-bar" : ""}${(bar.kind === "task" && bar.task.status === "done") || (bar.kind === "event" && bar.event.status === "completed") ? " done" : ""}`}
                          key={`${bar.kind}:${bar.kind === "project" ? bar.project.id : bar.kind === "event" ? bar.event.id : bar.task.id}:${weekIndex}`}
                          draggable={draggable}
                          style={{ left: `${((bar.startColumn - 1) / 7) * 100}%`, width: `calc(${((bar.endColumn - bar.startColumn) / 7) * 100}% - 4px)`, top: `${CALENDAR_DAY_HEADER + bar.lane * CALENDAR_LANE_HEIGHT}px`, backgroundColor: color, color: readableOnColor(color) }}
                          title={`${bar.label}${project ? ` · ${project.name}${project.deleted_at ? " (휴지통)" : ""}` : event ? ` · ${event.location ?? "이벤트"}` : ""}`}
                          onDragStart={(dragEvent) => { if (!draggable || !task) return; dragEvent.dataTransfer.effectAllowed = "move"; dragEvent.dataTransfer.setData("text/plain", task.id); setDraggedTaskId(task.id); }}
                          onDragEnd={() => { setDraggedTaskId(null); setDragOverDate(null); }}
                          onClick={(clickEvent) => { clickEvent.stopPropagation(); if (task) setTaskEditor(task); else if (project) setProjectEditor(project); else if (event) onEditEvent(event); }}
                        >
                          {bar.label}
                        </button>;
                      })}
                      {hidden.map((count, column) => {
                        const day = week[column];
                        return count > 0 && day ? <button
                          className="calendar-more-bar"
                          key={`more:${day}`}
                          style={{ left: `${(column / 7) * 100}%`, width: `calc(${100 / 7}% - 4px)`, top: `${CALENDAR_DAY_HEADER + overflowLane * CALENDAR_LANE_HEIGHT}px` }}
                          aria-label={`${day} 일정 ${count}개 더 보기`}
                          onClick={(clickEvent) => { clickEvent.stopPropagation(); selectCalendarDate(day); }}
                        >
                          +{count}개
                        </button> : null;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="task-list task-tree panel">
              {panelMode === "today" ? (
                <div className="section-toolbar">
                  <div>
                    <h2>오늘 보드 · {today.slice(5).replace("-", "/")}</h2>
                    <small>기한 초과 {board.overdue.length} · 오늘 {board.today.length} · 반복 {board.recurring.length} · 날짜 미정 {board.undated.length}</small>
                  </div>
                </div>
              ) : (
                <div className="section-toolbar">
                  <div>
                    <button className="task-board-back" onClick={showTodayBoard}>← 오늘 보드</button>
                    <h2>{selectedDate.slice(5).replace("-", "/")} 업무 목록</h2>
                    <small>업무 {dailyTasks.length}건 · 이벤트 {dailyEvents.length}건 · 카드 오른쪽에 놓으면 하위 업무</small>
                  </div>
                </div>
              )}
              {dailyEvents.map((event) => (
                <div className={`task-event-row${event.status === "completed" ? " done" : ""}`} key={event.id}>
                  <input
                    type="checkbox"
                    className="task-event-check"
                    checked={event.status === "completed"}
                    aria-label={`${event.title} 이벤트 완료`}
                    onChange={() => toggleEvent(event)}
                  />
                  <div>
                    <strong>{event.title}</strong>
                    <small>이벤트 · {event.location || "장소 미입력"} · {eventStatusLabels[event.status] ?? event.status}</small>
                  </div>
                  <button aria-label={`${event.title} 이벤트 수정`} onClick={() => onEditEvent(event)}>⋯</button>
                </div>
              ))}
              {panelMode === "today" ? (
                <>
                  {([
                    ["overdue", "기한 초과", board.overdue],
                    ["today", "오늘", board.today],
                    ["recurring", "반복 업무", board.recurring],
                    ["undated", "날짜 미정", board.undated],
                  ] as const).map(([key, label, tasks]) => tasks.length > 0 && (
                    <div className={`task-board-section task-board-${key}`} key={key}>
                      <h3>{label}<span>{tasks.length}</span></h3>
                      {tasks.map((task) => renderTaskRow(task, 0, false))}
                    </div>
                  ))}
                  {!board.overdue.length && !board.today.length && !board.recurring.length && !board.undated.length && !dailyEvents.length && (
                    <div className="empty-small">오늘 할 업무가 없습니다. 캘린더에서 날짜를 눌러 다른 날의 업무를 볼 수 있습니다.</div>
                  )}
                </>
              ) : (
                <>
                  {dailyTaskCards.map(({ task, depth }) => renderTaskRow(task, depth, true))}
                  {!dailyTasks.length && !dailyEvents.length && <div className="empty-small">이 날짜에 예정된 업무나 이벤트가 없습니다.</div>}
                </>
              )}
            </section>
          </div>
        </main>
      </div>
      {taskEditor !== undefined && <TaskForm key={taskEditor ? taskEditor.id : `new:${newTaskParentId}:${newTaskTitle}:${newTaskDate}`} data={data} today={today} now={serverNow} task={taskEditor} initialProjectId={taskEditor ? "" : newTaskProjectId} initialDate={taskEditor ? "" : newTaskDate} initialParentTaskId={taskEditor ? "" : newTaskParentId} initialTitle={taskEditor ? "" : newTaskTitle} onSave={onSave} onArchive={(task) => onUpdate("tasks", taskRecordId(task), { deleted_at: serverNow })} onCreateFollowUp={openFollowUpTask} onClose={() => { setTaskEditor(undefined); setNewTaskDate(""); setNewTaskParentId(""); setNewTaskTitle(""); }} />}
      {projectEditor !== undefined && <ProjectForm data={data} project={projectEditor} onSave={onSave} onArchive={(project) => onUpdate("workProjects", project.id, { deleted_at: serverNow })} onClose={() => setProjectEditor(undefined)} />}
    </div>
  );
}
