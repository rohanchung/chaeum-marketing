import {
  CellChange,
  Channel,
  Data,
  Period,
  Promotion,
  dates,
  monthPeriod,
  isBusinessProfile,
} from "./domain";

export const isEventChannel = (channel: Channel) =>
  /^(설명회|오프라인)(\s|·|$)/.test(channel.name.trim());

// Empty intervals are input slots, not claims that an ad actually ran.
export function sheetPromotions(
  data: Data,
  contentId: string,
  period: Period,
): Promotion[] {
  const existing = data.promotions.filter(
    (p) => p.content_id === contentId && !p.deleted_at,
  );
  const result = existing.filter(
    (p) => p.start_date <= period.end && p.end_date >= period.start,
  );
  let gap: Promotion | undefined;
  for (const date of dates(period)) {
    if (existing.some((p) => p.start_date <= date && p.end_date >= date)) {
      gap = undefined;
      continue;
    }
    if (!gap) {
      gap = {
        id: `sheet:${contentId}:${date}`,
        workspace_id: "",
        content_id: contentId,
        title: "일별 광고 기록",
        start_date: date,
        end_date: date,
        deleted_at: null,
        notes: null,
      };
      result.push(gap);
    } else gap.end_date = date;
  }
  return result.sort((a, b) => a.start_date.localeCompare(b.start_date));
}

export async function resolveSheetCells(
  data: Data,
  cells: CellChange[],
  create: (record: Record<string, unknown>) => Promise<Promotion>,
): Promise<CellChange[]> {
  const resolved: CellChange[] = [];
  for (const cell of cells) {
    if (!cell.promotion_id?.startsWith("sheet:")) {
      resolved.push(cell);
      continue;
    }
    const content = data.contents.find(
      (c) => c.id === cell.content_id && !c.deleted_at,
    );
    const channel = data.channels.find(
      (c) => c.id === content?.channel_id && !c.deleted_at,
    );
    if (
      !content ||
      isBusinessProfile(content) ||
      !["paid_ad", "social_content", "search_ad"].includes(
        channel?.measurement_template ?? "",
      )
    )
      throw new Error("광고 소재를 확인하세요.");
    let promotion = sheetPromotions(
      data,
      content.id,
      monthPeriod(cell.date.slice(0, 7)),
    ).find((p) => p.start_date <= cell.date && p.end_date >= cell.date)!;
    if (promotion.id.startsWith("sheet:")) {
      // Clearing an empty cell does not create an empty advertising record.
      if (cell.value === null) continue;
      promotion = await create({
        content_id: content.id,
        title: `${cell.date.slice(0, 7)} 일별 광고 기록`,
        start_date: promotion.start_date,
        end_date: promotion.end_date,
        notes:
          "운영 시트 입력 구간. 실제 집행 여부는 날짜별 지표·지출 기록으로 확인합니다.",
      });
      data.promotions.push(promotion);
    }
    resolved.push({ ...cell, promotion_id: promotion.id });
  }
  return resolved;
}
