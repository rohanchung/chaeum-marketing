"use client";

import { FormEvent, useState } from "react";
import { Data, Task, TaskPriority, TaskSource, TaskStatus, WorkProject, timestamp } from "@/lib/domain";
import { recurrenceText } from "@/lib/task-recurrence";
import { dateOnly, dueTimestamp } from "@/lib/task-dates";
import { Save, priorityLabels, sourceLabels, statusLabels, useModalEscape } from "./task-shared";

export function TaskForm({
  data,
  today,
  now,
  task: editingTask,
  initialProjectId = "",
  initialDate = "",
  initialParentTaskId = "",
  initialTitle = "",
  onSave,
  onArchive,
  onCreateFollowUp,
  onClose,
}: {
  data: Data;
  today: string;
  now: string;
  task: Task | null;
  initialProjectId?: string;
  initialDate?: string;
  initialParentTaskId?: string;
  initialTitle?: string;
  onSave: Save;
  onArchive: (task: Task) => void;
  onCreateFollowUp: (task: Task, title: string) => void;
  onClose: () => void;
}) {
  useModalEscape(onClose);
  // An occurrence of a recurring task edits its series record, so the series
  // keeps its first date instead of moving to the clicked occurrence.
  const task = editingTask?.recurrence_template_id
    ? data.tasks.find((item) => item.id === editingTask.recurrence_template_id) ?? editingTask
    : editingTask;
  const initialProject = task?.project_id ?? initialProjectId;
  const [title, setTitle] = useState(task?.title ?? initialTitle);
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
  const [dependsOnTaskId, setDependsOnTaskId] = useState(task?.depends_on_task_id ?? initialParentTaskId);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<Task["recurrence_frequency"]>(
    task?.recurrence_frequency ?? "daily",
  );
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    String(task?.recurrence_interval ?? 1),
  );
  const [recurrenceUntil, setRecurrenceUntil] = useState(task?.recurrence_until ?? "");
  // Keep a trashed project selectable while this task still points to it;
  // otherwise saving any other field would silently unlink the project.
  const projects = data.workProjects.filter(
    (project) => !project.deleted_at || project.id === task?.project_id,
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const project = projects.find((item) => item.id === projectId);
    const recurring = sourceType === "recurring";
    // New tasks open with today prefilled; clearing both dates keeps the task
    // undated, and it then appears under "날짜 미정" on the today board.
    const normalizedStart = recurring ? startOn || today : startOn || dueOn;
    const normalizedDue = recurring ? dueOn || normalizedStart : dueOn || normalizedStart;
    // The earliest open occurrence can never precede the series start.
    const seriesStart = normalizedStart || today;
    const recurrenceNextOn = recurring
      ? task?.recurrence_next_on && task.recurrence_next_on >= seriesStart
        ? task.recurrence_next_on
        : seriesStart
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
      sort_order: task?.sort_order ?? Math.max(0, ...data.tasks.filter((item) => !item.deleted_at).map((item) => item.sort_order)) + 100,
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
                  {project.deleted_at ? `(휴지통) ${project.name}` : project.name}
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
          <span>상위 업무 (선택)</span>
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
            <span>마감일 · 둘 다 비우면 날짜 미정</span>
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
        <label className="form-field">
          <span>처리 결과</span>
          <textarea rows={2} value={result} onChange={(event) => setResult(event.target.value)} />
        </label>
        <section className="next-task-composer">
          <div>
            <strong>다음 업무</strong>
            <small>입력한 내용을 현재 업무의 하위 업무로 바로 만듭니다.</small>
          </div>
          <div className="next-task-composer-input">
            <input value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="다음에 할 업무 입력" />
            {task && (
              <button
                type="button"
                disabled={!nextAction.trim()}
                onClick={() => onCreateFollowUp(task, nextAction.trim())}
              >
                ＋ 하위 업무
              </button>
            )}
          </div>
          {!task && <small>업무를 먼저 저장하면 하위 업무를 바로 만들 수 있습니다.</small>}
        </section>
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

export function ProjectForm({
  data,
  project,
  onSave,
  onArchive,
  onClose,
}: {
  data: Data;
  project: WorkProject | null;
  onSave: Save;
  onArchive: (project: WorkProject) => void;
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
          {project && (
            <button
              type="button"
              className="danger-text"
              onClick={() => {
                if (window.confirm("이 프로젝트를 휴지통으로 이동할까요? 연결된 업무 기록은 보존됩니다.")) {
                  onArchive(project);
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
