import { useEffect } from "react";
import { TaskPriority, TaskSource, TaskStatus, WorkProject } from "@/lib/domain";
import { Collection } from "@/lib/repository";

export type Save = (collection: Collection, record: Record<string, unknown>) => Promise<void>;
export type Update = (
  collection: Collection,
  id: string,
  patch: Record<string, unknown>,
) => void;
export type CardDropPosition = "before" | "after" | "child";
export type CardDropTarget = { id: string; position: CardDropPosition };

export const statusLabels: Record<TaskStatus, string> = {
  requested: "받은 요청",
  planned: "예정",
  in_progress: "진행 중",
  waiting: "대기",
  on_hold: "보류",
  done: "완료",
  cancelled: "취소",
};
export const priorityLabels: Record<TaskPriority, string> = {
  low: "낮음",
  normal: "보통",
  high: "높음",
};
export const sourceLabels: Record<TaskSource, string> = {
  self: "내가 만든 업무",
  requested: "요청받은 업무",
  recurring: "반복 업무",
};
export const useModalEscape = (onClose: () => void) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
};
export const projectColor = (project: WorkProject | undefined) => project?.color ?? "#4e986e";
export const readableOnColor = (color: string) => {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 155 ? "#18352a" : "#ffffff";
};
