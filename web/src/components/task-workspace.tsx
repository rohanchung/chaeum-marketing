"use client";

import { FormEvent, WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Data,
  MarketingEvent,
  Task,
  TaskPriority,
  TaskSource,
  TaskStatus,
  WorkProject,
  dates,
  localDate,
  monthPeriod,
  timestamp,
} from "@/lib/domain";
import { Collection } from "@/lib/repository";
import { recurrenceText } from "@/lib/task-recurrence";

type Save = (collection: Collection, record: Record<string, unknown>) => Promise<void>;
type Update = (
  collection: Collection,
  id: string,
  patch: Record<string, unknown>,
) => void;

const statusLabels: Record<TaskStatus, string> = {
  requested: "받은 요청",
  planned: "예정",
  in_progress: "진행 중",
  waiting: "대기",
  on_hold: "보류",
  done: "완료",
  cancelled: "취소",
};
const priorityLabels: Record<TaskPriority, string> = {
  low: "낮음",
  normal: "보통",
  high: "높음",
};
const sourceLabels: Record<TaskSource, string> = {
  self: "내가 만든 업무",
  requested: "요청받은 업무",
  recurring: "반복 업무",
};
const dateOnly = (value: string | null) =>
  value ? localDate(new Date(value)) : null;
const dueTimestamp = (value: string) => `${value}T23:59:00+09:00`;
const dateLabel = (value: string | null, today: string) => {
  const date = dateOnly(value);
  if (!date) return "날짜 미정";
  if (date < today) return "기한 초과";
  if (date === today) return "오늘";
  return date.slice(5).replace("-", "/");
};
const compactDate = (value: string | null | undefined) => {
  const date = dateOnly(value ?? null);
  return date ? date.slice(5).replace("-", "/") : "—";
};
const koreanClock = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
const activeTask = (task: Task) =>
  !task.deleted_at && task.status !== "done" && task.status !== "cancelled";
const useModalEscape = (onClose: () => void) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
};
const projectColor = (project: WorkProject | undefined) => project?.color ?? "#4e986e";
const readableOnColor = (color: string) => {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 155 ? "#18352a" : "#ffffff";
};
const dayDistance = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
const addDays = (value: string, amount: number) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

export function materializedTasks(data: Data, today: string): Task[] {
  const occurrences = new Map(
    data.taskOccurrences.map((occurrence) => [
      `${occurrence.task_id}:${occurrence.occurrence_on}`,
      occurrence,
    ]),
  );
  return data.tasks
    .filter((task) => !task.deleted_at)
    .flatMap((task): Task[] => {
      if (task.source_type !== "recurring" || !task.recurrence_active) return [task];
      const occurrenceOn = task.recurrence_next_on ?? dateOnly(task.start_at) ?? today;
      const occurrence = occurrences.get(`${task.id}:${occurrenceOn}`);
      return [{
        ...task,
        id: `${task.id}:${occurrenceOn}`,
        recurrence_template_id: task.id,
        occurrence_on: occurrenceOn,
        start_at: timestamp(occurrenceOn),
        due_at: dueTimestamp(occurrenceOn),
        status: (occurrence?.status === "done" ? "done" : "planned") as TaskStatus,
        completed_at: occurrence?.completed_at ?? null,
      } as Task];
    });
}

export function TodayActivity({
  data,
  today,
  onOpen,
  onToggle,
  onAdd,
  onCompleteRecurring,
}: {
  data: Data;
  today: string;
  onOpen: () => void;
  onToggle: (task: Task) => void;
  onAdd: () => void;
  onCompleteRecurring?: (task: Task, completed: boolean) => void | Promise<void>;
}) {
  const tasks = materializedTasks(data, today)
    .filter((task) => {
      if (!activeTask(task)) return false;
      const start = dateOnly(task.start_at);
      const due = dateOnly(task.due_at);
      return start === today || due === today || (due !== null && due < today);
    })
    .sort((a, b) => {
      const aDue = dateOnly(a.due_at) ?? "9999-12-31";
      const bDue = dateOnly(b.due_at) ?? "9999-12-31";
      return aDue.localeCompare(bDue) || a.sort_order - b.sort_order;
    });
  const projects = new Map(data.workProjects.map((p) => [p.id, p.name]));
  const overdue = tasks.filter((task) => {
    const due = dateOnly(task.due_at);
    return due !== null && due < today;
  }).length;
  return (
    <section className="today-activity panel">
      <div className="section-toolbar">
        <div>
          <small className="eyebrow">PROJECT ACTIVITY</small>
          <h2>오늘의 프로젝트 활동</h2>
        </div>
        <div className="inline-tools">
          {overdue > 0 && <span className="task-alert">기한 초과 {overdue}</span>}
          <button onClick={onOpen}>업무 페이지</button>
          <button className="primary" onClick={onAdd}>
            ＋ 업무
          </button>
        </div>
      </div>
      {tasks.length ? (
        <div className="today-activity-scroll">
          {tasks.slice(0, 12).map((task) => (
            <div className="today-activity-item" key={task.id}>
              <input
                type="checkbox"
                aria-label={`${task.title} 완료`}
                checked={task.status === "done"}
                onChange={() => {
                  if (task.recurrence_template_id && onCompleteRecurring) {
                    void Promise.resolve(onCompleteRecurring(task, task.status !== "done")).catch(() => {});
                  } else onToggle(task);
                }}
              />
              <div>
                <strong>{task.title}</strong>
                <small>
                  {task.project_id ? projects.get(task.project_id) : "미분류 업무"}
                  {task.requester_name ? ` · ${task.requester_name}` : ""}
                </small>
              </div>
              <span
                className={
                  dateOnly(task.due_at) !== null && dateOnly(task.due_at)! < today
                    ? "task-overdue"
                    : ""
                }
              >
                {dateLabel(task.due_at ?? task.start_at, today)}
              </span>
            </div>
          ))}
          {tasks.length > 12 && <button onClick={onOpen}>+ {tasks.length - 12}건 더 보기</button>}
        </div>
      ) : (
        <div className="today-activity-empty">
          오늘 등록된 프로젝트 활동이 없습니다. <button onClick={onAdd}>업무 추가</button>
        </div>
      )}
    </section>
  );
}

export function ProjectActivitySummary({
  data,
  today,
  onOpen,
}: {
  data: Data;
  today: string;
  onOpen: (projectId: string) => void;
}) {
  const projects = data.workProjects
    .filter((project) => !project.deleted_at && project.status === "active")
    .sort((a, b) => a.sort_order - b.sort_order);
  const allTasks = materializedTasks(data, today);
  if (!projects.length) return null;
  return (
    <section className="project-summary panel">
      <div className="section-toolbar">
        <div>
          <small className="eyebrow">ACTIVE PROJECTS</small>
          <h2>진행 중 프로젝트</h2>
        </div>
        <button onClick={() => onOpen("")}>전체 업무</button>
      </div>
      <div className="project-summary-grid">
        {projects.map((project) => {
          const tasks = allTasks.filter(
            (task) => activeTask(task) && task.project_id === project.id,
          );
          const next = tasks
            .filter((task) => task.due_at)
            .sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""))[0];
          const done = allTasks.filter(
            (task) =>
              !task.deleted_at && task.project_id === project.id && task.status === "done",
          ).length;
          const total = allTasks.filter(
            (task) => !task.deleted_at && task.project_id === project.id,
          ).length;
          return (
            <button
              className="project-summary-card"
              key={project.id}
              onClick={() => onOpen(project.id)}
            >
              <strong>{project.name}</strong>
              <span>
                {done}/{total} 완료 · 미완료 {tasks.length}
              </span>
              <small>
                {next ? `다음 마감 ${dateLabel(next.due_at, today)}` : "다음 마감 없음"}
              </small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function TaskForm({
  data,
  today,
  now,
  task,
  initialProjectId = "",
  initialDate = "",
  onSave,
  onArchive,
  onClose,
}: {
  data: Data;
  today: string;
  now: string;
  task: Task | null;
  initialProjectId?: string;
  initialDate?: string;
  onSave: Save;
  onArchive: (task: Task) => void;
  onClose: () => void;
}) {
  useModalEscape(onClose);
  const initialProject = task?.project_id ?? initialProjectId;
  const [title, setTitle] = useState(task?.title ?? "");
  const [projectId, setProjectId] = useState(initialProject);
  const [sourceType, setSourceType] = useState<TaskSource>(task?.source_type ?? "self");
  const [requester, setRequester] = useState(task?.requester_name ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "planned");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "normal");
  const [startOn, setStartOn] = useState(dateOnly(task?.start_at ?? null) ?? initialDate);
  const [dueOn, setDueOn] = useState(dateOnly(task?.due_at ?? null) ?? initialDate);
  const [description, setDescription] = useState(task?.description ?? "");
  const [requestNote, setRequestNote] = useState(task?.request_note ?? "");
  const [result, setResult] = useState(task?.result ?? "");
  const [nextAction, setNextAction] = useState(task?.next_action ?? "");
  const [dependsOnTaskId, setDependsOnTaskId] = useState(task?.depends_on_task_id ?? "");
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<Task["recurrence_frequency"]>(
    task?.recurrence_frequency ?? "daily",
  );
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    String(task?.recurrence_interval ?? 1),
  );
  const [recurrenceUntil, setRecurrenceUntil] = useState(task?.recurrence_until ?? "");
  const projects = data.workProjects.filter((project) => !project.deleted_at);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const project = projects.find((item) => item.id === projectId);
    const recurring = sourceType === "recurring";
    const normalizedStart = recurring ? startOn || today : startOn;
    const normalizedDue = recurring ? dueOn || normalizedStart : dueOn;
    const recurrenceNextOn = recurring
      ? (task?.recurrence_next_on ?? normalizedStart) || today
      : null;
    await onSave("tasks", {
      ...(task ? { id: task.recurrence_template_id ?? task.id } : {}),
      area_id: project?.area_id ?? data.workAreas.find((area) => !area.deleted_at)?.id ?? null,
      project_id: projectId || null,
      title: title.trim(),
      description: description.trim() || null,
      result: result.trim() || null,
      next_action: nextAction.trim() || null,
      source_type: sourceType,
      requester_name: sourceType === "requested" ? requester.trim() || null : null,
      requested_on: sourceType === "requested" ? task?.requested_on ?? today : null,
      request_note: sourceType === "requested" ? requestNote.trim() || null : null,
      status,
      priority,
      start_at: normalizedStart ? timestamp(normalizedStart) : null,
      due_at: normalizedDue ? dueTimestamp(normalizedDue) : null,
      completed_at: status === "done" ? task?.completed_at ?? now : null,
      depends_on_task_id: dependsOnTaskId || null,
      recurrence_frequency: recurring ? recurrenceFrequency : null,
      recurrence_interval: recurring ? Math.max(1, Number(recurrenceInterval) || 1) : 1,
      recurrence_weekday: recurring && normalizedStart ? new Date(`${normalizedStart}T12:00:00Z`).getUTCDay() : null,
      recurrence_until: recurring ? recurrenceUntil || null : null,
      recurrence_next_on: recurrenceNextOn,
      recurrence_active: recurring,
      deleted_at: null,
      updated_at: now,
    });
    onClose();
  }
  return (
    <div className="modal-backdrop">
      <form className="editor task-editor" onSubmit={(event) => void submit(event)}>
        <header>
          <div>
            <small>업무</small>
            <h2>{task ? "업무 수정" : "업무 추가"}</h2>
          </div>
          <button type="button" aria-label="업무 편집 닫기" onClick={onClose}>
            ✕
          </button>
        </header>
        <label className="form-field">
          <span>제목</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus required />
        </label>
        <div className="form-pair">
          <label className="form-field">
            <span>프로젝트</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">미분류 업무</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>업무 출처</span>
            <select value={sourceType} onChange={(event) => setSourceType(event.target.value as TaskSource)}>
              {Object.entries(sourceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="form-field">
          <span>선행 업무 (선택)</span>
          <select value={dependsOnTaskId} onChange={(event) => setDependsOnTaskId(event.target.value)}>
            <option value="">없음</option>
            {data.tasks
              .filter((item) => !item.deleted_at && item.id !== (task?.recurrence_template_id ?? task?.id))
              .sort((a, b) => a.title.localeCompare(b.title, "ko"))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                  {item.project_id ? ` · ${data.workProjects.find((project) => project.id === item.project_id)?.name ?? ""}` : ""}
                </option>
              ))}
          </select>
        </label>
        {sourceType === "recurring" && (
          <div className="recurrence-box">
            <div className="recurrence-heading">
              <strong>반복 규칙</strong>
              <small>{recurrenceFrequency ? recurrenceText({ ...task, recurrence_frequency: recurrenceFrequency, recurrence_interval: Math.max(1, Number(recurrenceInterval) || 1) } as Task) : ""}</small>
            </div>
            <div className="form-pair">
              <label className="form-field">
                <span>반복 주기</span>
                <select value={recurrenceFrequency ?? "daily"} onChange={(event) => setRecurrenceFrequency(event.target.value as Task["recurrence_frequency"])}>
                  <option value="daily">매일</option>
                  <option value="weekly">매주</option>
                  <option value="monthly">매월</option>
                </select>
              </label>
              <label className="form-field">
                <span>간격</span>
                <input type="number" min={1} value={recurrenceInterval} onChange={(event) => setRecurrenceInterval(event.target.value)} />
              </label>
            </div>
            <label className="form-field">
              <span>반복 종료일 (선택)</span>
              <input type="date" value={recurrenceUntil} onChange={(event) => setRecurrenceUntil(event.target.value)} />
            </label>
          </div>
        )}
        {sourceType === "requested" && (
          <div className="form-pair">
            <label className="form-field">
              <span>요청자</span>
              <input value={requester} onChange={(event) => setRequester(event.target.value)} required />
            </label>
            <label className="form-field">
              <span>요청일</span>
              <input type="date" value={task?.requested_on ?? today} readOnly />
            </label>
          </div>
        )}
        <div className="form-pair">
          <label className="form-field">
            <span>실행 예정일</span>
            <input type="date" value={startOn} onChange={(event) => setStartOn(event.target.value)} />
          </label>
          <label className="form-field">
            <span>마감일</span>
            <input type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
          </label>
        </div>
        <div className="form-pair">
          <label className="form-field">
            <span>상태</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>우선순위</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
              {Object.entries(priorityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {sourceType === "requested" && (
          <label className="form-field">
            <span>요청 내용</span>
            <textarea rows={2} value={requestNote} onChange={(event) => setRequestNote(event.target.value)} />
          </label>
        )}
        <label className="form-field">
          <span>메모</span>
          <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="form-pair">
          <label className="form-field">
            <span>처리 결과</span>
            <textarea rows={2} value={result} onChange={(event) => setResult(event.target.value)} />
          </label>
          <label className="form-field">
            <span>다음 행동</span>
            <textarea rows={2} value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
          </label>
        </div>
        <footer>
          {task && (
            <button
              type="button"
              className="danger-text"
              onClick={() => {
                if (window.confirm("이 업무를 휴지통으로 이동할까요?")) {
                  onArchive({ ...task, id: task.recurrence_template_id ?? task.id });
                  onClose();
                }
              }}
            >
              휴지통
            </button>
          )}
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button className="primary" type="submit">
            저장
          </button>
        </footer>
      </form>
    </div>
  );
}

function ProjectForm({
  data,
  project,
  onSave,
  onClose,
}: {
  data: Data;
  project: WorkProject | null;
  onSave: Save;
  onClose: () => void;
}) {
  useModalEscape(onClose);
  const [name, setName] = useState(project?.name ?? "");
  const [areaId, setAreaId] = useState(project?.area_id ?? data.workAreas.find((area) => !area.deleted_at)?.id ?? "");
  const [status, setStatus] = useState(project?.status ?? "active");
  const [priority, setPriority] = useState(project?.priority ?? "normal");
  const [startOn, setStartOn] = useState(project?.start_on ?? "");
  const [dueOn, setDueOn] = useState(project?.due_on ?? "");
  const [color, setColor] = useState(project?.color ?? "#4e986e");
  const [description, setDescription] = useState(project?.description ?? "");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !areaId) return;
    await onSave("workProjects", {
      ...(project ? { id: project.id } : {}),
      area_id: areaId,
      name: name.trim(),
      description: description.trim() || null,
      color,
      status,
      priority,
      start_on: startOn || null,
      due_on: dueOn || null,
      deleted_at: null,
    });
    onClose();
  }
  return (
    <div className="modal-backdrop">
      <form className="editor task-editor" onSubmit={(event) => void submit(event)}>
        <header>
          <div>
            <small>프로젝트</small>
            <h2>{project ? "프로젝트 수정" : "프로젝트 추가"}</h2>
          </div>
          <button type="button" aria-label="프로젝트 편집 닫기" onClick={onClose}>
            ✕
          </button>
        </header>
        <label className="form-field">
          <span>프로젝트명</span>
          <input value={name} onChange={(event) => setName(event.target.value)} autoFocus required />
        </label>
        <label className="form-field">
          <span>업무 영역</span>
          <select value={areaId} onChange={(event) => setAreaId(event.target.value)} required>
            {data.workAreas.filter((area) => !area.deleted_at).map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-pair">
          <label className="form-field">
            <span>시작일</span>
            <input type="date" value={startOn} onChange={(event) => setStartOn(event.target.value)} />
          </label>
          <label className="form-field">
            <span>목표일</span>
            <input type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
          </label>
        </div>
        <div className="form-pair">
          <label className="form-field">
            <span>상태</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as WorkProject["status"]) }>
              <option value="active">진행 중</option>
              <option value="paused">보류</option>
              <option value="completed">완료</option>
            </select>
          </label>
          <label className="form-field">
            <span>우선순위</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
              {Object.entries(priorityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="form-field color-field">
          <span>캘린더 색상</span>
          <div className="color-input-row">
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="프로젝트 캘린더 색상" />
            <code>{color.toUpperCase()}</code>
            <small>이 프로젝트에 연결된 업무 바에 적용됩니다.</small>
          </div>
        </label>
        <label className="form-field">
          <span>설명</span>
          <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <footer>
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button className="primary" type="submit">
            저장
          </button>
        </footer>
      </form>
    </div>
  );
}

function TaskRow({
  task,
  data,
  today,
  onToggle,
  onEdit,
}: {
  task: Task;
  data: Data;
  today: string;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
}) {
  const project = data.workProjects.find((item) => item.id === task.project_id);
  const dependency = data.tasks.find((item) => item.id === task.depends_on_task_id && !item.deleted_at);
  const dependencyBlocked = !!dependency && dependency.status !== "done" && dependency.status !== "cancelled";
  const due = dateOnly(task.due_at);
  const overdue = due !== null && due < today && task.status !== "done";
  return (
    <div className={`task-row${overdue ? " overdue" : ""}${dependencyBlocked ? " blocked" : ""}${task.status === "done" ? " done" : ""}`}>
      <input
        type="checkbox"
        checked={task.status === "done"}
        aria-label={`${task.title} 완료`}
        onChange={() => onToggle(task)}
      />
      <div className="task-row-main">
        <strong>{task.title}</strong>
        <small>
          {sourceLabels[task.source_type]}
          {task.recurrence_frequency ? ` · ${recurrenceText(task)}` : ""}
          {task.requester_name ? ` · ${task.requester_name}` : ""}
        </small>
        {project && <small className="task-project-label">프로젝트 · {project.name}</small>}
        <div className="task-row-dates">
          <span>등록 {compactDate(task.created_at)}</span>
          <span>실행 {compactDate(task.start_at)}</span>
          <span>마감 {compactDate(task.due_at)}</span>
        </div>
        {dependency && (
          <small className={`task-dependency${dependencyBlocked ? " blocked" : ""}`}>
            선행: {dependency.title} · {dependencyBlocked ? "미완료" : "완료"}
          </small>
        )}
      </div>
      <span className={`task-status${dependencyBlocked ? " blocked" : ""}`}>
        {dependencyBlocked ? "선행 대기" : statusLabels[task.status]}
      </span>
      <span className={`task-due${overdue ? " task-overdue" : ""}`}>
        {dateLabel(task.due_at ?? task.start_at, today)}
      </span>
      <button aria-label={`${task.title} 수정`} onClick={() => onEdit(task)}>
        ⋯
      </button>
    </div>
  );
}

export function TaskWorkspace({
  data,
  events,
  today,
  serverNow,
  syncLabel,
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
  syncLabel: string;
  month: string;
  onMonthChange: (month: string) => void;
  onSave: Save;
  onUpdate: Update;
  onEditEvent: (event: MarketingEvent | null, date?: string) => void;
  initialCreate?: boolean;
  onCompleteRecurring?: (task: Task, completed: boolean) => void | Promise<void>;
}) {
  const [filters, setFilters] = useState<Array<"today" | "requested" | "recurring">>([]);
  const [showProjects, setShowProjects] = useState(false);
  const [taskEditor, setTaskEditor] = useState<Task | null | undefined>(initialCreate ? null : undefined);
  const [newTaskProjectId, setNewTaskProjectId] = useState("");
  const [newTaskDate, setNewTaskDate] = useState("");
  const [selectedDate, setSelectedDate] = useState(today);
  const [projectEditor, setProjectEditor] = useState<WorkProject | null | undefined>();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const calendarWheelLocked = useRef(false);
  const materialized = useMemo(
    () => materializedTasks(data, today),
    [data, today],
  );
  const visibleTasks = useMemo(() => {
    const tasks = filters.length
      ? materialized.filter((task) => filters.some((filter) => {
          if (filter === "today") {
            const start = dateOnly(task.start_at);
            const due = dateOnly(task.due_at);
            return task.status !== "done" && task.status !== "cancelled" &&
              (start === today || due === today || (due !== null && due < today));
          }
          if (filter === "requested") return task.source_type === "requested" && task.status !== "cancelled";
          return task.source_type === "recurring" && task.status !== "cancelled";
        }))
      : [...materialized];
    return tasks.sort((a, b) => {
      const aDue = dateOnly(a.due_at) ?? "9999-12-31";
      const bDue = dateOnly(b.due_at) ?? "9999-12-31";
      return aDue.localeCompare(bDue) || a.sort_order - b.sort_order;
    });
  }, [materialized, filters, today]);
  const toggle = (task: Task) => {
    if (task.recurrence_template_id && task.occurrence_on && onCompleteRecurring) {
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
  const selectCalendarDate = (day: string) => setSelectedDate(day);
  const openTaskForDate = (day: string) => {
    selectCalendarDate(day);
    setNewTaskProjectId("");
    setNewTaskDate(day);
    setTaskEditor(null);
  };
  const setCalendarMonth = (nextMonth: string) => {
    onMonthChange(nextMonth);
    setSelectedDate(nextMonth === today.slice(0, 7) ? today : `${nextMonth}-01`);
  };
  const moveCalendarMonth = (offset: number) => {
    const [year, currentMonth] = month.split("-").map(Number);
    const next = new Date(Date.UTC(year, currentMonth - 1 + offset, 1));
    const nextMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    setCalendarMonth(nextMonth);
  };
  const handleCalendarWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.deltaY || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
    event.preventDefault();
    if (calendarWheelLocked.current) return;
    calendarWheelLocked.current = true;
    moveCalendarMonth(event.deltaY > 0 ? 1 : -1);
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
    const weekDays = week.filter((day): day is string => !!day);
    const weekStart = weekDays[0];
    const weekEnd = weekDays[weekDays.length - 1];
    const showProjectBars = showProjects;
    const projectBars = !weekStart || !weekEnd || !showProjectBars ? [] : data.workProjects
      .filter((project) => !project.deleted_at && project.start_on && project.due_on)
      .flatMap((project) => {
        const rangeStart = project.start_on! <= project.due_on! ? project.start_on! : project.due_on!;
        const rangeEnd = project.start_on! <= project.due_on! ? project.due_on! : project.start_on!;
        if (rangeEnd < weekStart || rangeStart > weekEnd) return [];
        const segmentStart = rangeStart < weekStart ? weekStart : rangeStart;
        const segmentEnd = rangeEnd > weekEnd ? weekEnd : rangeEnd;
        const startColumn = week.findIndex((day) => day === segmentStart) + 1;
        const endColumn = week.findIndex((day) => day === segmentEnd) + 2;
        if (startColumn < 1 || endColumn <= startColumn) return [];
        return [{
          kind: "project" as const,
          project,
          startColumn,
          endColumn,
          lane: 0,
          label: segmentStart === rangeStart ? project.name : `↳ ${project.name}`,
        }];
      });
    const eventBars = !weekStart || !weekEnd ? [] : activeEvents.flatMap((event) => {
      const start = dateOnly(event.starts_at);
      const due = dateOnly(event.ends_at) ?? start;
      if (!start || !due) return [];
      const rangeStart = start <= due ? start : due;
      const rangeEnd = start <= due ? due : start;
      if (rangeEnd < weekStart || rangeStart > weekEnd) return [];
      const segmentStart = rangeStart < weekStart ? weekStart : rangeStart;
      const segmentEnd = rangeEnd > weekEnd ? weekEnd : rangeEnd;
      const startColumn = week.findIndex((day) => day === segmentStart) + 1;
      const endColumn = week.findIndex((day) => day === segmentEnd) + 2;
      if (startColumn < 1 || endColumn <= startColumn) return [];
      return [{
        kind: "event" as const,
        event,
        startColumn,
        endColumn,
        lane: 0,
        label: segmentStart === rangeStart ? event.title : `↳ ${event.title}`,
      }];
    });
    const taskBars = !weekStart || !weekEnd ? [] : visibleTasks.flatMap((task) => {
      const start = dateOnly(task.start_at) ?? dateOnly(task.due_at);
      const due = dateOnly(task.due_at) ?? start;
      if (!start || !due) return [];
      const rangeStart = start <= due ? start : due;
      const rangeEnd = start <= due ? due : start;
      if (rangeEnd < weekStart || rangeStart > weekEnd) return [];
      const segmentStart = rangeStart < weekStart ? weekStart : rangeStart;
      const segmentEnd = rangeEnd > weekEnd ? weekEnd : rangeEnd;
      const startColumn = week.findIndex((day) => day === segmentStart) + 1;
      const endColumn = week.findIndex((day) => day === segmentEnd) + 2;
      if (startColumn < 1 || endColumn <= startColumn) return [];
      return [{
        kind: "task" as const,
        task,
        startColumn,
        endColumn,
        lane: 0,
        label: segmentStart === rangeStart ? task.title : `↳ ${task.title}`,
      }];
    });
    const priority = { event: 0, task: 1, project: 2 } as const;
    const bars = [...projectBars, ...eventBars, ...taskBars]
      .sort((a, b) =>
        priority[a.kind] - priority[b.kind] ||
        a.startColumn - b.startColumn ||
        a.endColumn - b.endColumn,
      );
    const lanes: Array<Array<{ startColumn: number; endColumn: number }>> = [];
    const positionedBars = bars.map((bar) => {
      let lane = lanes.findIndex((items) =>
        items.every(
          (item) =>
            item.endColumn <= bar.startColumn || item.startColumn >= bar.endColumn,
        ),
      );
      if (lane < 0) {
        lane = lanes.length;
        lanes.push([]);
      }
      lanes[lane].push({
        startColumn: bar.startColumn,
        endColumn: bar.endColumn,
      });
      return { ...bar, lane };
    });
    return { week, bars: positionedBars, laneCount: Math.max(1, lanes.length) };
  });
  const dailyTasks = (calendarTasks.get(selectedDate) ?? []).filter(
    (task, index, tasks) => tasks.findIndex((item) => item.id === task.id) === index,
  );
  const dailyEvents = activeEvents.filter((event) => {
    const start = dateOnly(event.starts_at);
    const end = dateOnly(event.ends_at) ?? start;
    return !!start && !!end && start <= selectedDate && selectedDate <= end;
  });
  const toggleFilter = (value: "today" | "requested" | "recurring") => {
    setFilters((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };
  const resetFilters = () => {
    setFilters([]);
  };
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
  return (
    <div className="work-page">
      <div className="task-2l">
        <div className="task-2l-leading">
          <h1>업무</h1>
          <div className="segmented task-filters">
            {([
              ["today", "오늘"],
              ["all", "전체"],
              ["requested", "요청받은 업무"],
              ["recurring", "반복 업무"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                className={value === "all" ? (!filters.length ? "selected" : "") : filters.includes(value) ? "selected" : ""}
                onClick={() => value === "all" ? resetFilters() : toggleFilter(value)}
              >
                {label}
              </button>
            ))}
            <button className={showProjects ? "selected project-toggle" : "project-toggle"} onClick={() => setShowProjects((current) => !current)}>
              프로젝트
            </button>
          </div>
          <span className="task-sync-status" role="status">{syncLabel}</span>
        </div>
        <div className="task-2l-tools">
          <button aria-label="이전 달" onClick={() => moveCalendarMonth(-1)}>‹</button>
          <input aria-label="업무 캘린더 월" type="month" value={month} onChange={(event) => event.target.value && setCalendarMonth(event.target.value)} />
          <button aria-label="다음 달" onClick={() => moveCalendarMonth(1)}>›</button>
          <button onClick={() => setCalendarMonth(today.slice(0, 7))}>오늘 {today.slice(5).replace("-", "/")}</button>
          <span className="task-clock">한국 {koreanClock(serverNow)}</span>
          <button className="primary" onClick={() => { setNewTaskProjectId(""); setNewTaskDate(""); setTaskEditor(null); }}>＋ 업무</button>
          <button onClick={() => setProjectEditor(null)}>＋ 프로젝트</button>
        </div>
      </div>
      <div className="work-layout">
        <main className="work-main">
          <div className="work-overview-grid">
            <section className="task-calendar calendar-main panel">
              <div className="section-toolbar"><h2>{month.replace("-", "년 ")}월 업무 캘린더</h2><small>날짜 사이 업무 흐름 포함 · 오늘 {today.slice(5).replace("-", "/")}</small></div>
              <div className="calendar-weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <b key={day}>{day}</b>)}</div>
              <div className="calendar-grid" onWheel={handleCalendarWheel}>
                {calendarWeeks.map(({ week, bars, laneCount }, weekIndex) => (
                  <div className="calendar-week" key={`week-${weekIndex}`} style={{ minHeight: `${Math.max(96, 21 + laneCount * 19)}px` }}>
                    <div className="calendar-days">
                      {week.map((day, index) => <div className={`${!day ? "calendar-day empty" : day === today ? "calendar-day today" : day === selectedDate ? "calendar-day selected" : "calendar-day"}${day && dragOverDate === day ? " drag-over" : ""}`} key={day ?? `empty-${weekIndex}-${index}`} onClick={() => day && selectCalendarDate(day)} onDragOver={(event) => { if (day && draggedTaskId) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverDate(day); } }} onDragLeave={() => day && dragOverDate === day && setDragOverDate(null)} onDrop={(event) => { if (!day) return; event.preventDefault(); const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId; if (taskId) moveTaskToDate(taskId, day); }}>
                        {day && <button className="calendar-day-add" aria-label={`${day} 업무 추가`} onClick={(event) => { event.stopPropagation(); openTaskForDate(day); }}>
                          <b>{Number(day.slice(-2))}</b><span>＋</span>
                        </button>}
                      </div>)}
                    </div>
                    <div className="calendar-week-bars" aria-label="프로젝트 업무 흐름">
                      {bars.map((bar) => {
                        const task = bar.kind === "task" ? bar.task : undefined;
                        const project = bar.kind === "project" ? bar.project : task ? data.workProjects.find((item) => item.id === task.project_id) : undefined;
                        const event = bar.kind === "event" ? bar.event : undefined;
                        const color = event ? "#8b68b6" : projectColor(project);
                        const draggable = bar.kind === "task" && !bar.task.recurrence_template_id;
                        return <button
                          className={`calendar-task-bar${bar.kind === "project" ? " calendar-project-bar" : ""}${bar.kind === "event" ? " calendar-event-bar" : ""}${bar.kind === "task" && bar.task.status === "done" ? " done" : ""}`}
                          key={`${bar.kind}:${bar.kind === "project" ? bar.project.id : bar.kind === "event" ? bar.event.id : bar.task.id}:${weekIndex}`}
                          draggable={draggable}
                          style={{ left: `${((bar.startColumn - 1) / 7) * 100}%`, width: `calc(${((bar.endColumn - bar.startColumn) / 7) * 100}% - 4px)`, top: `${18 + bar.lane * 19}px`, backgroundColor: color, color: readableOnColor(color) }}
                          title={`${bar.label}${project ? ` · ${project.name}` : event ? ` · ${event.location ?? "이벤트"}` : ""}`}
                          onDragStart={(dragEvent) => { if (!draggable || !task) return; dragEvent.dataTransfer.effectAllowed = "move"; dragEvent.dataTransfer.setData("text/plain", task.id); setDraggedTaskId(task.id); }}
                          onDragEnd={() => { setDraggedTaskId(null); setDragOverDate(null); }}
                          onClick={(clickEvent) => { clickEvent.stopPropagation(); if (task) setTaskEditor(task); else if (project) setProjectEditor(project); else if (event) onEditEvent(event); }}
                        >
                          {bar.label}
                        </button>;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="task-list task-tree panel">
              <div className="section-toolbar">
                <div>
                  <h2>{selectedDate.slice(5).replace("-", "/")} 업무 목록</h2>
                  <small>선택일 업무 {dailyTasks.length}건 · 이벤트 {dailyEvents.length}건</small>
                </div>
                <div className="inline-tools">
                  <button onClick={() => openTaskForDate(selectedDate)}>＋ 업무</button>
                  <button onClick={() => onEditEvent(null, selectedDate)}>＋ 이벤트</button>
                </div>
              </div>
              {dailyTasks.length ? dailyTasks.map((task) => (
                <TaskRow key={task.id} task={task} data={data} today={today} onToggle={toggle} onEdit={(item) => setTaskEditor(item)} />
              )) : null}
              {dailyEvents.map((event) => (
                <div className="task-event-row" key={event.id}>
                  <span className="task-event-dot" aria-hidden="true" />
                  <div>
                    <strong>{event.title}</strong>
                    <small>이벤트 · {event.location || "장소 미입력"} · {event.status}</small>
                  </div>
                  <button aria-label={`${event.title} 이벤트 수정`} onClick={() => onEditEvent(event)}>⋯</button>
                </div>
              ))}
              {!dailyTasks.length && !dailyEvents.length && <div className="empty-small">이 날짜에 예정된 업무나 이벤트가 없습니다.</div>}
            </section>
          </div>
        </main>
      </div>
      {taskEditor !== undefined && <TaskForm data={data} today={today} now={serverNow} task={taskEditor} initialProjectId={taskEditor ? "" : newTaskProjectId} initialDate={taskEditor ? "" : newTaskDate} onSave={onSave} onArchive={(task) => onUpdate("tasks", task.id, { deleted_at: serverNow })} onClose={() => { setTaskEditor(undefined); setNewTaskDate(""); }} />}
      {projectEditor !== undefined && <ProjectForm data={data} project={projectEditor} onSave={onSave} onClose={() => setProjectEditor(undefined)} />}
    </div>
  );
}
