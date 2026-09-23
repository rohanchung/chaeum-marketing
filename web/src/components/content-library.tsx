"use client";

import { rankText } from "@/lib/keyword-ranks";
import { metricValue } from "@/lib/analytics";
import { rollupOptions, rollupValue } from "@/lib/sheet-rollup";
import {
  Content,
  Data,
  MetricRow,
  Period,
  compareContentCreated,
  datePart,
  isBusinessProfile,
  isSearchKeyword,
  metricsForContent,
  money,
  monthPeriod,
  number,
} from "@/lib/domain";
import {
  CSSProperties,
  Dispatch,
  SetStateAction,
  useMemo,
  useState,
} from "react";

type Lifecycle = "active" | "archive" | "trash";

type Props = {
  data: Data;
  month: string;
  today: string;
  lifecycle: string;
  search: string;
  onLifecycle: (value: string) => void;
  onSearch: (value: string) => void;
  onMonthChange: (value: string) => void;
  onCreate: () => void;
  onManageChannels: () => void;
  onDetail: (id: string) => void;
};

const contentType = (content: Content) => {
  if (isBusinessProfile(content)) return "비즈프로필";
  if (isSearchKeyword(content)) return "검색 키워드";
  return (
    {
      post: "게시물",
      reel: "릴스",
      blog: "블로그 글",
      ad_creative: "광고 소재",
      other: "기타",
    }[content.content_type] ?? "소재"
  );
};

const statusLabel = (content: Content) => {
  if (content.deleted_at) return "휴지통";
  return content.status === "archived" ? "아카이브" : "운영 중";
};

const shown = (content: Content, lifecycle: Lifecycle) =>
  lifecycle === "trash"
    ? !!content.deleted_at
    : lifecycle === "archive"
      ? !content.deleted_at && content.status === "archived"
      : !content.deleted_at && content.status !== "archived";

function metricRows(data: Data, content: Content): MetricRow[] {
  const promotions = data.promotions.filter(
    (promotion) => !promotion.deleted_at && promotion.content_id === content.id,
  );
  const rows: MetricRow[] = [];
  for (const metric of metricsForContent(data.metrics, content)) {
    if (metric.scope !== "paid") {
      rows.push({
        id: `${metric.id}:${content.id}:direct`,
        label: metric.name,
        kind: "metric",
        metric,
        content_id: content.id,
        promotion_id: null,
      });
      continue;
    }
    for (const promotion of promotions)
      rows.push({
        id: `${metric.id}:${content.id}:${promotion.id}`,
        label: metric.name,
        kind: "metric",
        metric,
        content_id: content.id,
        promotion_id: promotion.id,
        start: promotion.start_date,
        end: promotion.end_date,
      });
  }
  return rows;
}

function channelMetricRows(data: Data, channelId: string): MetricRow[] {
  return data.metrics
    .filter(
      (metric) =>
        !metric.deleted_at &&
        metric.channel_id === channelId &&
        metric.scope === "channel",
    )
    .map((metric) => ({
      id: `${metric.id}:channel`,
      label: metric.name,
      kind: "metric" as const,
      metric,
      content_id: null,
      promotion_id: null,
    }));
}

function dateRange(data: Data, content: Content) {
  const promotions = data.promotions
    .filter((promotion) => !promotion.deleted_at && promotion.content_id === content.id)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (promotions.length)
    return promotions.length === 1
      ? `${promotions[0].start_date.slice(5).replace("-", "/")}–${promotions[0].end_date.slice(5).replace("-", "/")}`
      : `${promotions[0].start_date.slice(5).replace("-", "/")}–`;
  return datePart(content.published_at)
    ? datePart(content.published_at).slice(5).replace("-", "/")
    : "—";
}

function displayValue(value: number | null, row: MetricRow | undefined) {
  if (!row?.metric) return number(value);
  if (row.metric.unit === "rank") return rankText(value);
  return number(
    value,
    row.metric.unit === "currency"
      ? "원"
      : row.metric.unit === "percent"
        ? "%"
        : "",
  );
}

export function ContentLibrary({
  data,
  month,
  today,
  lifecycle,
  search,
  onLifecycle,
  onSearch,
  onMonthChange,
  onCreate,
  onManageChannels,
  onDetail,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedMetrics, setSelectedMetrics] = useState<Record<string, string>>({});
  const period = useMemo<Period>(() => monthPeriod(month), [month]);
  const query = search.trim().toLocaleLowerCase("ko-KR");
  const groups = data.channels
    .filter((channel) => lifecycle === "trash" ? !!channel.deleted_at : !channel.deleted_at)
    .map((channel) => ({
      channel,
      channelRows:
        lifecycle === "active" ? channelMetricRows(data, channel.id) : [],
      contents: data.contents
        .filter(
          (content) =>
            content.channel_id === channel.id &&
            shown(content, lifecycle as Lifecycle) &&
            (!query || content.title.toLocaleLowerCase("ko-KR").includes(query)),
        )
        .sort(compareContentCreated),
    }))
    .filter(({ contents, channelRows }) => contents.length || channelRows.length);
  const toggle = (
    setter: Dispatch<SetStateAction<Set<string>>>,
    id: string,
  ) =>
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const moveMonth = (offset: number) => {
    const [year, currentMonth] = month.split("-").map(Number);
    const next = new Date(Date.UTC(year, currentMonth - 1 + offset, 1));
    onMonthChange(
      `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  };

  return (
    <section className="content-library" aria-labelledby="content-library-title">
      <div className="content-library-head">
        <div className="content-library-title">
          <h1 id="content-library-title">콘텐츠</h1>
          <span className="content-library-sync">● 콘텐츠·광고 소재 운영</span>
        </div>
        <div className="content-library-controls">
          <div className="segmented content-lifecycle" aria-label="소재 상태 필터">
            {([
              ["active", "운영 중"],
              ["archive", "아카이브"],
              ["trash", "휴지통"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                className={lifecycle === value ? "selected" : ""}
                onClick={() => onLifecycle(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="content-search">
            <span>⌕</span>
            <input
              aria-label="소재 검색"
              placeholder="소재 검색"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
            />
          </label>
          <div className="content-period-controls">
            <button aria-label="이전 달" onClick={() => moveMonth(-1)}>‹</button>
            <input
              aria-label="콘텐츠 조회 월"
              type="month"
              value={month}
              onChange={(event) => event.target.value && onMonthChange(event.target.value)}
            />
            <button aria-label="다음 달" onClick={() => moveMonth(1)}>›</button>
            <button onClick={() => onMonthChange(today.slice(0, 7))}>오늘</button>
          </div>
          <button onClick={onManageChannels}>채널 관리</button>
          <button className="primary" onClick={onCreate}>＋ 소재 추가</button>
        </div>
      </div>
      <div className="content-library-panel">
        <div className="content-library-panel-head">
          <div>
            <h2>콘텐츠 운영 목록</h2>
            <small>{month.replace("-", "년 ")}월 · 채널별 소재와 대표 지표</small>
          </div>
          <span>{groups.reduce((total, group) => total + group.contents.length, 0)}개 소재</span>
        </div>
        <div className="content-table-scroll">
          <table className="content-table">
            <thead>
              <tr>
                <th>상태</th>
                <th>소재 / 운영 대상</th>
                <th>채널</th>
                <th>유형</th>
                <th>발행·집행 기간</th>
                <th>대표 지표</th>
                <th>월간 값</th>
                <th>{Number(month.slice(5))}월 비용</th>
                <th aria-label="더보기" />
              </tr>
            </thead>
            <tbody>
              {groups.map(({ channel, contents, channelRows }) => {
                const groupRows = [
                  ...channelRows,
                  ...contents.flatMap((content) => metricRows(data, content)),
                ];
                const groupSpend = rollupValue(
                  data,
                  groupRows,
                  { channelId: channel.id },
                  "spend",
                  period,
                );
                const closed = collapsed.has(channel.id);
                return (
                  <ContentChannelGroup
                    key={channel.id}
                    channel={channel}
                    contents={contents}
                    channelRows={channelRows}
                    closed={closed}
                    groupSpend={groupSpend}
                    data={data}
                    period={period}
                    expanded={expanded}
                    selectedMetrics={selectedMetrics}
                    onToggleGroup={() => toggle(setCollapsed, channel.id)}
                    onToggleContent={(id) => toggle(setExpanded, id)}
                    onMetricSelect={(id, value) =>
                      setSelectedMetrics((current) => ({ ...current, [id]: value }))
                    }
                    onDetail={onDetail}
                  />
                );
              })}
            </tbody>
          </table>
          {!groups.length && (
            <div className="content-library-empty">
              표시할 소재가 없습니다. 상태 필터를 바꾸거나 새 소재를 추가하세요.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ContentChannelGroup({
  channel,
  contents,
  channelRows,
  closed,
  groupSpend,
  data,
  period,
  expanded,
  selectedMetrics,
  onToggleGroup,
  onToggleContent,
  onMetricSelect,
  onDetail,
}: {
  channel: Data["channels"][number];
  contents: Content[];
  channelRows: MetricRow[];
  closed: boolean;
  groupSpend: number | null;
  data: Data;
  period: Period;
  expanded: Set<string>;
  selectedMetrics: Record<string, string>;
  onToggleGroup: () => void;
  onToggleContent: (id: string) => void;
  onMetricSelect: (id: string, value: string) => void;
  onDetail: (id: string) => void;
}) {
  return (
    <>
      <tr className="content-channel-group" style={{ "--channel-color": channel.color ?? "#287a56" } as CSSProperties}>
        <th colSpan={6}>
          <button onClick={onToggleGroup} aria-expanded={!closed}>
            <span className="content-channel-caret">{closed ? "▸" : "▾"}</span>
            <i />
            {channel.name}
            <small>{contents.length ? `${contents.length}개` : "채널 지표"}</small>
          </button>
        </th>
        <td className="content-group-value">{contents.length || "—"}</td>
        <td className="content-group-value">{money(groupSpend)}</td>
        <td />
      </tr>
      {!closed && channelRows.length > 0 && (
        <ChannelMetricRow
          channel={channel}
          rows={channelRows}
          data={data}
          period={period}
          expanded={expanded.has(`channel:${channel.id}`)}
          selectedMetric={selectedMetrics[`channel:${channel.id}`]}
          onToggle={() => onToggleContent(`channel:${channel.id}`)}
          onMetricSelect={(value) => onMetricSelect(`channel:${channel.id}`, value)}
        />
      )}
      {!closed &&
        contents.map((content) => (
          <ContentRow
            key={content.id}
            content={content}
            channel={channel}
            data={data}
            period={period}
            expanded={expanded.has(content.id)}
            selectedMetric={selectedMetrics[content.id]}
            onToggle={() => onToggleContent(content.id)}
            onMetricSelect={(value) => onMetricSelect(content.id, value)}
            onDetail={() => onDetail(content.id)}
          />
        ))}
    </>
  );
}

function ChannelMetricRow({
  channel,
  rows,
  data,
  period,
  expanded,
  selectedMetric,
  onToggle,
  onMetricSelect,
}: {
  channel: Data["channels"][number];
  rows: MetricRow[];
  data: Data;
  period: Period;
  expanded: boolean;
  selectedMetric?: string;
  onToggle: () => void;
  onMetricSelect: (value: string) => void;
}) {
  const options = rollupOptions(rows);
  const current = options.some((option) => option.id === selectedMetric)
    ? selectedMetric!
    : options[0]?.id;
  const representative = current
    ? rollupValue(data, rows, { channelId: channel.id }, current, period)
    : null;
  const selectedRow = current?.startsWith("metric:")
    ? rows.find((row) => `metric:${row.metric?.id}` === current)
    : undefined;
  const spend = rollupValue(data, rows, { channelId: channel.id }, "spend", period);
  return (
    <>
      <tr className="content-item-row content-channel-metric-row">
        <td><span className="content-status channel-direct"><i />직접 기록</span></td>
        <th>
          <div className="content-item-name">
            <button
              className="content-expand"
              aria-label={`${channel.name} 채널 지표 ${expanded ? "접기" : "펼치기"}`}
              aria-expanded={expanded}
              onClick={onToggle}
            >
              {expanded ? "▾" : "▸"}
            </button>
            <span className="content-item-title">채널 자체 지표</span>
          </div>
        </th>
        <td><span className="content-channel-name"><i style={{ background: channel.color ?? "#287a56" }} />{channel.name}</span></td>
        <td>채널 지표</td>
        <td>매일 기록</td>
        <td>
          <select
            aria-label={`${channel.name} 채널 대표 지표`}
            value={current}
            onChange={(event) => onMetricSelect(event.target.value)}
          >
            {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </td>
        <td className="content-value">{displayValue(representative, selectedRow)}</td>
        <td className="content-value">{money(spend)}</td>
        <td><span className="content-more content-more-static">—</span></td>
      </tr>
      {expanded && (
        <tr className="content-metric-row">
          <td colSpan={9}>
            <div className="content-metric-strip">
              {rows.map((row) => (
                <span key={row.id}>
                  <b>{row.label}</b>
                  {displayValue(metricValue(data, row, period).value, row)}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ContentRow({
  content,
  channel,
  data,
  period,
  expanded,
  selectedMetric,
  onToggle,
  onMetricSelect,
  onDetail,
}: {
  content: Content;
  channel: Data["channels"][number];
  data: Data;
  period: Period;
  expanded: boolean;
  selectedMetric?: string;
  onToggle: () => void;
  onMetricSelect: (value: string) => void;
  onDetail: () => void;
}) {
  const rows = metricRows(data, content);
  const options = rollupOptions(rows, !isBusinessProfile(content));
  const current = options.some((option) => option.id === selectedMetric)
    ? selectedMetric!
    : options[0]?.id;
  const representative = current
    ? rollupValue(data, rows, { contentId: content.id }, current, period)
    : null;
  const selectedRow = current?.startsWith("metric:")
    ? rows.find((row) => `metric:${row.metric?.id}` === current)
    : undefined;
  const spend = rollupValue(data, rows, { contentId: content.id }, "spend", period);
  return (
    <>
      <tr className={`content-item-row${content.status === "archived" || content.deleted_at ? " muted" : ""}`}>
        <td>
          <span className={`content-status ${content.status === "archived" || content.deleted_at ? "inactive" : ""}`}>
            <i />
            {statusLabel(content)}
          </span>
        </td>
        <th>
          <div className="content-item-name">
            <button
              className="content-expand"
              aria-label={`${content.title} 세부 지표 ${expanded ? "접기" : "펼치기"}`}
              aria-expanded={expanded}
              onClick={onToggle}
            >
              {expanded ? "▾" : "▸"}
            </button>
            <button className="content-item-title" onClick={onDetail} title={content.title}>
              {content.title}
              {content.notes && <small>{content.notes}</small>}
            </button>
          </div>
        </th>
        <td><span className="content-channel-name"><i style={{ background: channel.color ?? "#287a56" }} />{channel.name}</span></td>
        <td>{contentType(content)}</td>
        <td>{dateRange(data, content)}</td>
        <td>
          {options.length ? (
            <select
              aria-label={`${content.title} 대표 지표`}
              value={current}
              onChange={(event) => onMetricSelect(event.target.value)}
            >
              {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          ) : "—"}
        </td>
        <td className="content-value">{displayValue(representative, selectedRow)}</td>
        <td className="content-value">{money(spend)}</td>
        <td><button className="content-more" aria-label={`${content.title} 상세 보기`} onClick={onDetail}>⋯</button></td>
      </tr>
      {expanded && (
        <tr className="content-metric-row">
          <td colSpan={9}>
            <div className="content-metric-strip">
              {rows.length ? rows.map((row) => (
                <span key={row.id}>
                  <b>{row.label}</b>
                  {displayValue(metricValue(data, row, period).value, row)}
                </span>
              )) : <small>이 소재에 연결된 지표가 없습니다.</small>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
