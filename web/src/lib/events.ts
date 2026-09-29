import { MarketingEvent, Period, datePart } from "./domain";

/**
 * One rule for every view that shows events (dashboard sheet, day dialog,
 * task calendar/list, event page): an event covers every calendar day from
 * its start date through its end date (or only the start date when it has none).
 */
export function eventSpan(event: MarketingEvent) {
  const start = datePart(event.starts_at);
  const end = datePart(event.ends_at) || start;
  return start <= end ? { start, end } : { start: end, end: start };
}

export function eventOnDate(event: MarketingEvent, date: string) {
  if (event.deleted_at) return false;
  const { start, end } = eventSpan(event);
  return start <= date && date <= end;
}

export function eventInPeriod(event: MarketingEvent, period: Period) {
  const { start, end } = eventSpan(event);
  return start <= period.end && end >= period.start;
}

export function compareEvents(a: MarketingEvent, b: MarketingEvent) {
  return a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title, "ko");
}

/** Completed ↔ planned, the one-click toggle used wherever an event has a checkbox. */
export const toggledEventStatus = (event: MarketingEvent) =>
  event.status === "completed" ? "planned" : "completed";
