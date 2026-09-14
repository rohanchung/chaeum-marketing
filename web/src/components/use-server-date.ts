"use client";
import { useEffect, useState } from "react";
import { localDate } from "@/lib/domain";
import { projectedServerDate } from "@/lib/server-date";
import { supabase } from "@/lib/supabase";

export function useServerDate(enabled: boolean) {
  const [clock, setClock] = useState({ today: localDate(), synced: false });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let anchor: { now: string; at: number } | null = null;
    const tick = () => {
      if (!alive) return;
      const today = anchor
        ? projectedServerDate(anchor.now, performance.now() - anchor.at)
        : localDate();
      setClock((prev) =>
        prev.today === today && prev.synced === !!anchor
          ? prev
          : { today, synced: !!anchor },
      );
    };
    const sync = async () => {
      const { data, error } = await supabase.rpc("mkt_server_clock");
      if (!alive) return;
      if (
        !error &&
        data?.server_now &&
        Number.isFinite(Date.parse(data.server_now))
      )
        anchor = { now: data.server_now, at: performance.now() };
      tick();
    };
    const resume = () => {
      if (document.visibilityState === "visible") void sync();
    };
    void sync();
    const ticker = window.setInterval(tick, 15000);
    const synchronizer = window.setInterval(() => void sync(), 300000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      alive = false;
      clearInterval(ticker);
      clearInterval(synchronizer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [enabled]);
  return clock;
}
