"use client";
import { rankText } from "@/lib/keyword-ranks";

import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  CellChange,
  Data,
  Report,
  Promotion,
  Source,
  Task,
  categories,
  datePart,
  emptyData,
  inPeriod,
  localDate,
  modeLabels,
  money,
  monthPeriod,
  number,
  percent,
  scopeLabels,
  timestamp,
  isBusinessProfile,
  compareContentCreated,
} from "@/lib/domain";
import { report, sourceName } from "@/lib/analytics";
import {
  Collection,
  saveChannel,
  saveEvent,
  saveAdContent,
  downloadJSON,
  exportBackup,
  loadData,
  saveCells,
  saveMetricOrder,
  saveChannelOrder,
  saveRecord,
  updateRecord,
} from "@/lib/repository";
import { downloadExcelReport, openPrintableReport } from "@/lib/report-export";
import { Editor, EditorState } from "@/components/editor";
import { OperatingSheet } from "@/components/operating-sheet";
import { useServerDate } from "@/components/use-server-date";
import { resolveSheetCells } from "@/lib/sheet-ad";
import { moveMetric } from "@/lib/metric-order";
import { moveChannel } from "@/lib/channel-order";
import { eventCost, unitCost, usedQuantity } from "@/lib/purchases";
import { UpdateLog } from "@/components/update-log";
import { useNavigation } from "@/components/use-navigation";
import {
  TaskWorkspace,
} from "@/components/task-workspace";
import { nextTaskOccurrence } from "@/lib/task-recurrence";

const tabs = ["대시보드", "업무", "콘텐츠", "이벤트", "구매", "분석", "리포트", "로그"];
const objectRecord = (value: unknown) => value as Record<string, unknown>;
const koreanClock = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
export default function Home() {
  const [workspace, setWorkspace] = useState<string | null>(null);
  const { today, now: serverNow, synced: clockSynced } = useServerDate(!!workspace);
  const clockInitialized = useRef(false);
  const [initializing, setInitializing] = useState(true);
  const [data, setData] = useState<Data>(emptyData);
  const [nav, setNav] = useNavigation();
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [day, setDay] = useState(localDate);
  const [range, setRange] = useState("month");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(0);
  const [ready, setReady] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [analysisTab, setAnalysisTab] = useState("성과");
  const [lifecycle, setLifecycle] = useState("active");
  const [search, setSearch] = useState("");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [undo, setUndo] = useState<CellChange[] | null>(null);
  const queue = useRef(Promise.resolve());
  const generation = useRef(0);
  const stateRef = useRef(data);
  const backupInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const closeOverlays = () => {
      setEditor(null);
      setDetail(null);
      setEventDate(null);
      setSelectedReport(null);
    };
    window.addEventListener("popstate", closeOverlays);
    return () => window.removeEventListener("popstate", closeOverlays);
  }, []);
  useEffect(() => {
    if (!editor && !detail && !eventDate && !selectedReport) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setEditor(null);
      setDetail(null);
      setEventDate(null);
      setSelectedReport(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, detail, eventDate, selectedReport]);
  useEffect(() => {
    if (clockSynced && !clockInitialized.current) {
      clockInitialized.current = true;
      setMonth(today.slice(0, 7));
      setDay(today);
    }
  }, [today, clockSynced]);
  const period = useMemo(
    () =>
      nav === "대시보드" || range === "month"
        ? monthPeriod(month)
        : range === "year"
          ? {
              start: `${month.slice(0, 4)}-01-01`,
              end: `${month.slice(0, 4)}-12-31`,
            }
          : { start: day, end: day },
    [nav, range, month, day],
  );
  const currentReport = useMemo(
    () => report(data, period, range === "year" && nav !== "대시보드"),
    [data, period, range, nav],
  );
  const refresh = useCallback(async (ws: string) => {
    const token = ++generation.current;
    const loaded = await loadData(ws);
    if (token === generation.current) {
      stateRef.current = loaded;
      setData(loaded);
      setReady(true);
    }
  }, []);
  useEffect(() => {
    let alive = true;
    let loading = false;
    async function sessionChanged() {
      if (loading) return;
      loading = true;
      try {
        const { data: session, error: sessionError } =
          await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!alive) return;
        if (!session.session) {
          generation.current++;
          setWorkspace(null);
          setData(emptyData);
          stateRef.current = emptyData;
          setReady(false);
          return;
        }
        const { data: member, error: memberError } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", session.session.user.id)
          .limit(1)
          .single();
        if (memberError) throw memberError;
        if (alive) {
          setWorkspace(member.workspace_id);
          await refresh(member.workspace_id);
        }
      } catch (e) {
        if (alive)
          setError(
            e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.",
          );
      } finally {
        loading = false;
        if (alive) setInitializing(false);
      }
    }
    void sessionChanged();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        if (alive) void sessionChanged();
      }, 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [refresh]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [busy]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  async function run(action: () => Promise<void>) {
    setBusy((b) => b + 1);
    setError("");
    try {
      await action();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "요청을 완료하지 못했습니다.";
      setError(message);
      throw e;
    } finally {
      setBusy((b) => b - 1);
    }
  }
  function fire(action: () => Promise<void>) {
    void run(action).catch(() => {});
  }
  async function mutate(
    collection: Collection,
    record: Record<string, unknown>,
  ) {
    if (!workspace) return;
    await run(async () => {
      if (collection === "values") {
        await saveCells(workspace, [
          {
            kind: "metric",
            metric_id: String(record.metric_id),
            content_id: record.content_id as string | null,
            promotion_id: record.promotion_id as string | null,
            date: String(record.metric_date),
            value: record.value as number | null,
          },
        ]);
      } else if (
        collection === "costs" &&
        record.promotion_id &&
        record.category === "media"
      ) {
        const prior = stateRef.current.costs.find(
          (c) =>
            c.promotion_id === record.promotion_id &&
            c.expense_date === record.expense_date &&
            c.grid_entry,
        );
        if (record.id && prior && prior.id !== record.id)
          throw new Error(
            "이 날짜의 광고비가 이미 있습니다. 기존 광고비를 수정하세요.",
          );
        await saveRecord(workspace, collection, {
          ...record,
          ...(record.id || prior ? { id: record.id ?? prior?.id } : {}),
          grid_entry: true,
          deleted_at: null,
        });
      } else if (collection === "channels")
        await saveChannel(workspace, record);
      else if (collection === "contents" && record.initial_promotion)
        await saveAdContent(workspace, record);
      else if (collection === "events") await saveEvent(workspace, record);
      else await saveRecord(workspace, collection, record);
      await refresh(workspace);
      setLastSavedAt(serverNow);
      setNotice("저장했습니다.");
    });
  }
  function saveGrid(changes: CellChange[]): Promise<void> {
    if (!workspace) return Promise.reject(new Error("로그인이 필요합니다."));
    setBusy((b) => b + 1);
    setError("");
    const job = queue.current
      .catch(() => {})
      .then(async () => {
        changes = await resolveSheetCells(
          { ...stateRef.current, promotions: [...stateRef.current.promotions] },
          changes,
          async (record) => {
            const promotion = (await saveRecord(
              workspace,
              "promotions",
              record,
            )) as Promotion;
            stateRef.current = {
              ...stateRef.current,
              promotions: [...stateRef.current.promotions, promotion],
            };
            return promotion;
          },
        );
        const before = changes.map((c) => {
          if (c.kind === "cost") {
            const old = stateRef.current.costs.find(
              (x) =>
                x.grid_entry &&
                x.promotion_id === c.promotion_id &&
                x.expense_date === c.date &&
                !x.deleted_at,
            );
            return { ...c, value: old?.amount ?? null };
          }
          const old = stateRef.current.values.find(
            (x) =>
              x.metric_id === c.metric_id &&
              x.content_id === c.content_id &&
              x.promotion_id === c.promotion_id &&
              x.metric_date === c.date &&
              !x.deleted_at,
          );
          return { ...c, value: old?.value ?? null };
        });
        await saveCells(workspace, changes);
        await refresh(workspace);
        setLastSavedAt(serverNow);
        setUndo(before);
        setNotice(`${changes.length}개 셀 저장됨`);
      });
    queue.current = job;
    return job
      .catch((e) => {
        setError(
          `입력을 보존하지 못했습니다: ${e.message}. 셀 값을 확인하고 다시 저장하세요.`,
        );
        throw e;
      })
      .finally(() => setBusy((b) => b - 1));
  }
  const edit = (state: EditorState) => setEditor(state);
  async function completeRecurringTask(task: Task, completed: boolean) {
    const templateId = task.recurrence_template_id ?? task.id;
    const occurrenceOn = task.occurrence_on;
    if (!workspace || !occurrenceOn) return;
    await run(async () => {
      const { error: occurrenceError } = await supabase
        .from("mkt_task_occurrences")
        .upsert(
          {
            workspace_id: workspace,
            task_id: templateId,
            occurrence_on: occurrenceOn,
            status: completed ? "done" : "planned",
            completed_at: completed ? serverNow : null,
          },
          { onConflict: "workspace_id,task_id,occurrence_on" },
        );
      if (occurrenceError) throw occurrenceError;
      const base = stateRef.current.tasks.find((item) => item.id === templateId);
      if (!base) throw new Error("반복 업무 원본을 찾지 못했습니다.");
      const next = completed ? nextTaskOccurrence(base, occurrenceOn) : occurrenceOn;
      await updateRecord(workspace, "tasks", templateId, {
        recurrence_next_on: next,
        recurrence_active: next !== null,
        status: next === null ? "done" : "planned",
        completed_at: next === null ? serverNow : null,
      });
      await refresh(workspace);
      setLastSavedAt(serverNow);
      setNotice(completed ? "반복 업무를 완료하고 다음 일정을 만들었습니다." : "반복 업무를 되돌렸습니다.");
    });
  }
  const changeState = (
    collection: Collection,
    id: string,
    patch: Record<string, unknown>,
  ) =>
    fire(async () => {
      await updateRecord(workspace!, collection, id, patch);
      await refresh(workspace!);
      setLastSavedAt(serverNow);
      setNotice(
        patch.deleted_at ? "휴지통으로 이동했습니다." : "변경했습니다.",
      );
    });
  const lifecycleActions = (
    collection: Collection,
    r: { id: string; deleted_at: string | null; status?: string },
  ) => (
    <div className="actions">
      {r.deleted_at ? (
        <button
          onClick={() =>
            changeState(collection, r.id, {
              deleted_at: null,
              ...(collection === "channels" ? { is_active: true } : {}),
            })
          }
        >
          복원
        </button>
      ) : (
        <>
          <button onClick={() => edit({ collection, record: objectRecord(r) })}>
            수정
          </button>
          {collection === "contents" && (
            <button
              onClick={() =>
                changeState(collection, r.id, {
                  status: r.status === "archived" ? "published" : "archived",
                  archived_at:
                    r.status === "archived" ? null : new Date().toISOString(),
                })
              }
            >
              {r.status === "archived" ? "운영 복원" : "아카이브"}
            </button>
          )}
          <button
            className="danger-text"
            onClick={() => {
              if (
                window.confirm(
                  "휴지통으로 이동할까요? 기록은 보존되며 복원할 수 있습니다.",
                )
              )
                changeState(collection, r.id, {
                  deleted_at: new Date().toISOString(),
                });
            }}
          >
            휴지통
          </button>
        </>
      )}
    </div>
  );
  const source = (s: Source) => sourceName(data, s);
  const show = (r: { deleted_at: string | null; status?: string }) =>
    lifecycle === "trash"
      ? !!r.deleted_at
      : lifecycle === "archive"
        ? !r.deleted_at && r.status === "archived"
        : !r.deleted_at && r.status !== "archived";
  const moveMonth = (offset: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + offset, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fire(async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(fd.get("email")),
        password: String(fd.get("password")),
      });
      if (error) throw error;
    });
  }
  if (initializing)
    return (
      <main className="loading-screen">
        <BrandMark />
        <p>운영 기록을 불러오는 중입니다…</p>
      </main>
    );
  if (!workspace)
    return (
      <main className="login-screen">
        <section>
          <BrandMark />
          <small>ROHAN MARKETING</small>
          <h1>
            매일의 기록이
            <br />
            다음 성장을 만듭니다.
          </h1>
          <p>채움영어학원 · 마케팅 운영과 성과</p>
          <form onSubmit={login}>
            <label>
              이메일
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
              />
            </label>
            <label>
              비밀번호
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={!!busy}>
              로그인
            </button>
          </form>
        </section>
      </main>
    );
  return (
    <main className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setNav("대시보드")}>
          <BrandMark />
          <span>
            로한 <b>마케팅</b>
          </span>
        </button>
        <nav aria-label="주 메뉴">
          {tabs.map((t) => (
            <button
              key={t}
              className={nav === t ? "active" : ""}
              onClick={() => {
                setNav(t);
                setSelectedReport(null);
                setLifecycle("active");
              }}
            >
              {t}
            </button>
          ))}
        </nav>
        <button
          className="logout"
          disabled={!!busy}
          onClick={() =>
            fire(async () => {
              await queue.current.catch(() => {});
              const { error } = await supabase.auth.signOut();
              if (error) throw error;
            })
          }
        >
          로그아웃 ↗
        </button>
      </header>
      <div className="workspace">
        <div className="toolbar">
          {nav !== "업무" && <div className="status" role="status">
              <i className={error ? "error" : busy ? "pending" : ""} />
              {busy
                ? "저장·조회 중…"
                : error
                  ? "확인 필요"
                  : ready
                    ? "저장된 기록과 동기화됨"
                    : "데이터 확인 필요"}
            </div>}
          {nav !== "로그" && nav !== "업무" && (
            <div className="toolbar-controls">
              {nav !== "대시보드" && nav !== "업무" && (
                <div className="segmented">
                  {[
                    ["day", "일"],
                    ["month", "월"],
                    ["year", "연"],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      className={range === v ? "selected" : ""}
                      onClick={() => setRange(v)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
              {nav === "대시보드" || range === "month" ? (
                <>
                  <button aria-label="이전 달" onClick={() => moveMonth(-1)}>
                    ‹
                  </button>
                  <input
                    aria-label="조회 월"
                    type="month"
                    value={month}
                    onChange={(e) => {
                      if (e.target.value) setMonth(e.target.value);
                    }}
                  />
                  <button aria-label="다음 달" onClick={() => moveMonth(1)}>
                    ›
                  </button>
                </>
              ) : range === "year" ? (
                <input
                  aria-label="조회 연도"
                  type="number"
                  min="2000"
                  max="2200"
                  value={month.slice(0, 4)}
                  onChange={(e) => {
                    if (e.target.value.length === 4)
                      setMonth(`${e.target.value}-01`);
                  }}
                />
              ) : (
                <input
                  aria-label="조회 날짜"
                  type="date"
                  value={day}
                  onChange={(e) => {
                    if (e.target.value) setDay(e.target.value);
                  }}
                />
              )}
              <button
                onClick={() => {
                  setMonth(today.slice(0, 7));
                  setDay(today);
                }}
              >
                오늘 {today.slice(5).replace("-", "/")}
              </button>
              {nav === "대시보드" && (
                <details className="quick-menu">
                  <summary className="primary">＋ 빠른 입력</summary>
                  <div>
                    {[
                      ["contents", "소재 추가"],
                      ["costs", "비용 기록"],
                      ["customers", "고객·전환 기록"],
                      ["payments", "결제·환불 기록"],
                      ["events", "이벤트 기록"],
                      ["channels", "채널 추가"],
                    ].map(([c, l]) => (
                      <button
                        key={c}
                        onClick={(e) => {
                          e.currentTarget.closest("details")!.open = false;
                          edit({ collection: c as Collection });
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
        {error && (
          <div className="error-box" role="alert">
            <strong>작업을 확인해 주세요.</strong> {error}{" "}
            <button onClick={() => fire(() => refresh(workspace))}>
              다시 불러오기
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button aria-label="알림 닫기" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        {!ready ? (
          <Empty
            title="데이터를 불러오지 못했습니다."
            detail="빈 데이터로 처리하지 않았습니다. 위 오류를 확인하고 다시 불러오세요."
          />
        ) : (
          <>
            {nav === "대시보드" && (
              <>
                <Kpis report={currentReport} compact />
                <OperatingSheet
                  data={data}
                  period={period}
                  today={today}
                  clockSynced={clockSynced}
                  onEdit={edit}
                  onSave={saveGrid}
                  onChannelMove={(id, target, position) =>
                    run(async () => {
                      await saveChannelOrder(
                        workspace,
                        moveChannel(
                          stateRef.current.channels,
                          id,
                          target,
                          position,
                        ),
                      );
                      await refresh(workspace);
                    })
                  }
                  onMetricMove={(id, direction) =>
                    run(async () => {
                      await saveMetricOrder(
                        workspace,
                        moveMetric(stateRef.current.metrics, id, direction),
                      );
                      await refresh(workspace);
                    })
                  }
                  onMetricDelete={(id, deleted) =>
                    run(async () => {
                      await updateRecord(workspace, "metrics", id, {
                        deleted_at: deleted ? new Date().toISOString() : null,
                      });
                      await refresh(workspace);
                    })
                  }
                  onDate={(date) => setEventDate(date)}
                  onDetail={setDetail}
                  actions={
                    <div className="inline-tools">
                      {undo && (
                        <button
                          disabled={!!busy}
                          onClick={() => {
                            const prev = undo;
                            void saveGrid(prev)
                              .then(() => setUndo(null))
                              .catch(() => {});
                          }}
                        >
                          ↶ 마지막 입력 되돌리기
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setNav("분석");
                          setAnalysisTab("비용");
                        }}
                      >
                        비용 원장
                      </button>
                      <button
                        onClick={() => {
                          setNav("분석");
                          setAnalysisTab("결제");
                        }}
                      >
                        매출 기록
                      </button>
                    </div>
                  }
                />
              </>
            )}
            {nav === "업무" && (
              <TaskWorkspace
                data={data}
                today={today}
                serverNow={serverNow}
                syncLabel={busy ? "저장·조회 중…" : error ? "확인 필요" : ready ? `저장된 기록과 동기화됨 · ${koreanClock(lastSavedAt ?? serverNow)}` : "데이터 확인 필요"}
                month={month}
                onMonthChange={setMonth}
                onSave={(collection, record) => mutate(collection, record)}
                onUpdate={(collection, id, patch) => changeState(collection, id, patch)}
                onCompleteRecurring={completeRecurringTask}
              />
            )}
            {nav === "콘텐츠" && (
              <>
                <PageTitle
                  eyebrow="CONTENT LIBRARY"
                  title="활동이 쌓이는 콘텐츠 라이브러리"
                  detail="소재를 관리하고, 같은 소재에 여러 광고 집행을 연결하세요."
                  action={
                    <button
                      className="primary"
                      onClick={() => edit({ collection: "contents" })}
                    >
                      ＋ 소재 추가
                    </button>
                  }
                />
                <div className="section-toolbar">
                  <div className="segmented">
                    {[
                      ["active", "운영 중"],
                      ["archive", "아카이브"],
                      ["trash", "휴지통"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        className={lifecycle === key ? "selected" : ""}
                        onClick={() => setLifecycle(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    placeholder="소재 제목 검색"
                    aria-label="소재 검색"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="content-grid">
                  {data.contents
                    .filter((c) => show(c) && c.title.includes(search))
                    .sort(compareContentCreated)
                    .map((c) => (
                      <article className="content-card" key={c.id}>
                        <div className="eyebrow">
                          {data.channels.find((ch) => ch.id === c.channel_id)
                            ?.name ?? "이전 연결 채널"}{" "}
                          · {datePart(c.published_at) || "발행일 없음"}
                        </div>
                        <button
                          className="content-title"
                          onClick={() => setDetail(c.id)}
                        >
                          {c.title}
                        </button>
                        <p>
                          {c.notes ||
                            "소재 상세에서 원본 링크와 집행 이력을 관리하세요."}
                        </p>
                        <div className="card-stat">
                          <span>광고 집행</span>
                          <strong>
                            {
                              data.promotions.filter(
                                (p) => p.content_id === c.id && !p.deleted_at,
                              ).length
                            }
                            회
                          </strong>
                        </div>
                        {lifecycleActions("contents", c)}
                      </article>
                    ))}
                </div>
                {!data.contents.some(show) && (
                  <Empty
                    title="표시할 소재가 없습니다."
                    detail="소재를 추가하면 채널 템플릿에 맞는 지표 행이 준비됩니다."
                  />
                )}
                <section className="panel">
                  <div className="section-toolbar">
                    <h2>채널과 지표 설정</h2>
                    <button onClick={() => edit({ collection: "channels" })}>
                      ＋ 채널 추가
                    </button>
                  </div>
                  {data.channels
                    .filter((c) =>
                      lifecycle === "trash" ? !!c.deleted_at : !c.deleted_at,
                    )
                    .map((ch) => (
                      <details className="channel-settings" key={ch.id}>
                        <summary>
                          <span
                            className="channel-dot"
                            style={{ background: ch.color ?? "#287a56" }}
                          />
                          {ch.name}
                          <small>
                            {
                              data.metrics.filter(
                                (m) => m.channel_id === ch.id && !m.deleted_at,
                              ).length
                            }
                            개 지표
                          </small>
                        </summary>
                        <div className="section-toolbar">
                          {lifecycleActions("channels", ch)}
                          <button
                            onClick={() =>
                              edit({
                                collection: "metrics",
                                record: { channel_id: ch.id, scope: "total" },
                              })
                            }
                          >
                            ＋ 지표 추가
                          </button>
                        </div>
                        <div className="metric-list">
                          {data.metrics
                            .filter((m) => m.channel_id === ch.id)
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((m) => (
                              <div key={m.id}>
                                <span>
                                  <b>{m.name}</b>
                                  <small>
                                    {scopeLabels[m.scope]} ·{" "}
                                    {modeLabels[m.mode]}
                                    {m.deleted_at ? " · 휴지통" : ""}
                                  </small>
                                </span>
                                {lifecycleActions("metrics", m)}
                              </div>
                            ))}
                        </div>
                      </details>
                    ))}
                  <details className="channel-settings">
                    <summary>학원 전체 퍼널 지표</summary>
                    <button
                      onClick={() =>
                        edit({
                          collection: "metrics",
                          record: { scope: "funnel" },
                        })
                      }
                    >
                      ＋ 지표 추가
                    </button>
                    <div className="metric-list">
                      {data.metrics
                        .filter((m) => m.scope === "funnel")
                        .map((m) => (
                          <div key={m.id}>
                            <span>
                              {m.name}
                              {m.deleted_at ? " · 휴지통" : ""}
                            </span>
                            {lifecycleActions("metrics", m)}
                          </div>
                        ))}
                    </div>
                  </details>
                </section>
              </>
            )}
            {nav === "구매" && (
              <>
                <PageTitle
                  eyebrow="PURCHASES"
                  title="구매 목록"
                  detail="전체 구매 건 · 결제액은 구매일의 마케팅 비용에 반영됩니다."
                  action={
                    <button
                      className="primary"
                      onClick={() => edit({ collection: "purchases" })}
                    >
                      ＋ 구매
                    </button>
                  }
                />
                <label className="check">
                  <input
                    type="checkbox"
                    checked={lifecycle === "trash"}
                    onChange={(e) =>
                      setLifecycle(e.target.checked ? "trash" : "active")
                    }
                  />
                  휴지통 보기
                </label>
                <DataTable
                  headers={[
                    "구매일",
                    "물품",
                    "수량",
                    "총 결제액",
                    "개당 원가",
                    "사용",
                    "잔량",
                    "사용 이벤트",
                    "메모",
                    "관리",
                  ]}
                  rows={data.purchases
                    .filter(show)
                    .sort((a, b) =>
                      b.purchased_on.localeCompare(a.purchased_on),
                    )
                    .map((p) => [
                      p.purchased_on,
                      p.title,
                      number(p.quantity),
                      money(p.total_amount),
                      money(unitCost(p)),
                      number(usedQuantity(data, p.id)),
                      number(p.quantity - usedQuantity(data, p.id)),
                      <span key="usage">
                        {data.eventItems
                          .filter(
                            (i) => !i.deleted_at && i.purchase_id === p.id,
                          )
                          .map((i) => {
                            const e = data.events.find(
                              (e) => e.id === i.event_id,
                            );
                            return (
                              <button
                                key={i.id}
                                onClick={() =>
                                  e &&
                                  edit({
                                    collection: "events",
                                    record: objectRecord(e),
                                  })
                                }
                              >
                                {e?.title ?? "이벤트"}
                                {e?.deleted_at ? " (휴지통)" : ""} ·{" "}
                                {number(i.quantity)}개
                              </button>
                            );
                          })}
                      </span>,
                      p.notes || "—",
                      lifecycleActions("purchases", p),
                    ])}
                />
                <p className="form-note">
                  이벤트에서 구매 건과 사용 수량을 연결하면 물품 원가가
                  계산됩니다. 사용 원가는 마케팅 지출에 중복 합산하지 않습니다.
                </p>
              </>
            )}
            {nav === "이벤트" && (
              <>
                <PageTitle
                  eyebrow="MARKETING EVENTS"
                  title="변화를 만든 날의 기록"
                  detail={`${period.start} ~ ${period.end} · 설명회, 협업, 방송과 오프라인 활동`}
                  action={
                    <button
                      className="primary"
                      onClick={() => edit({ collection: "events" })}
                    >
                      ＋ 이벤트 기록
                    </button>
                  }
                />
                <label className="check">
                  <input
                    type="checkbox"
                    checked={lifecycle === "trash"}
                    onChange={(e) =>
                      setLifecycle(e.target.checked ? "trash" : "active")
                    }
                  />
                  휴지통 보기
                </label>
                <div className="event-list">
                  {data.events
                    .filter(
                      (e) =>
                        show(e) &&
                        datePart(e.starts_at) <= period.end &&
                        (datePart(e.ends_at) || datePart(e.starts_at)) >=
                          period.start,
                    )
                    .map((e) => (
                      <article className="event-card" key={e.id}>
                        <div className="event-date">
                          <b>{datePart(e.starts_at).slice(-2)}</b>
                          <small>{datePart(e.starts_at).slice(0, 7)}</small>
                        </div>
                        <div>
                          <h2>{e.title}</h2>
                          <p>
                            {e.location || "장소 미입력"} · {e.status}
                          </p>
                          <p>{e.notes || "결과 메모를 남겨보세요."}</p>
                          <small>
                            이벤트 원가 {money(eventCost(data, e.id).total)} ·
                            물품 {money(eventCost(data, e.id).goods)} + 직접
                            지급 {money(eventCost(data, e.id).direct)}
                          </small>
                        </div>
                        <div>
                          {lifecycleActions("events", e)}
                          <button
                            onClick={() =>
                              edit({
                                collection: "costs",
                                record: { event_id: e.id, category: "event" },
                              })
                            }
                          >
                            비용 기록
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              </>
            )}
            {nav === "분석" && (
              <>
                <PageTitle
                  eyebrow="MARKETING INTELLIGENCE"
                  title="기록에서 다음 결정을 찾습니다"
                  detail={`${period.start} ~ ${period.end} · 실제 지급·수납 기준`}
                />
                <div className="section-toolbar">
                  <div className="segmented">
                    {["성과", "비용", "고객", "결제"].map((t) => (
                      <button
                        key={t}
                        className={analysisTab === t ? "selected" : ""}
                        onClick={() => {
                          setAnalysisTab(t);
                          setLifecycle("active");
                        }}
                      >
                        {t === "고객"
                          ? "고객·전환"
                          : t === "결제"
                            ? "결제·환불"
                            : t === "비용"
                              ? "비용 원장"
                              : t}
                      </button>
                    ))}
                  </div>
                  {analysisTab !== "성과" && (
                    <div className="actions">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={lifecycle === "trash"}
                          onChange={(e) =>
                            setLifecycle(e.target.checked ? "trash" : "active")
                          }
                        />
                        휴지통
                      </label>
                      <button
                        className="primary"
                        onClick={() =>
                          edit({
                            collection:
                              analysisTab === "비용"
                                ? "costs"
                                : analysisTab === "고객"
                                  ? "customers"
                                  : "payments",
                          })
                        }
                      >
                        ＋ 기록 추가
                      </button>
                    </div>
                  )}
                </div>
                {analysisTab === "성과" ? (
                  <Analysis report={currentReport} />
                ) : analysisTab === "비용" ? (
                  <DataTable
                    headers={[
                      "지급일",
                      "비용 / 대상",
                      "항목",
                      "상태",
                      "금액",
                      "관리",
                    ]}
                    rows={data.costs
                      .filter(
                        (c) => show(c) && inPeriod(c.expense_date, period),
                      )
                      .map((c) => [
                        c.expense_date,
                        <span key="title">
                          <b>{c.title}</b>
                          <small>{source(c)}</small>
                        </span>,
                        categories[c.category],
                        c.payment_status === "paid"
                          ? "지급 완료"
                          : c.payment_status === "pending"
                            ? "미지급"
                            : c.payment_status === "planned"
                              ? "계획"
                              : "취소",
                        money(c.amount),
                        c.purchase_id ? (
                          <button
                            key="purchase"
                            onClick={() => {
                              const p = data.purchases.find(
                                (p) => p.id === c.purchase_id,
                              );
                              if (p)
                                edit({
                                  collection: "purchases",
                                  record: objectRecord(p),
                                });
                            }}
                          >
                            구매 수정
                          </button>
                        ) : c.metric_value_id ? (
                          <button
                            key="edit"
                            onClick={() => {
                              const v = data.values.find(
                                (v) => v.id === c.metric_value_id,
                              );
                              if (v)
                                edit({
                                  collection: "values",
                                  record: { ...v, title: c.title },
                                });
                            }}
                          >
                            금액 수정
                          </button>
                        ) : (
                          lifecycleActions("costs", c)
                        ),
                      ])}
                  />
                ) : analysisTab === "고객" ? (
                  <>
                    <p className="form-note">
                      최초 상담일 또는 등록일이 기간에 포함된 고객입니다. 전체
                      일일 집계와 별도로 관리합니다.
                    </p>
                    <DataTable
                      headers={[
                        "참조번호",
                        "최초 상담",
                        "신규 등록",
                        "주 출처",
                        "확인 근거",
                        "관리",
                      ]}
                      rows={data.customers
                        .filter(
                          (c) =>
                            show(c) &&
                            (inPeriod(c.consulted_on, period) ||
                              inPeriod(c.enrolled_on, period)),
                        )
                        .map((c) => [
                          c.reference_code,
                          c.consulted_on,
                          c.enrolled_on ?? "—",
                          source(c),
                          {
                            reported: "고객 답변",
                            direct: "직접 확인",
                            inferred: "추정",
                            unknown: "미확인",
                          }[c.confidence],
                          <div key="actions">
                            {lifecycleActions("customers", c)}
                            <button
                              onClick={() =>
                                edit({
                                  collection: "payments",
                                  record: { customer_id: c.id },
                                })
                              }
                            >
                              결제 추가
                            </button>
                          </div>,
                        ])}
                    />
                  </>
                ) : (
                  <>
                    <p className="form-note">
                      매출은 입력한 등록 관련 실제 수납액입니다. 환불은 음수
                      거래로 남기고, 원가가 미확인이면 빈칸으로 두세요.
                    </p>
                    <DataTable
                      headers={[
                        "결제일",
                        "고객",
                        "수납 / 환불",
                        "서비스 원가",
                        "메모",
                        "관리",
                      ]}
                      rows={data.payments
                        .filter((p) => show(p) && inPeriod(p.paid_on, period))
                        .map((p) => [
                          p.paid_on,
                          data.customers.find((c) => c.id === p.customer_id)
                            ?.reference_code ?? "이전 고객",
                          money(p.amount),
                          money(p.service_cost),
                          p.notes ?? "—",
                          <div key="actions">
                            {lifecycleActions("payments", p)}
                            {p.amount > 0 && !p.deleted_at && (
                              <button
                                onClick={() =>
                                  edit({
                                    collection: "payments",
                                    record: {
                                      customer_id: p.customer_id,
                                      adjusts_id: p.id,
                                      amount: -p.amount,
                                    },
                                  })
                                }
                              >
                                환불 기록
                              </button>
                            )}
                          </div>,
                        ])}
                    />
                  </>
                )}
              </>
            )}
            {nav === "로그" && <UpdateLog />}
            {nav === "리포트" && (
              <>
                <PageTitle
                  eyebrow="REPORTS & RECORDS"
                  title="같은 숫자, 설명 가능한 보고"
                  detail="분석 화면과 같은 계산 기준을 사용합니다. 보고 시점을 저장하면 이후 수정과 구분해 보관합니다."
                />
                <div className="section-toolbar">
                  <div className="actions">
                    <button
                      className="primary"
                      onClick={() =>
                        downloadExcelReport(selectedReport ?? currentReport)
                      }
                    >
                      Excel 다운로드
                    </button>
                    <button
                      onClick={() => {
                        try {
                          openPrintableReport(selectedReport ?? currentReport);
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      PDF / 인쇄
                    </button>
                    <button
                      disabled={!!busy}
                      onClick={() =>
                        fire(async () => {
                          await saveRecord(workspace, "snapshots", {
                            title: `${period.start} ~ ${period.end} 마케팅 보고`,
                            period_start: period.start,
                            period_end: period.end,
                            snapshot: currentReport,
                          });
                          await refresh(workspace);
                          setNotice("보고 시점을 저장했습니다.");
                        })
                      }
                    >
                      보고 시점 저장
                    </button>
                  </div>
                  <select
                    aria-label="저장 보고서 선택"
                    value={selectedReport?.generatedAt ?? ""}
                    onChange={(e) =>
                      setSelectedReport(
                        data.snapshots.find(
                          (s) => s.snapshot.generatedAt === e.target.value,
                        )?.snapshot ?? null,
                      )
                    }
                  >
                    <option value="">현재 데이터</option>
                    {data.snapshots.map((s) => (
                      <option key={s.id} value={s.snapshot.generatedAt}>
                        {s.title} ·{" "}
                        {new Date(s.created_at).toLocaleString("ko-KR")}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedReport && (
                  <p className="form-note">
                    저장 보고서: {selectedReport.period.start} ~{" "}
                    {selectedReport.period.end}. 현재 기간 선택과 별개의 보존된
                    수치입니다.
                  </p>
                )}
                <Analysis report={selectedReport ?? currentReport} />
                <section className="panel">
                  <h2>전체 기록 보관</h2>
                  <p>
                    채널, 지표, 일별 값, 집행, 비용, 고객, 결제, 보고서와 감사
                    이력을 JSON으로 내려받습니다. 복원은 같은 작업공간에서 기존
                    ID를 기준으로 적용합니다.
                  </p>
                  <div className="actions">
                    <button
                      disabled={!!busy}
                      onClick={() =>
                        fire(async () =>
                          downloadJSON(
                            await exportBackup(workspace),
                            `로한마케팅_전체백업_${localDate()}.json`,
                          ),
                        )
                      }
                    >
                      전체 백업 다운로드
                    </button>
                    <button
                      disabled={!!busy}
                      onClick={() => backupInput.current?.click()}
                    >
                      백업 복원
                    </button>
                    <input
                      ref={backupInput}
                      type="file"
                      accept=".json,application/json"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        fire(async () => {
                          const backup = JSON.parse(await file.text());
                          if (
                            backup.version !== 3 ||
                            backup.workspace_id !== workspace ||
                            !backup.tables
                          )
                            throw new Error(
                              "이 작업공간의 v3 백업 파일이 아닙니다.",
                            );
                          if (
                            !window.confirm(
                              "백업에 포함된 동일 ID 기록을 백업 시점 값으로 복원합니다. 계속할까요?",
                            )
                          )
                            return;
                          downloadJSON(
                            await exportBackup(workspace),
                            `로한마케팅_복원직전_${Date.now()}.json`,
                          );
                          if (Array.isArray(backup.tables.contents)) {
                            backup.tables.contents = backup.tables.contents.map(
                              (c: Record<string, unknown>) => ({
                                keyword_metric_ids:
                                  stateRef.current.contents.find(
                                    (current) => current.id === c.id,
                                  )?.keyword_metric_ids ?? null,
                                ...c,
                              }),
                            );
                          }
                          if (Array.isArray(backup.tables.channels)) {
                            backup.tables.channels = backup.tables.channels.map(
                              (ch: Record<string, unknown>) => ({
                                sort_order:
                                  stateRef.current.channels.find(
                                    (c) => c.id === ch.id,
                                  )?.sort_order ?? 2147483647,
                                ...ch,
                              }),
                            );
                          }
                          if (Array.isArray(backup.tables.mkt_metrics)) {
                            backup.tables.mkt_metrics =
                              backup.tables.mkt_metrics.map(
                                (m: Record<string, unknown>) => {
                                  const current = stateRef.current.metrics.find(
                                    (x) => x.id === m.id,
                                  );
                                  return {
                                    include_in_marketing:
                                      current?.include_in_marketing ?? false,
                                    funnel_role:
                                      current?.funnel_role ??
                                      (m.scope === "funnel"
                                        ? ["kakao", "phone", "visit"].includes(
                                            String(m.key),
                                          )
                                          ? "consultations"
                                          : ["inflows", "enrollments"].includes(
                                                String(m.key),
                                              )
                                            ? m.key
                                            : null
                                        : null),
                                    ...m,
                                  };
                                },
                              );
                          }
                          const { error } = await supabase.rpc(
                            "mkt_restore_backup",
                            { p_workspace: workspace, p_backup: backup.tables },
                          );
                          if (error) throw error;
                          for (const table of [
                            "mkt_work_areas",
                            "mkt_work_projects",
                            "mkt_tasks",
                            "mkt_work_links",
                            "mkt_task_occurrences",
                          ] as const) {
                            const rows = backup.tables[table];
                            if (!Array.isArray(rows) || rows.length === 0) continue;
                            if (
                              rows.some(
                                (row: Record<string, unknown>) =>
                                  row.workspace_id !== workspace,
                              )
                            )
                              throw new Error(
                                "업무 백업에 다른 작업공간 기록이 포함되어 있습니다.",
                              );
                            const { error: workError } = await supabase
                              .from(table)
                              .upsert(rows);
                            if (workError) throw workError;
                          }
                          await refresh(workspace);
                          setNotice("백업 복원을 완료했습니다.");
                        });
                      }}
                    />
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </div>
      {eventDate && (
        <div className="modal-backdrop">
          <section
            className="panel event-day"
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-day-title"
          >
            <header className="panel-heading">
              <h2 id="event-day-title">{eventDate} 활동</h2>
              <button
                aria-label="이벤트 닫기"
                onClick={() => setEventDate(null)}
              >
                ✕
              </button>
            </header>
            <section className="day-activity-block">
              <div className="section-toolbar">
                <h3>이벤트</h3>
                <button
                  className="primary"
                  onClick={() => {
                    setEventDate(null);
                    edit({
                      collection: "events",
                      record: { starts_at: timestamp(eventDate) },
                    });
                  }}
                >
                  ＋ 이벤트
                </button>
              </div>
              {data.events
                .filter(
                  (e) => !e.deleted_at && datePart(e.starts_at) === eventDate,
                )
                .map((e) => (
                  <div key={e.id} className="event-day-item">
                    <span>
                      {e.title}
                      {e.location ? ` · ${e.location}` : ""} · 원가{" "}
                      {money(eventCost(data, e.id).total)}
                    </span>
                    {lifecycleActions("events", e)}
                  </div>
                ))}
              {!data.events.some(
                (e) => !e.deleted_at && datePart(e.starts_at) === eventDate,
              ) && <p className="day-activity-empty">기록된 이벤트가 없습니다.</p>}
            </section>
          </section>
        </div>
      )}
      {detail &&
        (() => {
          const c = data.contents.find((c) => c.id === detail);
          if (!c) return null;
          return (
            <div className="modal-backdrop">
              <section
                className="detail-panel"
                role="dialog"
                aria-modal="true"
                aria-label="소재 상세"
              >
                <header>
                  <div>
                    <small>소재 상세</small>
                    <h2>{c.title}</h2>
                  </div>
                  <button
                    aria-label="상세 닫기"
                    onClick={() => setDetail(null)}
                  >
                    ✕
                  </button>
                </header>
                <p>
                  {data.channels.find((ch) => ch.id === c.channel_id)?.name} ·{" "}
                  {datePart(c.published_at)}
                </p>
                {c.url && /^https?:\/\//i.test(c.url) && (
                  <a href={c.url} target="_blank" rel="noreferrer">
                    원본 콘텐츠 열기 ↗
                  </a>
                )}
                <p>{c.notes}</p>
                {lifecycleActions("contents", c)}
                {!isBusinessProfile(c) && (
                  <div className="section-toolbar">
                    <h3>광고 집행 이력</h3>
                    <button
                      onClick={() =>
                        edit({
                          collection: "promotions",
                          record: { content_id: c.id },
                        })
                      }
                    >
                      ＋ 집행 추가
                    </button>
                  </div>
                )}
                {data.promotions
                  .filter((p) => p.content_id === c.id)
                  .map((p) => (
                    <div className="promotion-card" key={p.id}>
                      <b>
                        {p.title}
                        {p.deleted_at ? " · 휴지통" : ""}
                      </b>
                      <p>
                        {p.start_date} ~ {p.end_date}
                      </p>
                      {lifecycleActions("promotions", p)}
                    </div>
                  ))}
                <h3>
                  {period.start} ~ {period.end} 성과
                </h3>
                <DataTable
                  headers={["범위 / 지표", "집계", "값"]}
                  rows={currentReport.metrics
                    .filter(
                      (m) =>
                        m.content === c.title &&
                        m.channel ===
                          data.channels.find((ch) => ch.id === c.channel_id)
                            ?.name,
                    )
                    .map((m) => [
                      `${m.promotion || m.scope} · ${m.metric}`,
                      m.aggregation,
                      m.unit === "rank" ? rankText(m.value) : number(m.value),
                    ])}
                />
                <button
                  onClick={() => {
                    setDetail(null);
                    setNav("대시보드");
                  }}
                >
                  운영 시트에서 입력
                </button>
              </section>
            </div>
          );
        })()}
      {editor && (
        <Editor
          key={`${editor.collection}:${editor.record?.id ?? JSON.stringify(editor.record)}`}
          state={editor}
          data={data}
          busy={!!busy}
          today={today}
          onSave={mutate}
          onClose={() => setEditor(null)}
        />
      )}
    </main>
  );
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 64 64">
        <path
          d="M15 46V19l17 18 17-18v27"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty">
      <span>＋</span>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <small>{eyebrow}</small>
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
      {action}
    </div>
  );
}
function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length}>
                <div className="empty-small">
                  이 기간에 표시할 기록이 없습니다.
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function Kpis({
  report: r,
  compact = false,
}: {
  report: Report;
  compact?: boolean;
}) {
  const s = r.summary;
  const cards = compact
    ? [
        ["학원 유입", number(s.inflows), "전체 일일 집계"],
        ["상담 건수", number(s.consultations), "상담으로 분류한 학원 지표"],
        ["신규 등록", number(s.enrollments), "학원 전체"],
        ["마케팅 비용", money(s.spend), "지급 완료 기준"],
        ["순수납 매출", money(s.revenue), "등록 관련 결제 − 환불"],
      ]
    : [
        ["마케팅 비용", money(s.spend), `광고비 ${money(s.adSpend)}`],
        ["순수납 매출", money(s.revenue), `결제 고객 ${number(s.payers)}명`],
        ["객단가", money(s.aov), "순수납 / 결제 고객"],
        [
          "기간 마케팅 ROI",
          percent(s.roi),
          s.costMissing
            ? `서비스 원가 미입력 ${s.costMissing}건`
            : "원가·마케팅 비용 차감",
        ],
        [
          "전체 등록당 비용",
          money(s.cac),
          `전체 신규 등록 ${number(s.enrollments)}명`,
        ],
      ];
  return (
    <div className={`kpi-grid${compact ? " kpi-compact" : ""}`}>
      {cards.map(([label, value, hint], i) => (
        <article key={label} className={`kpi ${i === 3 ? "accent" : ""}`}>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{hint}</small>
        </article>
      ))}
    </div>
  );
}
function Analysis({ report: r }: { report: Report }) {
  const s = r.summary;
  const [level, setLevel] = useState("채널");
  const max = Math.max(...r.trend.flatMap((t) => [t.spend, t.revenue ?? 0]), 1);
  const min = Math.min(0, ...r.trend.map((t) => t.revenue ?? 0));
  const y = (value: number) => 175 - (155 * (value - min)) / (max - min);
  const points = (key: "spend" | "revenue") =>
    r.trend
      .map(
        (t, i) =>
          `${20 + (i * 960) / Math.max(r.trend.length - 1, 1)},${y(t[key] ?? 0)}`,
      )
      .join(" ");
  return (
    <>
      <Kpis report={r} />
      <div className="analysis-grid">
        <section className="panel chart-panel">
          <div className="section-toolbar">
            <h2>지출과 매출의 흐름</h2>
            <span className="chart-legend">
              <i />
              매출 <i />
              비용
            </span>
          </div>
          <p>동일 기간의 추이 · 활동의 인과적 기여를 뜻하지 않습니다.</p>
          <svg
            viewBox="0 0 1000 205"
            role="img"
            aria-label="기간별 마케팅 비용과 순수납 매출 추이"
          >
            <line x1="20" y1={y(0)} x2="980" y2={y(0)} stroke="#dce5df" />
            <text x="20" y={y(0) - 5} fontSize="12" fill="#7b8d83">
              0원
            </text>
            <line x1="20" y1="95" x2="980" y2="95" stroke="#edf1ed" />
            {r.trend.some((t) => t.revenue !== null) && (
              <polyline
                fill="none"
                stroke="#287a56"
                strokeWidth="3"
                points={points("revenue")}
              />
            )}
            <polyline
              fill="none"
              stroke="#be884d"
              strokeWidth="3"
              points={points("spend")}
            />
            {r.trend
              .filter(
                (_, i) => i % Math.max(1, Math.floor(r.trend.length / 6)) === 0,
              )
              .map((t) => (
                <text
                  key={t.date}
                  x={
                    20 +
                    (r.trend.indexOf(t) * 960) / Math.max(r.trend.length - 1, 1)
                  }
                  y="200"
                  fontSize="13"
                  textAnchor="middle"
                  fill="#7b8d83"
                >
                  {t.date.slice(5)}
                </text>
              ))}
          </svg>
          <details>
            <summary>일별 / 월별 수치 보기</summary>
            <DataTable
              headers={["기간", "지급 비용", "순수납", "등록"]}
              rows={r.trend.map((t) => [
                t.date,
                money(t.spend),
                money(t.revenue),
                number(t.enrollments),
              ])}
            />
          </details>
        </section>
        <section className="panel funnel-panel">
          <small className="eyebrow">학원 전체 결과</small>
          <h2>유입부터 등록까지</h2>
          {[
            ["유입", s.inflows],
            ["상담 건수", s.consultations],
            ["신규 등록", s.enrollments],
          ].map(([label, value]) => (
            <div className="funnel-step" key={String(label)}>
              <span>{label}</span>
              <strong>{number(value as number | null)}</strong>
            </div>
          ))}
          <p>상담 건수에는 같은 사람의 여러 경로 상담이 포함될 수 있습니다.</p>
          <div className="funnel-foot">
            <span>확인 고객 상담→등록</span>
            <b>{percent(s.conversion)}</b>
            <small>
              기간 내 최초 상담 {s.cohort}명 중 종료일까지 등록{" "}
              {s.cohortEnrolled}명
            </small>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="section-toolbar">
          <div>
            <h2>활동별 비용과 확인 성과</h2>
            <p>고객 답변·직접 확인한 주 출처 기준. 미확인은 별도로 남깁니다.</p>
          </div>
          <select
            aria-label="분석 대상"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            {["채널", "소재", "집행", "이벤트", "기타"].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>
        <div className="coverage">
          <span>
            전체 신규 등록 <b>{number(s.enrollments)}명</b>
          </span>
          <span>
            출처 확인 <b>{s.confirmedEnrollments}명</b>
          </span>
          <span>
            확인률 <b>{percent(s.coverage)}</b>
          </span>
          {s.coverage !== null && s.coverage > 1 && (
            <strong>전체 등록 집계와 고객 기록을 대조하세요.</strong>
          )}
        </div>
        <DataTable
          headers={[
            "활동",
            "지급 비용",
            "확인 상담",
            "확인 등록",
            "확인 매출",
            "객단가",
            "확인 등록당 비용",
            ...(level === "집행" ? ["광고 ROAS"] : []),
          ]}
          rows={r.activities
            .filter((a) => a.kind === level)
            .map((a) => [
              a.name,
              money(a.spend),
              number(a.consultations),
              number(a.enrollments),
              money(a.revenue),
              money(a.aov),
              money(a.costPerEnrollment),
              ...(level === "집행" ? [number(a.roas, "배")] : []),
            ])}
        />
      </section>
      <details className="panel calculation-notes">
        <summary>계산 기준과 데이터 범위</summary>
        {r.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
      </details>
    </>
  );
}
