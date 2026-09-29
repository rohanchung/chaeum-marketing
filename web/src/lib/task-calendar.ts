/** Pure layout helpers for the month calendar on the task page. */

export type WeekCell = string | null;
export type BarSpan = { startColumn: number; endColumn: number };

/** Height of the date label row and of one bar lane, in pixels. */
export const CALENDAR_DAY_HEADER = 22;
export const CALENDAR_LANE_HEIGHT = 21;

/**
 * Columns (1-based, end exclusive) that a date range covers inside one week,
 * or null when the range does not touch the week's real dates.
 */
export function weekSegment(week: WeekCell[], rangeStart: string, rangeEnd: string) {
  const start = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
  const end = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
  const days = week.filter((day): day is string => !!day);
  if (!days.length) return null;
  const weekStart = days[0];
  const weekEnd = days[days.length - 1];
  if (end < weekStart || start > weekEnd) return null;
  const segmentStart = start < weekStart ? weekStart : start;
  const segmentEnd = end > weekEnd ? weekEnd : end;
  const startColumn = week.indexOf(segmentStart) + 1;
  const endColumn = week.indexOf(segmentEnd) + 2;
  if (startColumn < 1 || endColumn <= startColumn) return null;
  return { startColumn, endColumn, continues: segmentStart !== start };
}

/** Places bars in the first lane where they do not overlap, in the given order. */
export function assignLanes<T extends BarSpan>(bars: T[]) {
  const lanes: BarSpan[][] = [];
  const positioned = bars.map((bar) => {
    let lane = lanes.findIndex((items) =>
      items.every((item) => item.endColumn <= bar.startColumn || item.startColumn >= bar.endColumn),
    );
    if (lane < 0) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane].push(bar);
    return { ...bar, lane };
  });
  return { bars: positioned, laneCount: lanes.length };
}

/** How many bar lanes fit in a week row of the given height. */
export function laneCapacity(rowHeight: number) {
  return Math.max(1, Math.floor((rowHeight - CALENDAR_DAY_HEADER) / CALENDAR_LANE_HEIGHT));
}

/**
 * Lanes to draw when only `capacity` lanes fit. When bars overflow, the last
 * lane is kept for the "+N" overflow labels.
 */
export function visibleLaneCount(laneCount: number, capacity: number) {
  return laneCount <= capacity ? laneCount : Math.max(0, capacity - 1);
}

/** Number of hidden bars per weekday column (index 0 = Sunday). */
export function hiddenBarsByColumn(bars: Array<BarSpan & { lane: number }>, visibleLanes: number) {
  const hidden = Array.from({ length: 7 }, () => 0);
  for (const bar of bars) {
    if (bar.lane < visibleLanes) continue;
    for (let column = bar.startColumn; column < bar.endColumn; column += 1) hidden[column - 1] += 1;
  }
  return hidden;
}
