"use client";
import { useSyncExternalStore } from "react";
import { navigateTab, navigationTab } from "@/lib/navigation";
const subscribe = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  window.addEventListener("hashchange", listener);
  window.addEventListener("rohan-navigation", listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("rohan-navigation", listener);
  };
};
const snapshot = () => navigationTab(window.location.hash);
export function useNavigation() {
  const tab = useSyncExternalStore(subscribe, snapshot, () => "대시보드");
  return [tab, (next: string) => navigateTab(window, next)] as const;
}
