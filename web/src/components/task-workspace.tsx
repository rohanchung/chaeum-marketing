"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Data,
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
type DeleteRecord = (collection: Collection, id: string) => void;

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
const activeTask = (task: Task) =>
  !task.deleted_at && task.status !== "done" && task.status !== "cancelled";

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
  task,
  initialProjectId = "",
  initialDate = "",
  onSave,
  onArchive,
  onClose,
}: {
  data: Data;
  today: string;
  task: Task | null;
  initialProjectId?: string;
  initialDate?: string;
  onSave: Save;
  onArchive: (task: Task) => void;
  onClose: () => void;
}) {
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
      completed_at: status === "done" ? task?.completed_at ?? new Date().toISOString() : null,
      depends_on_task_id: dependsOnTaskId || null,
      recurrence_frequency: recurring ? recurrenceFrequency : null,
      recurrence_interval: recurring ? Math.max(1, Number(recurrenceInterval) || 1) : 1,
      recurrence_weekday: recurring && normalizedStart ? new Date(`${normalizedStart}T12:00:00Z`).getUTCDay() : null,
      recurrence_until: recurring ? recurrenceUntil || null : null,
      recurrence_next_on: recurrenceNextOn,
      recurrence_active: recurring,
      deleted_at: null,
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
  const [name, setName] = useState(project?.name ?? "");
  const [areaId, setAreaId] = useState(project?.area_id ?? data.workAreas.find((area) => !area.deleted_at)?.id ?? "");
  const [status, setStatus] = useState(project?.status ?? "active");
  const [priority, setPriority] = useState(project?.priority ?? "normal");
  const [startOn, setStartOn] = useState(project?.start_on ?? "");
  const [dueOn, setDueOn] = useState(project?.due_on ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !areaId) return;
    await onSave("workProjects", {
      ...(project ? { id: project.id } : {}),
      area_id: areaId,
      name: name.trim(),
      description: description.trim() || null,
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

const linkTypes = [
  ["event", "이벤트"],
  ["channel", "채널"],
  ["content", "콘텐츠"],
  ["promotion", "광고 집행"],
  ["purchase", "구매"],
] as const;
type LinkType = (typeof linkTypes)[number][0];
function linkOptions(data: Data, type: LinkType) {
  if (type === "event")
    return data.events.filter((item) => !item.deleted_at).map((item) => ({ id: item.id, label: item.title }));
  if (type === "channel")
    return data.channels.filter((item) => !item.deleted_at).map((item) => ({ id: item.id, label: item.name }));
  if (type === "content")
    return data.contents.filter((item) => !item.deleted_at).map((item) => ({ id: item.id, label: item.title }));
  if (type === "promotion")
    return data.promotions.filter((item) => !item.deleted_at).map((item) => ({ id: item.id, label: item.title }));
  return data.purchases.filter((item) => !item.deleted_at).map((item) => ({ id: item.id, label: item.title }));
}
function linkTitle(data: Data, type: LinkType, id: string) {
  return linkOptions(data, type).find((item) => item.id === id)?.label ?? "기록 없음";
}
function ProjectLinks({
  data,
  projectId,
  onSave,
  onDelete,
}: {
  data: Data;
  projectId: string;
  onSave: Save;
  onDelete: DeleteRecord;
}) {
  const [type, setType] = useState<LinkType>("event");
  const options = linkOptions(data, type);
  const [entityId, setEntityId] = useState(options[0]?.id ?? "");
  const links = data.workLinks.filter((link) => link.project_id === projectId);
  async function addLink() {
    if (!entityId) return;
    await onSave("workLinks", { project_id: projectId, task_id: null, entity_type: type, entity_id: entityId });
  }
  return (
    <section className="project-links panel">
      <div className="section-toolbar">
        <div>
          <small className="eyebrow">CONNECTED RECORDS</small>
          <h2>연결된 운영 기록</h2>
        </div>
        <small>{links.length}건</small>
      </div>
      <div className="project-link-add">
        <select value={type} onChange={(event) => {
          const next = event.target.value as LinkType;
          setType(next);
          setEntityId(linkOptions(data, next)[0]?.id ?? "");
        }}>
          {linkTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={entityId} onChange={(event) => setEntityId(event.target.value)}>
          {!options.length && <option value="">연결할 기록 없음</option>}
          {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        <button disabled={!entityId} onClick={() => void addLink().catch(() => {})}>연결</button>
      </div>
      {links.length ? (
        <div className="project-link-list">
          {links.map((link) => {
            const linkType = link.entity_type as LinkType;
            return <div className="project-link-row" key={link.id}>
              <span>{linkTypes.find(([value]) => value === linkType)?.[1]}</span>
              <strong>{linkTitle(data, linkType, link.entity_id)}</strong>
              <button onClick={() => onDelete("workLinks", link.id)}>해제</button>
            </div>;
          })}
        </div>
      ) : <div className="empty-small">이 프로젝트의 원본 운영 기록을 연결해 보세요.</div>}
    </section>
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
    <div className={`task-row${overdue ? " overdue" : ""}${dependencyBlocked ? " blocked" : ""}`}>
      <input
        type="checkbox"
        checked={task.status === "done"}
        aria-label={`${task.title} 완료`}
        onChange={() => onToggle(task)}
      />
      <div className="task-row-main">
        <strong>{task.title}</strong>
        <small>
          {project?.name ?? "미분류 업무"} · {sourceLabels[task.source_type]}
          {task.recurrence_frequency ? ` · ${recurrenceText(task)}` : ""}
          {task.requester_name ? ` · ${task.requester_name}` : ""}
        </small>
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
  today,
  onSave,
  onUpdate,
  onDelete,
  initialProjectId = "",
  initialCreate = false,
  onCompleteRecurring,
}: {
  data: Data;
  today: string;
  onSave: Save;
  onUpdate: Update;
  onDelete: DeleteRecord;
  initialProjectId?: string;
  initialCreate?: boolean;
  onCompleteRecurring?: (task: Task, completed: boolean) => void | Promise<void>;
}) {
  const [filter, setFilter] = useState<"today" | "projects" | "all" | "requested" | "recurring">("all");
  const [projectId, setProjectId] = useState(initialProjectId);
  const [taskEditor, setTaskEditor] = useState<Task | null | undefined>(initialCreate ? null : undefined);
  const [newTaskProjectId, setNewTaskProjectId] = useState(initialProjectId);
  const [projectEditor, setProjectEditor] = useState<WorkProject | null | undefined>();
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const projects = data.workProjects
    .filter((project) => !project.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order);
  const materialized = useMemo(
    () => materializedTasks(data, today),
    [data, today],
  );
  const visibleTasks = useMemo(() => {
    let tasks = [...materialized];
    if (filter === "today") {
      tasks = tasks.filter((task) => {
        const start = dateOnly(task.start_at);
        const due = dateOnly(task.due_at);
        return task.status !== "done" && task.status !== "cancelled" &&
          (start === today || due === today || (due !== null && due < today));
      });
    } else if (filter === "projects") {
      tasks = tasks.filter((task) => !projectId || task.project_id === projectId);
    } else if (filter === "requested") {
      tasks = tasks.filter((task) => task.source_type === "requested" && task.status !== "cancelled");
    } else if (filter === "recurring") {
      tasks = tasks.filter((task) => task.source_type === "recurring" && task.status !== "cancelled");
    }
    return tasks.sort((a, b) => {
      const aDone = a.status === "done" ? 1 : 0;
      const bDone = b.status === "done" ? 1 : 0;
      const aDue = dateOnly(a.due_at) ?? "9999-12-31";
      const bDue = dateOnly(b.due_at) ?? "9999-12-31";
      return aDone - bDone || aDue.localeCompare(bDue) || a.sort_order - b.sort_order;
    });
  }, [materialized, filter, projectId, today]);
  const timelineTasks = filter === "all" ? materialized : visibleTasks;
  const toggle = (task: Task) => {
    if (task.recurrence_template_id && task.occurrence_on && onCompleteRecurring) {
      void Promise.resolve(onCompleteRecurring(task, task.status !== "done")).catch(() => {});
      return;
    }
    onUpdate("tasks", task.id, {
      status: task.status === "done" ? "planned" : "done",
      completed_at: task.status === "done" ? null : new Date().toISOString(),
    });
  };
  const currentProject = projects.find((project) => project.id === projectId) ?? null;
  const calendarDays = dates(monthPeriod(today.slice(0, 7)));
  const calendarTasks = new Map<string, Task[]>();
  for (const task of materialized) {
    const day = dateOnly(task.due_at ?? task.start_at);
    if (day) calendarTasks.set(day, [...(calendarTasks.get(day) ?? []), task]);
  }
  return (
    <div className="work-page">
      <div className="page-title">
        <div>
          <small className="eyebrow">WORKSPACE</small>
          <h1>업무</h1>
          <p>오늘의 실행 업무와 프로젝트 흐름을 한곳에서 관리합니다.</p>
        </div>
        <div className="inline-tools">
          <button onClick={() => setProjectEditor(null)}>＋ 프로젝트</button>
          <button className="primary" onClick={() => { setNewTaskProjectId(""); setTaskEditor(null); }}>＋ 업무</button>
        </div>
      </div>
      <div className="work-filters">
        <div className="segmented">
          {([
            ["today", "오늘"],
            ["projects", "프로젝트"],
            ["all", "전체"],
            ["requested", "요청받은 업무"],
            ["recurring", "반복 업무"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "selected" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <small className="work-view-note">목록 · 타임라인 · 캘린더를 한 화면에서 봅니다.</small>
      </div>
      <div className="work-layout">
        <main className="work-main">
          {filter === "projects" && currentProject && (
            <section className="project-header panel">
              <div>
                <small className="eyebrow">PROJECT</small>
                <h2>{currentProject.name}</h2>
                <p>{currentProject.start_on ?? "시작일 미정"} → {currentProject.due_on ?? "목표일 미정"}</p>
              </div>
              <div className="inline-tools">
                <span className={`project-status ${currentProject.status}`}>{currentProject.status === "active" ? "진행 중" : currentProject.status === "paused" ? "보류" : "완료"}</span>
                <button onClick={() => setProjectEditor(currentProject)}>수정</button>
              </div>
            </section>
          )}
          {filter === "projects" && currentProject && (
            <ProjectLinks
              data={data}
              projectId={currentProject.id}
              onSave={onSave}
              onDelete={onDelete}
            />
          )}
          <div className="work-overview-grid">
            <section className="task-list task-tree panel">
              <div className="section-toolbar">
                <div>
                  <h2>프로젝트 업무 목록</h2>
                  <small>{visibleTasks.length}건</small>
                </div>
                <div className="inline-tools">
                  <button onClick={() => setProjectEditor(null)}>＋ 프로젝트</button>
                  <button onClick={() => { setNewTaskProjectId(""); setTaskEditor(null); }}>＋ 업무</button>
                </div>
              </div>
              {projects.map((project) => {
                const tasks = visibleTasks.filter((task) => task.project_id === project.id);
                const collapsed = collapsedProjects.has(project.id);
                const total = materialized.filter((task) => task.project_id === project.id).length;
                const done = materialized.filter((task) => task.project_id === project.id && task.status === "done").length;
                return (
                  <div className="project-group" key={project.id}>
                    <div className="project-tree-heading">
                      <button
                        className="project-tree-title"
                        aria-expanded={!collapsed}
                        onClick={() => setCollapsedProjects((current) => {
                          const next = new Set(current);
                          if (next.has(project.id)) next.delete(project.id); else next.add(project.id);
                          return next;
                        })}
                      >
                        <span className="project-disclosure">{collapsed ? "▸" : "▾"}</span>
                        <strong>{project.name}</strong>
                        <small>{done}/{total} 완료 · {project.start_on ?? "시작일 미정"} → {project.due_on ?? "목표일 미정"}</small>
                      </button>
                      <div className="project-tree-actions">
                        <button aria-label={`${project.name} 업무 추가`} onClick={() => { setNewTaskProjectId(project.id); setTaskEditor(null); }}>＋ 업무</button>
                        <button aria-label={`${project.name} 수정`} onClick={() => setProjectEditor(project)}>⋯</button>
                      </div>
                    </div>
                    {!collapsed && (tasks.length ? tasks.map((task) => (
                      <TaskRow key={task.id} task={task} data={data} today={today} onToggle={toggle} onEdit={(item) => setTaskEditor(item)} />
                    )) : <p className="project-tree-empty">{filter === "all" ? "하위 업무가 없습니다." : "현재 필터에 해당하는 업무가 없습니다."}</p>)}
                  </div>
                );
              })}
              {(() => {
                const tasks = visibleTasks.filter((task) => !task.project_id);
                const collapsed = collapsedProjects.has("__unassigned__");
                if (!tasks.length && projects.length) return null;
                return (
                  <div className="project-group unassigned-group">
                    <div className="project-tree-heading">
                      <button className="project-tree-title" aria-expanded={!collapsed} onClick={() => setCollapsedProjects((current) => {
                        const next = new Set(current);
                        if (next.has("__unassigned__")) next.delete("__unassigned__"); else next.add("__unassigned__");
                        return next;
                      })}>
                        <span className="project-disclosure">{collapsed ? "▸" : "▾"}</span><strong>미분류 업무</strong><small>{tasks.length}건</small>
                      </button>
                    </div>
                    {!collapsed && (tasks.length ? tasks.map((task) => (
                      <TaskRow key={task.id} task={task} data={data} today={today} onToggle={toggle} onEdit={(item) => setTaskEditor(item)} />
                    )) : <p className="project-tree-empty">미분류 업무가 없습니다.</p>)}
                  </div>
                );
              })()}
              {!projects.length && !visibleTasks.length && <div className="empty-small">프로젝트 또는 업무를 추가해 보세요.</div>}
            </section>
            <section className="task-timeline panel">
              <div className="section-toolbar"><h2>프로젝트 타임라인</h2><small>{today} 기준</small></div>
              {projects.length ? projects.map((project) => {
                const tasks = timelineTasks.filter((task) => task.project_id === project.id);
                const allProjectTasks = materialized.filter((task) => task.project_id === project.id);
                const done = allProjectTasks.filter((task) => task.status === "done").length;
                return (
                  <div className="timeline-project" key={project.id}>
                    <button className="timeline-project-head" onClick={() => { setProjectId(project.id); setFilter("projects"); }}>
                      <span><strong>{project.name}</strong><small>{project.start_on ?? "시작일 미정"} → {project.due_on ?? "목표일 미정"}</small></span>
                      <i><b style={{ width: `${Math.max(12, Math.min(100, allProjectTasks.length ? (done / allProjectTasks.length) * 100 : 0))}%` }} /></i>
                      <em>{done}/{allProjectTasks.length}</em>
                    </button>
                    {tasks.slice(0, 8).map((task) => (
                      <button className="timeline-task" key={task.id} onClick={() => setTaskEditor(task)}>
                        <span>{task.status === "done" ? "✓" : "○"} {task.title}</span>
                        <small>{compactDate(task.start_at)} → {compactDate(task.due_at)}</small>
                      </button>
                    ))}
                    {tasks.length > 8 && <small className="timeline-more">+ {tasks.length - 8}건</small>}
                  </div>
                );
              }) : <div className="empty-small">프로젝트를 추가해 보세요.</div>}
            </section>
          </div>
          <section className="task-calendar panel">
            <div className="section-toolbar"><h2>{today.slice(0, 7).replace("-", "년 ")}월 업무 캘린더</h2><small>오늘 {today.slice(5).replace("-", "/")}</small></div>
            <div className="calendar-weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <b key={day}>{day}</b>)}</div>
            <div className="calendar-grid">
              {calendarDays.map((day) => <div className={day === today ? "calendar-day today" : "calendar-day"} key={day}>
                <b>{Number(day.slice(-2))}</b>
                {(calendarTasks.get(day) ?? []).slice(0, 3).map((task) => <button key={task.id} onClick={() => setTaskEditor(task)}>{task.title}</button>)}
              </div>)}
            </div>
          </section>
        </main>
      </div>
      {taskEditor !== undefined && <TaskForm data={data} today={today} task={taskEditor} initialProjectId={taskEditor ? "" : newTaskProjectId} onSave={onSave} onArchive={(task) => onUpdate("tasks", task.id, { deleted_at: new Date().toISOString() })} onClose={() => setTaskEditor(undefined)} />}
      {projectEditor !== undefined && <ProjectForm data={data} project={projectEditor} onSave={onSave} onClose={() => setProjectEditor(undefined)} />}
    </div>
  );
}
