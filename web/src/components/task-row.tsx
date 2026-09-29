"use client";

import { DragEvent, useState } from "react";
import { Data, Task, TaskChecklistItem } from "@/lib/domain";
import { recurrenceText } from "@/lib/task-recurrence";
import { compactDate, dateLabel, dateOnly } from "@/lib/task-dates";
import { CardDropPosition, sourceLabels, statusLabels } from "./task-shared";

export function TaskRow({
  task,
  data,
  today,
  serverNow,
  depth,
  reorderable,
  dragging,
  dropPosition,
  onToggle,
  onEdit,
  onResult,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  checklistItems,
  checklistOpen,
  onChecklistOpen,
  onChecklistAdd,
  onChecklistUpdate,
  onChecklistDelete,
}: {
  task: Task;
  data: Data;
  today: string;
  serverNow: string;
  depth: number;
  reorderable: boolean;
  dragging: boolean;
  dropPosition: CardDropPosition | null;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onResult: (task: Task, result: string) => void;
  onDragStart: (event: DragEvent<HTMLElement>, task: Task) => void;
  onDragOver: (event: DragEvent<HTMLElement>, task: Task) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>, task: Task) => void;
  onDragEnd: () => void;
  checklistItems: TaskChecklistItem[];
  checklistOpen: boolean;
  onChecklistOpen: (task: Task) => void;
  onChecklistAdd: (task: Task, title: string) => void;
  onChecklistUpdate: (item: TaskChecklistItem, patch: Record<string, unknown>) => void;
  onChecklistDelete: (item: TaskChecklistItem) => void;
}) {
  const [checklistDraft, setChecklistDraft] = useState("");
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistTitle, setEditingChecklistTitle] = useState("");
  // FR-016: after completing a task without a result, offer a one-line result
  // input on the card. Completion never waits for it.
  const [resultPrompt, setResultPrompt] = useState(false);
  const [resultDraft, setResultDraft] = useState("");
  const startOn = dateOnly(task.start_at);
  const dueOn = dateOnly(task.due_at);
  const project = data.workProjects.find((item) => item.id === task.project_id);
  const parentTask = data.tasks.find((item) => item.id === task.depends_on_task_id && !item.deleted_at);
  const due = dateOnly(task.due_at);
  const overdue = due !== null && due < today && task.status !== "done";
  const completedChecklistCount = checklistItems.filter((item) => item.completed_at).length;
  const stopCardAction = (event: { stopPropagation: () => void }) => event.stopPropagation();
  const addChecklistItem = () => {
    const title = checklistDraft.trim();
    if (!title) return;
    onChecklistAdd(task, title);
    setChecklistDraft("");
  };
  return (
    <article
      className={`task-row task-card${overdue ? " overdue" : ""}${task.status === "done" ? " done" : ""}${dragging ? " dragging" : ""}${dropPosition ? ` drop-${dropPosition}` : ""}`}
      style={{ marginLeft: `${Math.min(depth, 3) * 14}px` }}
      draggable={reorderable}
      role="button"
      tabIndex={0}
      onClick={() => onEdit(task)}
      onKeyDown={(event) => {
        // Keys typed into the card inputs (checklist, result) must not open the editor.
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit(task);
        }
      }}
      onDragStart={(event) => {
        if ((event.target as HTMLElement).closest("button, input, form")) {
          event.preventDefault();
          return;
        }
        onDragStart(event, task);
      }}
      onDragOver={(event) => onDragOver(event, task)}
      onDragLeave={onDragLeave}
      onDrop={(event) => onDrop(event, task)}
      onDragEnd={onDragEnd}
    >
      <span className="task-card-handle" aria-hidden="true">⠿</span>
      <input
        type="checkbox"
        checked={task.status === "done"}
        aria-label={`${task.title} 완료`}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          event.stopPropagation();
          const completing = task.status !== "done";
          onToggle(task);
          setResultPrompt(completing && !task.recurrence_template_id && !task.result);
        }}
      />
      <div className="task-row-main">
        <strong>{task.title}</strong>
        {task.source_type !== "self" && (
          <small>
            {sourceLabels[task.source_type]}
            {task.recurrence_frequency ? ` · ${recurrenceText(task)}` : ""}
            {task.requester_name ? ` · ${task.requester_name}` : ""}
          </small>
        )}
        {project && (
          <small className="task-project-label">
            프로젝트 · {project.name}{project.deleted_at ? " (휴지통)" : ""}
          </small>
        )}
        {(startOn || dueOn) && (
          <div className="task-row-dates">
            {startOn && dueOn && startOn !== dueOn ? (
              <>
                <span>실행 {compactDate(task.start_at)}</span>
                <span>마감 {compactDate(task.due_at)}</span>
              </>
            ) : (
              <span>{compactDate(task.due_at ?? task.start_at)}</span>
            )}
          </div>
        )}
        {task.result && <small className="task-result-label">결과 · {task.result}</small>}
        {parentTask && (
          <small className="task-dependency">
            상위 업무 · {parentTask.title}
          </small>
        )}
      </div>
      <button
        type="button"
        className="task-checklist-toggle"
        aria-label={`${task.title} 세부 체크 ${checklistOpen ? "접기" : "열기"}`}
        aria-expanded={checklistOpen}
        onClick={(event) => {
          stopCardAction(event);
          onChecklistOpen(task);
        }}
      >
        ＋
        {checklistItems.length > 0 && <small>{completedChecklistCount}/{checklistItems.length}</small>}
      </button>
      <span className="task-status">{statusLabels[task.status]}</span>
      <span className={`task-due${overdue ? " task-overdue" : ""}`}>
        {dateLabel(task.due_at ?? task.start_at, today)}
      </span>
      {resultPrompt && task.status === "done" && (
        <form
          className="task-result-prompt"
          onClick={stopCardAction}
          onSubmit={(event) => {
            event.preventDefault();
            const value = resultDraft.trim();
            if (value) onResult(task, value);
            setResultPrompt(false);
          }}
        >
          <input
            autoFocus
            value={resultDraft}
            aria-label={`${task.title} 처리 결과`}
            placeholder="처리 결과 남기기 (선택)"
            onChange={(event) => setResultDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setResultPrompt(false);
              }
            }}
          />
          <button type="submit" disabled={!resultDraft.trim()}>저장</button>
          <button type="button" onClick={() => setResultPrompt(false)}>건너뛰기</button>
        </form>
      )}
      {checklistOpen && (
        <div
          className="task-checklist"
          onClick={stopCardAction}
          onDragStart={(event) => event.preventDefault()}
        >
          {checklistItems.length > 0 && (
            <div className="task-checklist-items">
              {checklistItems.map((item) => {
                const editing = editingChecklistId === item.id;
                return (
                  <div className={`task-checklist-item${item.completed_at ? " done" : ""}`} key={item.id}>
                    <input
                      type="checkbox"
                      checked={!!item.completed_at}
                      aria-label={`${item.title} 완료`}
                      onChange={() => onChecklistUpdate(item, { completed_at: item.completed_at ? null : serverNow })}
                    />
                    {editing ? (
                      <form
                        className="task-checklist-edit"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const title = editingChecklistTitle.trim();
                          if (title) onChecklistUpdate(item, { title });
                          setEditingChecklistId(null);
                        }}
                      >
                        <input
                          autoFocus
                          value={editingChecklistTitle}
                          aria-label="세부 체크 항목 수정"
                          onChange={(event) => setEditingChecklistTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setEditingChecklistId(null);
                            }
                          }}
                        />
                      </form>
                    ) : <span>{item.title}</span>}
                    <button
                      type="button"
                      className="task-checklist-edit-button"
                      aria-label={`${item.title} 수정`}
                      onClick={() => {
                        setEditingChecklistId(item.id);
                        setEditingChecklistTitle(item.title);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="task-checklist-delete"
                      aria-label={`${item.title} 삭제`}
                      onClick={() => {
                        if (window.confirm(`“${item.title}” 체크 항목을 삭제할까요?`)) onChecklistDelete(item);
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <form
            className="task-checklist-create"
            onSubmit={(event) => {
              event.preventDefault();
              addChecklistItem();
            }}
          >
            <input
              value={checklistDraft}
              aria-label={`${task.title} 세부 체크 항목`}
              placeholder="세부 체크 항목 입력"
              onChange={(event) => setChecklistDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setChecklistDraft("");
                }
              }}
            />
            <button type="submit" disabled={!checklistDraft.trim()}>추가</button>
          </form>
        </div>
      )}
    </article>
  );
}
