"use client";
import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import {
  CellChange,
  Data,
  Metric,
  MetricRow,
  Period,
  datePart,
  dates,
  modeLabels,
  number,
  scopeLabels,
  isBusinessProfile,
  metricsForContent,
} from "@/lib/domain";
import { metricValue } from "@/lib/analytics";
import { RollupTarget, rollupOptions, rollupValue } from "@/lib/sheet-rollup";
import { isEventChannel, sheetPromotions } from "@/lib/sheet-ad";
import { EditorState } from "./editor";
import { compareMetrics, metricGroup } from "@/lib/metric-order";
type DisplayRow = {
  id: string;
  label: string;
  depth: number;
  detail?: string;
  metricRow?: MetricRow;
  edit?: EditorState;
  add?: EditorState;
  parentIds: string[];
  rollup?: RollupTarget;
  fixedRollup?: string;
  finance?: boolean;
  fixedUnit?: string;
};
export function cellNumber(raw: string, metric: Metric | null): number | null {
  const clean = raw.replaceAll(",", "").trim();
  if (clean === "" || clean === "—") return null;
  const v = Number(clean);
  if (!Number.isFinite(v) || v < 0)
    throw new Error("0 이상의 숫자만 입력하세요.");
  if (metric?.unit === "count" && !Number.isInteger(v))
    throw new Error("건수는 정수로 입력하세요.");
  return v;
}
function EditableCell({
  value,
  label,
  cellId,
  onSave,
  onMove,
  onPaste,
}: {
  value: number | null;
  label: string;
  cellId: string;
  onSave: (raw: string) => Promise<void>;
  onMove: (key: string, shift: boolean) => void;
  onPaste: (raw: string) => Promise<void>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const committed = useRef(value === null ? "" : String(value));
  const dirty = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const raw = value === null ? "" : String(value);
    if (
      ref.current &&
      document.activeElement !== ref.current &&
      !dirty.current
    ) {
      ref.current.value = raw;
      committed.current = raw;
    }
  }, [value]);
  async function commit() {
    const raw = ref.current?.value ?? "";
    if (raw === committed.current) return;
    committed.current = raw;
    dirty.current = true;
    setError("");
    try {
      await onSave(raw);
      dirty.current = false;
    } catch (e) {
      committed.current = value === null ? "" : String(value);
      setError(e instanceof Error ? e.message : "저장 실패");
    }
  }
  return (
    <input
      ref={ref}
      defaultValue={value ?? ""}
      data-cell={cellId}
      inputMode="decimal"
      aria-label={label}
      aria-invalid={!!error}
      title={error || label}
      className={error ? "cell-error" : ""}
      placeholder="—"
      onFocus={(e) => e.currentTarget.select()}
      onChange={() => {
        dirty.current = true;
      }}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.currentTarget.value = value === null ? "" : String(value);
          committed.current = e.currentTarget.value;
          dirty.current = false;
          setError("");
          e.currentTarget.blur();
        } else if (["Enter", "Tab", "ArrowUp", "ArrowDown"].includes(e.key)) {
          e.preventDefault();
          void commit();
          onMove(e.key, e.shiftKey);
        }
      }}
      onPaste={(e) => {
        const raw = e.clipboardData.getData("text");
        if (raw.includes("\t") || raw.includes("\n")) {
          e.preventDefault();
          void onPaste(raw)
            .then(() => {
              const first = raw
                .split(/[\t\r\n]/)[0]
                .replaceAll(",", "")
                .trim();
              if (ref.current) ref.current.value = first;
              committed.current = first;
              dirty.current = false;
              setError("");
            })
            .catch((e) =>
              setError(e instanceof Error ? e.message : "붙여넣기 실패"),
            );
        }
      }}
    />
  );
}
export function OperatingSheet({
  data,
  period,
  onEdit,
  onSave,
  onMetricMove,
  onMetricDelete,
  onDate,
  onDetail,
  today,
  clockSynced,
  actions,
}: {
  data: Data;
  period: Period;
  onEdit: (state: EditorState) => void;
  onSave: (cells: CellChange[]) => Promise<void>;
  onMetricMove: (id: string, direction: -1 | 1) => Promise<void>;
  onMetricDelete: (id: string, deleted: boolean) => Promise<void>;
  onDate: (date: string) => void;
  onDetail: (id: string) => void;
  today: string;
  clockSynced: boolean;
  actions?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [metricBusy, setMetricBusy] = useState(false);
  const widthKey = "marketing-sheet-widths";
  type Column = "label" | "summary";
  const clampWidth = (col: Column, width: number) =>
    Math.max(
      col === "label" ? 180 : 100,
      Math.min(col === "label" ? 720 : 480, width),
    );
  const [widths, setWidths] = useState<Partial<Record<Column, number>>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(widthKey) || "{}");
      return Object.fromEntries(
        (["label", "summary"] as const)
          .filter((k) => Number.isFinite(saved?.[k]))
          .map((k) => [k, clampWidth(k, saved[k])]),
      );
    } catch {
      return {};
    }
  });
  const drag = useRef<{
    column: Column;
    x: number;
    width: number;
    current: number;
  } | null>(null);
  const storeWidth = (column: Column, width: number) => {
    const next = { ...widths, [column]: clampWidth(column, width) };
    setWidths(next);
    try {
      localStorage.setItem(widthKey, JSON.stringify(next));
    } catch {}
  };
  const resizeHandle = (column: Column) => (
    <span
      className="column-resize"
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      aria-label={`${column === "label" ? "운영 대상" : "월간 요약"} 열 너비 조절`}
      title="좌우로 드래그해 열 너비 조절"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const width = e.currentTarget.parentElement!.offsetWidth;
        drag.current = { column, x: e.clientX, width, current: width };
      }}
      onPointerMove={(e) => {
        if (!drag.current || drag.current.column !== column) return;
        drag.current.current = clampWidth(
          column,
          drag.current.width + e.clientX - drag.current.x,
        );
        table.current
          ?.closest<HTMLElement>(".sheet-card")
          ?.style.setProperty(`--${column}-width`, `${drag.current.current}px`);
      }}
      onPointerUp={(e) => {
        if (drag.current) storeWidth(column, drag.current.current);
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        if (drag.current) storeWidth(column, drag.current.current);
        drag.current = null;
      }}
      onKeyDown={(e) => {
        if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
          e.preventDefault();
          storeWidth(
            column,
            e.currentTarget.parentElement!.offsetWidth +
              (e.key === "ArrowRight" ? 10 : -10),
          );
        }
      }}
    />
  );
  const selectionKey = `sheet-rollups:${data.channels[0]?.workspace_id ?? ""}`;
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(selectionKey) || "{}");
      return saved && typeof saved === "object" && !Array.isArray(saved)
        ? saved
        : {};
    } catch {
      return {};
    }
  });
  const isCollapsed = (id: string) =>
    collapsed[id] ??
    data.contents.some((c) => c.id === id && !isBusinessProfile(c));
  const [includeArchive, setIncludeArchive] = useState(false);
  const [error, setError] = useState("");
  const table = useRef<HTMLDivElement>(null);
  const ds = dates(period);
  useEffect(() => {
    const scroll = table.current;
    const current = scroll?.querySelector<HTMLElement>("thead [data-today]");
    if (!scroll) return;
    const fixed =
      (scroll.querySelector<HTMLElement>(".label-col")?.offsetWidth ?? 0) +
      (scroll.querySelector<HTMLElement>(".summary-col")?.offsetWidth ?? 0);
    scroll.scrollLeft = current
      ? Math.max(0, current.offsetLeft - fixed - 70)
      : 0;
  }, [period.start, today]);
  const rows: DisplayRow[] = [];
  const metricRows = (
    metrics: Metric[],
    content: string | null,
    promotion: string | null,
    depth: number,
    parents: string[],
    start?: string,
    end?: string,
  ) =>
    metrics.sort(compareMetrics).forEach((m) =>
      rows.push({
        id: `${m.id}:${content}:${promotion && parents.includes(promotion) ? promotion : "direct"}`,
        label: m.name,
        depth,
        parentIds: parents,
        detail: `${scopeLabels[m.scope]} · ${modeLabels[m.mode]}`,
        edit: { collection: "metrics", record: m },
        metricRow: {
          id: m.id,
          label: m.name,
          kind: "metric",
          metric: m,
          content_id: content,
          promotion_id: promotion,
          start,
          end,
        },
      }),
    );
  rows.push({
    id: "funnel",
    label: "학원 전체 퍼널",
    depth: 0,
    parentIds: [],
    detail: "채널 실적과 분리된 일일 전체 집계",
    add: { collection: "metrics", record: { scope: "funnel" } },
  });
  metricRows(
    data.metrics.filter((m) => m.scope === "funnel" && !m.deleted_at),
    null,
    null,
    1,
    ["funnel"],
  );
  data.channels
    .filter((ch) => !ch.deleted_at && !isEventChannel(ch))
    .forEach((ch) => {
      rows.push({
        id: ch.id,
        label: ch.name,
        depth: 0,
        parentIds: [],
        detail: "채널",
        rollup: { channelId: ch.id },
        edit: { collection: "channels", record: ch },
        add: { collection: "contents", record: { channel_id: ch.id } },
      });
      const contents = data.contents
        .filter(
          (c) =>
            c.channel_id === ch.id &&
            !c.deleted_at &&
            (includeArchive || c.status !== "archived"),
        )
        .sort(
          (a, b) => Number(isBusinessProfile(b)) - Number(isBusinessProfile(a)),
        );
      contents.forEach((c) => {
        rows.push({
          id: c.id,
          label: c.title,
          depth: 1,
          parentIds: [ch.id],
          rollup: { contentId: c.id },
          finance: !isBusinessProfile(c),
          detail: `${c.status === "archived" ? "아카이브 · " : ""}${datePart(c.published_at) || "발행일 미입력"}`,
          edit: { collection: "contents", record: c },
          add: isBusinessProfile(c)
            ? undefined
            : { collection: "promotions", record: { content_id: c.id } },
        });
        const ms = metricsForContent(data.metrics, c);
        metricRows(
          ms.filter((m) => m.scope !== "paid"),
          c.id,
          null,
          2,
          [ch.id, c.id],
        );
        if (isBusinessProfile(c)) return;
        const directAd = ["paid_ad", "social_content", "search_ad"].includes(
          ch.measurement_template,
        );
        const promotions = directAd
          ? sheetPromotions(data, c.id, period)
          : data.promotions.filter(
              (p) =>
                p.content_id === c.id &&
                !p.deleted_at &&
                p.start_date <= period.end &&
                p.end_date >= period.start,
            );
        if (ms.some((m) => m.scope === "paid") && promotions.length === 0) {
          const hasPrevious = data.promotions.some(
            (p) => p.content_id === c.id && !p.deleted_at,
          );
          rows.push({
            id: `setup:${c.id}`,
            label: hasPrevious
              ? "이 달 광고 없음 · 집행 추가"
              : "광고 지표 입력 · 기간 설정",
            depth: 2,
            parentIds: [ch.id, c.id],
            detail: "노출 · 클릭 · 반응 · 지출 / 클릭률 자동 계산",
            edit: {
              collection: "promotions",
              record: { content_id: c.id, start_date: today, end_date: today },
            },
          });
        }
        promotions.forEach((p) => {
          if (!directAd || promotions.length > 1)
            rows.push({
              id: p.id,
              label: p.title,
              depth: 2,
              parentIds: [ch.id, c.id],
              detail: `광고 · ${p.start_date} ~ ${p.end_date}`,
              edit: p.id.startsWith("sheet:")
                ? undefined
                : { collection: "promotions", record: p },
            });
          metricRows(
            ms.filter((m) => m.scope === "paid"),
            c.id,
            p.id,
            directAd && promotions.length === 1 ? 2 : 3,
            directAd && promotions.length === 1
              ? [ch.id, c.id]
              : [ch.id, c.id, p.id],
            p.start_date,
            p.end_date,
          );
          rows.push({
            id: `cost:${directAd && promotions.length === 1 ? c.id : p.id}`,
            label: ch.measurement_template === "paid_ad" ? "지출" : "광고비",
            depth: directAd && promotions.length === 1 ? 2 : 3,
            parentIds:
              directAd && promotions.length === 1
                ? [ch.id, c.id]
                : [ch.id, c.id, p.id],
            detail: "비용 원장 · 지급액",
            metricRow: {
              id: p.id,
              label: ch.measurement_template === "paid_ad" ? "지출" : "광고비",
              kind: "cost",
              metric: null,
              content_id: c.id,
              promotion_id: p.id,
              start: p.start_date,
              end: p.end_date,
            },
          });
        });
      });
    });
  const academyRows: DisplayRow[] = [
    { id: "academy", label: "학원 전체 마케팅 성과", depth: 0, parentIds: [] },
  ];
  for (const [key, label, unit] of [
    ["spend", "총 마케팅 비용", "원"],
    ["consultations", "전체 상담", "건"],
    ["enrollments", "전체 등록", "건"],
    ["consultCost", "상담당 비용", "원"],
    ["enrollCost", "등록당 비용", "원"],
  ]) {
    academyRows.push({
      id: `academy:${key}`,
      label,
      depth: 1,
      parentIds: ["academy"],
      rollup: { academy: true },
      fixedRollup: `academy:${key}`,
      fixedUnit: unit,
    });
  }
  const instagram = data.channels.find(
    (ch) => ch.measurement_template === "social_content" && !ch.deleted_at,
  );
  const lastInstagram = instagram
    ? rows.findLastIndex(
        (r) => r.id === instagram.id || r.parentIds.includes(instagram.id),
      )
    : -1;
  rows.splice(
    lastInstagram < 0 ? rows.length : lastInstagram + 1,
    0,
    ...academyRows,
  );
  const visible = rows.filter((r) => !r.parentIds.some(isCollapsed));
  const editable = visible.filter(
    (r) => r.metricRow && r.metricRow.metric?.mode !== "ratio",
  );
  const allowed = (row: MetricRow, date: string) =>
    !row.start || (date >= row.start && date <= row.end!);
  const change = (row: MetricRow, date: string, raw: string): CellChange => ({
    kind: row.kind,
    metric_id: row.metric?.id,
    content_id: row.content_id,
    promotion_id: row.promotion_id,
    date,
    value: cellNumber(raw, row.metric),
  });
  const paste = async (rowIndex: number, dayIndex: number, text: string) => {
    setError("");
    try {
      const matrix = text
        .replace(/\r/g, "")
        .replace(/\n$/, "")
        .split("\n")
        .map((line) => line.split("\t"));
      const changes: CellChange[] = [];
      matrix.forEach((line, i) =>
        line.forEach((raw, j) => {
          const row = editable[rowIndex + i]?.metricRow,
            date = ds[dayIndex + j];
          if (!row || !date || !allowed(row, date))
            throw new Error(
              "붙여넣기 범위가 표 또는 광고 집행 기간을 벗어났습니다.",
            );
          changes.push(change(row, date, raw));
        }),
      );
      await onSave(changes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "붙여넣지 못했습니다.");
      throw e;
    }
  };
  const move = (row: number, col: number, key: string, shift: boolean) => {
    let r = row,
      c = col;
    const step = shift ? -1 : 1;
    if (key === "Tab") {
      c += step;
      if (c >= ds.length) {
        c = 0;
        r++;
      }
      if (c < 0) {
        c = ds.length - 1;
        r--;
      }
    } else r += key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : step;
    const target = table.current?.querySelector<HTMLInputElement>(
      `[data-cell="${r}:${c}"]`,
    );
    target?.focus();
  };
  return (
    <section
      className="sheet-card"
      style={
        {
          "--label-width": widths.label ? `${widths.label}px` : undefined,
          "--summary-width": widths.summary ? `${widths.summary}px` : undefined,
        } as CSSProperties
      }
    >
      <div className="sheet-tools">
        <span>
          운영 시트{" "}
          <small
            className="today-status"
            title={
              clockSynced
                ? "서버 시간 · Asia/Seoul"
                : "서버 확인 전 기기 시간 · Asia/Seoul"
            }
          >
            오늘 {today} · {clockSynced ? "한국 시간" : "시간 확인 중"}
          </small>
        </span>
        <div>
          {actions}
          <label className="check">
            <input
              type="checkbox"
              checked={includeArchive}
              onChange={(e) => setIncludeArchive(e.target.checked)}
            />
            아카이브 포함
          </label>
          <button onClick={() => onEdit({ collection: "channels" })}>
            ＋ 채널
          </button>
          <details className="quick-menu">
            <summary>삭제한 지표</summary>
            <div>
              {data.metrics
                .filter((m) => m.deleted_at)
                .map((m) => (
                  <button
                    key={m.id}
                    disabled={metricBusy}
                    onClick={() => {
                      setMetricBusy(true);
                      void onMetricDelete(m.id, false)
                        .catch(() => {})
                        .finally(() => setMetricBusy(false));
                    }}
                  >
                    {data.channels.find((c) => c.id === m.channel_id)?.name ??
                      "학원 전체"}{" "}
                    · {m.name} 복원
                  </button>
                ))}
              {!data.metrics.some((m) => m.deleted_at) && (
                <span>삭제한 지표가 없습니다.</span>
              )}
            </div>
          </details>
        </div>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div ref={table} className="sheet-scroll">
        <table className="operating-sheet">
          <thead>
            <tr>
              <th className="label-col">
                운영 대상 / 지표{resizeHandle("label")}
              </th>
              <th className="summary-col">
                월간 요약{resizeHandle("summary")}
              </th>
              {ds.map((date) => (
                <th
                  key={date}
                  aria-current={date === today ? "date" : undefined}
                  data-today={date === today ? "true" : undefined}
                  className={
                    (date === today ? "today-col " : "") +
                    (new Date(`${date}T12:00:00Z`).getUTCDay() === 0
                      ? "sunday"
                      : "")
                  }
                >
                  <button
                    onClick={() => onDate(date)}
                    title={`${date} 이벤트 기록`}
                  >
                    <b>{Number(date.slice(-2))}</b>
                    <small>
                      {
                        ["일", "월", "화", "수", "목", "금", "토"][
                          new Date(`${date}T12:00:00Z`).getUTCDay()
                        ]
                      }
                    </small>
                    {data.events.some(
                      (e) => !e.deleted_at && datePart(e.starts_at) === date,
                    ) && <i className="event-dot" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="timeline-events">
              <th className="label-col">이벤트 · 날짜를 눌러 기록</th>
              <td className="summary-col">
                {
                  data.events.filter(
                    (e) =>
                      !e.deleted_at &&
                      datePart(e.starts_at) >= period.start &&
                      datePart(e.starts_at) <= period.end,
                  ).length
                }
                건
              </td>
              {ds.map((date) => (
                <td key={date} className={date === today ? "today-col" : ""}>
                  {data.events
                    .filter(
                      (e) => !e.deleted_at && datePart(e.starts_at) === date,
                    )
                    .map((e) => (
                      <button
                        key={e.id}
                        className="event-marker"
                        title={e.title}
                        onClick={() =>
                          onEdit({ collection: "events", record: e })
                        }
                      >
                        {e.title}
                      </button>
                    ))}
                </td>
              ))}
            </tr>
            {visible.map((r) => {
              const row = r.metricRow;
              const siblings = row?.metric
                ? metricGroup(data.metrics, row.metric)
                : [];
              const metricIndex = siblings.findIndex(
                (m) => m.id === row?.metric?.id,
              );
              const children = rows
                .filter(
                  (child) => child.parentIds.includes(r.id) && child.metricRow,
                )
                .map((child) => child.metricRow!);
              const options =
                r.rollup && !r.fixedRollup
                  ? rollupOptions(children, r.finance !== false)
                  : [];
              const selected =
                r.fixedRollup ??
                (options.some((o) => o.id === selections[r.id])
                  ? selections[r.id]
                  : options[0]?.id);
              const rollupUnit = r.fixedUnit
                ? r.fixedUnit
                : r.fixedRollup === "roi"
                  ? "%"
                  : (options.find((o) => o.id === selected)?.unit ?? "");
              const ri = editable.findIndex((e) => e.id === r.id);
              const aggregate = row ? metricValue(data, row, period) : null;
              return (
                <tr
                  key={r.id}
                  className={
                    row || r.fixedRollup
                      ? "metric-row"
                      : r.depth === 0
                        ? "channel-row"
                        : "content-row"
                  }
                >
                  <th
                    className="label-col"
                    style={{ paddingLeft: 14 + r.depth * 16 }}
                  >
                    <div className="row-label">
                      {!row && !r.fixedRollup && !r.id.startsWith("setup:") && (
                        <button
                          className="toggle"
                          aria-label={`${r.label} ${isCollapsed(r.id) ? "펼치기" : "접기"}`}
                          onClick={() =>
                            setCollapsed((x) => ({
                              ...x,
                              [r.id]: !isCollapsed(r.id),
                            }))
                          }
                        >
                          {isCollapsed(r.id) ? "›" : "⌄"}
                        </button>
                      )}
                      <button
                        className="row-name"
                        aria-expanded={
                          r.edit?.collection === "contents"
                            ? !isCollapsed(r.id)
                            : undefined
                        }
                        title={`${r.label}${r.detail ? ` · ${r.detail}` : ""}`}
                        onClick={() =>
                          r.edit?.collection === "contents"
                            ? setCollapsed((x) => ({
                                ...x,
                                [r.id]: !isCollapsed(r.id),
                              }))
                            : r.edit && onEdit(r.edit)
                        }
                        disabled={!r.edit}
                      >
                        <b>{r.label}</b>
                        <small>{r.detail}</small>
                      </button>
                      {r.edit?.collection === "contents" && (
                        <button
                          className="row-add"
                          aria-label={`${r.label} 상세·수정`}
                          onClick={() => onDetail(r.id)}
                        >
                          ⋯
                        </button>
                      )}
                      {r.add && (
                        <button
                          className="row-add"
                          aria-label={`${r.label} 항목 추가`}
                          onClick={() => onEdit(r.add!)}
                        >
                          ＋
                        </button>
                      )}
                      {(r.edit?.collection === "channels" ||
                        r.edit?.collection === "contents") && (
                        <button
                          className="row-add"
                          title="세부 지표 추가"
                          aria-label={`${r.label} 지표 추가`}
                          onClick={() => {
                            const content = data.contents.find(
                              (c) => c.id === r.id,
                            );
                            const ch = data.channels.find(
                              (c) => c.id === (content?.channel_id ?? r.id),
                            );
                            const profile =
                              content && isBusinessProfile(content);
                            onEdit({
                              collection: "metrics",
                              record: {
                                channel_id: ch?.id,
                                scope: profile
                                  ? "total"
                                  : ch?.measurement_template === "paid_ad" ||
                                      ch?.measurement_template === "search_ad"
                                    ? "paid"
                                    : "total",
                                key_prefix: profile ? "bizProfile" : "",
                                sort_order:
                                  Math.max(
                                    0,
                                    ...data.metrics
                                      .filter((m) => m.channel_id === ch?.id)
                                      .map((m) => m.sort_order),
                                  ) + 1,
                              },
                            });
                          }}
                        >
                          ⊕
                        </button>
                      )}
                      {row?.metric && (
                        <span className="metric-actions">
                          {([-1, 1] as const).map((direction) => (
                            <button
                              key={direction}
                              disabled={
                                metricBusy ||
                                (direction === -1
                                  ? metricIndex === 0
                                  : metricIndex === siblings.length - 1)
                              }
                              aria-label={`${r.label} ${direction === -1 ? "위로" : "아래로"}`}
                              onClick={() => {
                                setMetricBusy(true);
                                void onMetricMove(row.metric!.id, direction)
                                  .catch(() => {})
                                  .finally(() => setMetricBusy(false));
                              }}
                            >
                              {direction === -1 ? "↑" : "↓"}
                            </button>
                          ))}
                          <button
                            disabled={metricBusy}
                            aria-label={`${r.label} 지표 삭제`}
                            title="지표 삭제 · 입력값 보존"
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `‘${r.label}’ 지표를 삭제할까요? 같은 채널의 소재에 공통 적용되며 입력값은 보존됩니다.`,
                                )
                              )
                                return;
                              setMetricBusy(true);
                              void onMetricDelete(row.metric!.id, true)
                                .catch(() => {})
                                .finally(() => setMetricBusy(false));
                            }}
                          >
                            ×
                          </button>
                        </span>
                      )}
                    </div>
                  </th>
                  <td
                    className="summary-col"
                    title={
                      aggregate?.observedOn
                        ? `마지막 관측 ${aggregate.observedOn}`
                        : ""
                    }
                  >
                    {r.rollup && selected && (
                      <div className="rollup-summary">
                        {!r.fixedRollup && (
                          <select
                            aria-label={`${r.label} 요약 지표`}
                            value={selected}
                            onChange={(e) => {
                              const next = {
                                ...selections,
                                [r.id]: e.target.value,
                              };
                              setSelections(next);
                              try {
                                localStorage.setItem(
                                  selectionKey,
                                  JSON.stringify(next),
                                );
                              } catch {}
                            }}
                          >
                            {options.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        )}
                        <span
                          title={
                            selected === "roi"
                              ? "연결 매출·원가·마케팅 비용으로 계산. 자료가 없으면 —"
                              : "선택 지표의 월간 집계"
                          }
                        >
                          {number(
                            rollupValue(
                              data,
                              children,
                              r.rollup,
                              selected,
                              period,
                            ),
                            rollupUnit,
                          )}
                        </span>
                      </div>
                    )}
                    {row &&
                      number(
                        aggregate?.value,
                        row.metric?.unit === "percent"
                          ? "%"
                          : row.kind === "cost" ||
                              row.metric?.unit === "currency"
                            ? "원"
                            : "",
                      )}
                  </td>
                  {ds.map((date, di) => (
                    <td
                      key={date}
                      data-today={date === today ? "true" : undefined}
                      className={
                        (date === today ? "today-col " : "") +
                        (row && !allowed(row, date) ? "out-of-period" : "")
                      }
                    >
                      {r.rollup && selected && (
                        <span
                          className="derived"
                          title={
                            selected === "roi"
                              ? "해당 날짜 수납·원가·비용 기준 ROI, 자료가 없으면 —"
                              : undefined
                          }
                        >
                          {number(
                            rollupValue(data, children, r.rollup, selected, {
                              start: date,
                              end: date,
                            }),
                            rollupUnit,
                          )}
                        </span>
                      )}
                      {row &&
                        allowed(row, date) &&
                        (row.metric?.mode === "ratio" ? (
                          <span className="derived">
                            {number(
                              metricValue(data, row, { start: date, end: date })
                                .value,
                              row.metric.unit === "percent" ? "%" : "",
                            )}
                          </span>
                        ) : (
                          <EditableCell
                            cellId={`${ri}:${di}`}
                            label={`${row.content_id ? data.contents.find((c) => c.id === row.content_id)?.title + " · " : ""}${row.promotion_id ? data.promotions.find((p) => p.id === row.promotion_id)?.title + " · " : ""}${r.label} ${date}`}
                            value={
                              metricValue(data, row, { start: date, end: date })
                                .value
                            }
                            onSave={(raw) => onSave([change(row, date, raw)])}
                            onMove={(key, shift) => move(ri, di, key, shift)}
                            onPaste={(raw) => paste(ri, di, raw)}
                          />
                        ))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="sheet-help">
        Enter ↓ · Shift+Enter ↑ · Tab → · Excel 범위 붙여넣기 · 빈칸은 미입력,
        0은 실제 0 · 누적값은 마지막 관측 기준
      </div>
    </section>
  );
}
