import { Channel } from "./domain";
export const orderedChannels = (channels: Channel[]) =>
  [...channels].sort(
    (a, b) =>
      (a.sort_order ?? 2147483647) - (b.sort_order ?? 2147483647) ||
      a.id.localeCompare(b.id),
  );
export function moveChannel(
  channels: Channel[],
  from: string,
  target: string,
  position: "before" | "after",
) {
  const sorted = orderedChannels(channels);
  const source = sorted.find((c) => c.id === from && !c.deleted_at);
  if (
    !source ||
    !sorted.some((c) => c.id === target && !c.deleted_at) ||
    from === target
  )
    return [];
  const result = sorted.filter((c) => c.id !== from);
  result.splice(
    result.findIndex((c) => c.id === target) + (position === "after" ? 1 : 0),
    0,
    source,
  );
  return result.map((c, index) => ({ ...c, sort_order: index }));
}
