"use client";

import { useEffect, useMemo, useState } from "react";
import { Data } from "@/lib/domain";
import {
  FlowDraft,
  FlowNode,
  addAfter,
  addBefore,
  addRoot,
  changedCount,
  draftFromTasks,
  flowRows,
  layoutFlow,
  removeNode,
  setParent,
  updateNode,
  wouldCycle,
} from "@/lib/task-flow";
import { ProjectForm } from "./task-form";
import { Save } from "./task-shared";

const NODE_W = 236;
const NODE_H = 104;
const GAP_X = 64;
const GAP_Y = 16;
const PAD = 24;
const UNASSIGNED = "";

const newId = () => crypto.randomUUID();

/**
 * 흐름: sketch a project's work as a branching flow (앞 일 → 뒤 일), then save
 * it into the task page in one step. Edits stay local until 저장.
 */
export function FlowWorkspace({
  data,
  today,
  serverNow,
  onSaveFlow,
  onSaveProject,
  onDirtyChange,
}: {
  data: Data;
  today: string;
  serverNow: string;
  onSaveFlow: (rows: Record<string, unknown>[]) => Promise<void>;
  onSaveProject: Save;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const projects = useMemo(
    () =>
      data.workProjects
        .filter((project) => !project.deleted_at)
        .sort(
          (a, b) =>
            Number(a.status !== "active") - Number(b.status !== "active") ||
            a.sort_order - b.sort_order ||
            a.name.localeCompare(b.name, "ko"),
        ),
    [data.workProjects],
  );
  // Open on the first active project that already has tasks.
  const [projectId, setProjectId] = useState<string>(() => {
    const active = projects.filter((project) => project.status === "active");
    const withTasks = active.find((project) =>
      data.tasks.some((task) => !task.deleted_at && task.project_id === project.id),
    );
    return (withTasks ?? active[0])?.id ?? UNASSIGNED;
  });
  const scopeId = projectId === UNASSIGNED ? null : projectId;
  const base = useMemo(() => draftFromTasks(data.tasks, scopeId), [data.tasks, scopeId]);
  const [state, setState] = useState<{ projectId: string; base: FlowDraft; draft: FlowDraft }>(
    () => ({ projectId, base, draft: base }),
  );
  // Reset the draft when the project changes, or when saved data arrives while
  // there are no local edits.
  if (state.projectId !== projectId || (state.base !== base && changedCount(state.base, state.draft) === 0)) {
    setState({ projectId, base, draft: base });
  }
  const draft = state.draft;
  const changes = changedCount(state.base, draft);
  const dirty = changes > 0;
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [projectEditorOpen, setProjectEditorOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!linkFrom) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLinkFrom(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [linkFrom]);

  const edit = (next: (current: FlowDraft) => FlowDraft) => {
    setError("");
    setState((current) => ({ ...current, draft: next(current.draft) }));
  };
  const addNode = (make: (current: FlowDraft, id: string) => FlowDraft) => {
    const id = newId();
    edit((current) => make(current, id));
    setFocusId(id);
  };
  const layout = layoutFlow(draft);
  const liveNodes = draft.filter((node) => !node.deleted);
  const byId = new Map(liveNodes.map((node) => [node.id, node]));
  const position = (id: string) => {
    const place = layout.positions.get(id)!;
    return { x: PAD + place.col * (NODE_W + GAP_X), y: PAD + place.row * (NODE_H + GAP_Y) };
  };
  const width = PAD * 2 + Math.max(1, layout.columns) * NODE_W + Math.max(0, layout.columns - 1) * GAP_X;
  const height = PAD * 2 + Math.max(1, layout.rows) * (NODE_H + GAP_Y);
  const linkSource = linkFrom ? byId.get(linkFrom) : undefined;
  const project = projects.find((item) => item.id === projectId);

  const switchProject = (id: string) => {
    if (id === projectId) return;
    if (dirty && !window.confirm("저장하지 않은 흐름 변경이 있습니다. 버리고 이동할까요?")) return;
    setLinkFrom(null);
    setError("");
    setProjectId(id);
  };
  const pickParent = (target: FlowNode) => {
    if (!linkSource) return;
    if (target.id === linkSource.id || wouldCycle(draft, linkSource.id, target.id)) {
      setError(`‘${target.title || "새 업무"}’은(는) ‘${linkSource.title || "새 업무"}’ 뒤에 이어진 업무라 앞 일로 둘 수 없습니다.`);
      return;
    }
    edit((current) => setParent(current, linkSource.id, target.id));
    setLinkFrom(null);
  };
  const remove = (node: FlowNode) => {
    if (!node.isNew && !window.confirm(`‘${node.title}’을(를) 흐름에서 빼고 저장 시 휴지통으로 옮길까요? 뒤 일은 앞 일에 다시 이어집니다.`)) return;
    edit((current) => removeNode(current, node.id));
  };
  async function save() {
    const untitled = liveNodes.find((node) => !node.title.trim());
    if (untitled) {
      setError("제목이 비어 있는 업무가 있습니다. 할 일을 입력하거나 빼 주세요.");
      setFocusId(untitled.id);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSaveFlow(
        flowRows(state.base, draft, {
          projectId: scopeId,
          areaId: project?.area_id ?? data.workAreas.find((area) => !area.deleted_at)?.id ?? null,
          now: serverNow,
        }),
      );
      // Treat the draft as saved; the refreshed data then replaces it.
      setState((current) => ({ ...current, base: current.draft }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "흐름을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flow-page">
      <div className="flow-head">
        <div className="page-title-text">
          <h1>흐름</h1>
          <p>앞 일과 뒤 일을 이어 일의 흐름을 정리하고, 저장하면 업무 페이지에 반영됩니다.</p>
        </div>
        <div className="flow-head-tools">
          {dirty && <span className="flow-dirty">저장하지 않은 변경 {changes}건</span>}
          <button disabled={!dirty || saving} onClick={() => { setLinkFrom(null); setState((current) => ({ ...current, draft: current.base })); }}>
            변경 취소
          </button>
          <button className="primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
      <div className="flow-layout">
        <aside className="flow-projects panel" aria-label="프로젝트">
          <div className="flow-projects-head">
            <strong>프로젝트</strong>
            <button onClick={() => setProjectEditorOpen(true)}>＋ 프로젝트</button>
          </div>
          {projects.map((item) => (
            <button
              key={item.id}
              className={`flow-project${item.id === projectId ? " selected" : ""}${item.status !== "active" ? " inactive" : ""}`}
              onClick={() => switchProject(item.id)}
            >
              <i style={{ background: item.color ?? "#4e986e" }} />
              <span>{item.name}</span>
              <small>{data.tasks.filter((task) => !task.deleted_at && task.project_id === item.id).length}</small>
            </button>
          ))}
          <button
            className={`flow-project${projectId === UNASSIGNED ? " selected" : ""}`}
            onClick={() => switchProject(UNASSIGNED)}
          >
            <i style={{ background: "#b8c4bb" }} />
            <span>미분류 업무</span>
            <small>{data.tasks.filter((task) => !task.deleted_at && !task.project_id).length}</small>
          </button>
        </aside>
        <section className="flow-board panel">
          <div className="flow-board-head">
            <strong>{project?.name ?? "미분류 업무"}</strong>
            <small>업무 {liveNodes.length}개</small>
            <button onClick={() => addNode((current, id) => addRoot(current, id, today))}>＋ 시작 업무</button>
          </div>
          {linkSource && (
            <div className="flow-link-banner" role="status">
              ‘{linkSource.title || "새 업무"}’의 앞 일로 둘 업무를 누르세요.
              <button onClick={() => { edit((current) => setParent(current, linkSource.id, null)); setLinkFrom(null); }}>앞 일 없음</button>
              <button onClick={() => setLinkFrom(null)}>취소 (Esc)</button>
            </div>
          )}
          {error && <p className="flow-error" role="alert">{error}</p>}
          {liveNodes.length === 0 ? (
            <div className="flow-empty">
              <p>이 프로젝트에 정리된 업무가 없습니다.</p>
              <button className="primary" onClick={() => addNode((current, id) => addRoot(current, id, today))}>＋ 첫 업무 기록</button>
            </div>
          ) : (
            <div className="flow-canvas-scroll">
              <div className="flow-canvas" style={{ width, height }}>
                <svg className="flow-edges" width={width} height={height} aria-hidden="true">
                  <defs>
                    <marker id="flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
                      <path d="M0,0 L8,4 L0,8 z" />
                    </marker>
                  </defs>
                  {layout.edges.map(({ from, to }) => {
                    const a = position(from);
                    const b = position(to);
                    const x1 = a.x + NODE_W;
                    const y1 = a.y + NODE_H / 2;
                    const x2 = b.x - 2;
                    const y2 = b.y + NODE_H / 2;
                    const mid = (x1 + x2) / 2;
                    return <path key={`${from}-${to}`} d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`} markerEnd="url(#flow-arrow)" />;
                  })}
                </svg>
                {liveNodes.map((node) => {
                  const { x, y } = position(node.id);
                  const invalidTarget = !!linkSource && (node.id === linkSource.id || wouldCycle(draft, linkSource.id, node.id));
                  return (
                    <div
                      key={node.id}
                      className={`flow-node${node.status === "done" ? " done" : ""}${node.isNew ? " new" : ""}${linkSource ? invalidTarget ? " link-invalid" : " link-target" : ""}`}
                      style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
                      onClick={() => linkSource && !invalidTarget && pickParent(node)}
                    >
                      <div className="flow-node-head">
                        <input
                          type="checkbox"
                          checked={node.status === "done"}
                          aria-label={`${node.title || "새 업무"} 완료`}
                          disabled={!!linkSource}
                          onChange={() => edit((current) => updateNode(current, node.id, { status: node.status === "done" ? "planned" : "done" }))}
                        />
                        <input
                          className="flow-title"
                          value={node.title}
                          placeholder="할 일 입력"
                          aria-label="할 일"
                          autoFocus={focusId === node.id}
                          readOnly={!!linkSource}
                          onChange={(event) => edit((current) => updateNode(current, node.id, { title: event.target.value }))}
                        />
                        <button className="flow-remove" aria-label={`${node.title || "새 업무"} 빼기`} disabled={!!linkSource} onClick={() => remove(node)}>✕</button>
                      </div>
                      <div className="flow-node-dates">
                        <input
                          type="date"
                          aria-label="실행일"
                          value={node.startOn ?? ""}
                          disabled={!!linkSource}
                          onChange={(event) => edit((current) => updateNode(current, node.id, { startOn: event.target.value || null }))}
                        />
                        <span>→</span>
                        <input
                          type="date"
                          aria-label="마감일"
                          value={node.dueOn ?? ""}
                          disabled={!!linkSource}
                          onChange={(event) => edit((current) => updateNode(current, node.id, { dueOn: event.target.value || null }))}
                        />
                      </div>
                      <div className="flow-node-actions">
                        <button disabled={!!linkSource} onClick={() => addNode((current, id) => addBefore(current, node.id, id, today))}>＋ 앞 일</button>
                        <button disabled={!!linkSource} onClick={() => { setError(""); setLinkFrom(node.id); }}>앞 일 연결</button>
                        <button className="flow-add-after" disabled={!!linkSource} onClick={() => addNode((current, id) => addAfter(current, node.id, id, today))}>＋ 뒤 일</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
      {projectEditorOpen && (
        <ProjectForm
          data={data}
          project={null}
          onSave={onSaveProject}
          onArchive={() => {}}
          onClose={() => setProjectEditorOpen(false)}
        />
      )}
    </div>
  );
}
