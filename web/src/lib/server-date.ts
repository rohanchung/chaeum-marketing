import { localDate } from "./domain";
export function projectedServerDate(
  serverNow: string,
  elapsedMs: number,
): string {
  const epoch = Date.parse(serverNow);
  if (!Number.isFinite(epoch))
    throw new Error("서버 시간을 확인하지 못했습니다.");
  return localDate(new Date(epoch + Math.max(0, elapsedMs)));
}
