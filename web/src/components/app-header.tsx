"use client";

import { BrandMark } from "./ui";

export type PeriodRange = "day" | "month" | "year";
/** How the shared period control appears on the current page. */
export type PeriodMode = "month" | "range" | "none";

const rangeLabels: Array<[PeriodRange, string]> = [
  ["day", "일"],
  ["month", "월"],
  ["year", "연"],
];

/**
 * Global header: navigation, save status, the one shared period control used
 * by every page, and logout. Page-specific actions stay in each page.
 */
export function AppHeader({
  tabs,
  nav,
  onNav,
  saveState,
  saveLabel,
  periodMode,
  range,
  onRange,
  month,
  onMonth,
  monthFrom,
  onMonthFrom,
  allowMonthRange,
  day,
  onDay,
  today,
  onToday,
  busy,
  onLogout,
}: {
  tabs: readonly string[];
  nav: string;
  onNav: (tab: string) => void;
  saveState: "ok" | "pending" | "error";
  saveLabel: string;
  periodMode: PeriodMode;
  range: PeriodRange;
  onRange: (range: PeriodRange) => void;
  month: string;
  onMonth: (month: string) => void;
  /** First month of a multi-month view (null = one month). */
  monthFrom: string | null;
  onMonthFrom: (month: string | null) => void;
  allowMonthRange: boolean;
  day: string;
  onDay: (day: string) => void;
  today: string;
  onToday: () => void;
  busy: boolean;
  onLogout: () => void;
}) {
  const shift = (value: string, offset: number) => {
    const [year, current] = value.split("-").map(Number);
    const next = new Date(Date.UTC(year, current - 1 + offset, 1));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  // ‹ › move the whole window, so a 3-month range stays 3 months long.
  const moveMonth = (offset: number) => {
    onMonth(shift(month, offset));
    if (monthFrom) onMonthFrom(shift(monthFrom, offset));
  };
  const ranged = allowMonthRange && !!monthFrom;
  const showMonth = periodMode === "month" || (periodMode === "range" && range === "month");
  return (
    <header className="topbar">
      <button className="brand" onClick={() => onNav(tabs[0])}>
        <BrandMark />
        <span>
          로한 <b>마케팅</b>
        </span>
      </button>
      <nav aria-label="주 메뉴">
        {tabs.map((tab) => (
          <button key={tab} className={nav === tab ? "active" : ""} onClick={() => onNav(tab)}>
            {tab}
          </button>
        ))}
      </nav>
      <div className="topbar-tools">
        <span className="status" role="status" title={saveLabel}>
          <i className={saveState === "error" ? "error" : saveState === "pending" ? "pending" : ""} />
          {saveLabel}
        </span>
        {periodMode !== "none" && (
          <div className="period-control">
            {periodMode === "range" && (
              <div className="segmented" aria-label="조회 단위">
                {rangeLabels.map(([value, label]) => (
                  <button
                    key={value}
                    className={range === value ? "selected" : ""}
                    aria-pressed={range === value}
                    onClick={() => onRange(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {showMonth ? (
              <>
                <button aria-label="이전 달" onClick={() => moveMonth(-1)}>‹</button>
                {ranged && (
                  <>
                    <input
                      aria-label="시작 월"
                      type="month"
                      value={monthFrom!}
                      max={month}
                      onChange={(event) => event.target.value && onMonthFrom(event.target.value)}
                    />
                    <span className="period-range-sep">~</span>
                  </>
                )}
                <input
                  aria-label={ranged ? "끝 월" : "조회 월"}
                  type="month"
                  value={month}
                  min={ranged ? monthFrom! : undefined}
                  onChange={(event) => event.target.value && onMonth(event.target.value)}
                />
                <button aria-label="다음 달" onClick={() => moveMonth(1)}>›</button>
                {allowMonthRange && (
                  ranged ? (
                    <button className="period-range-toggle" title="한 달만 보기" onClick={() => onMonthFrom(null)}>한 달</button>
                  ) : (
                    <button className="period-range-toggle" title="여러 달을 묶어 요약합니다" onClick={() => onMonthFrom(shift(month, -1))}>여러 달</button>
                  )
                )}
              </>
            ) : range === "year" ? (
              <input
                aria-label="조회 연도"
                type="number"
                min="2000"
                max="2200"
                value={month.slice(0, 4)}
                onChange={(event) => {
                  if (event.target.value.length === 4) onMonth(`${event.target.value}-01`);
                }}
              />
            ) : (
              <input
                aria-label="조회 날짜"
                type="date"
                value={day}
                onChange={(event) => event.target.value && onDay(event.target.value)}
              />
            )}
            <button onClick={onToday}>오늘 {today.slice(5).replace("-", "/")}</button>
          </div>
        )}
        <button className="logout" disabled={busy} onClick={onLogout}>
          로그아웃
        </button>
      </div>
    </header>
  );
}
