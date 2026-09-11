"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { downloadExcelReport, openPrintableReport } from "@/lib/report-export";

type Channel = {
  id: string;
  name: string;
  color: string | null;
  channel_type: string;
  measurement_template?: string;
};
type Content = {
  id: string;
  title: string;
  content_type: string;
  status: string;
  published_at: string | null;
  channel_id?: string | null;
};
type Performance = {
  id: string;
  channel_id: string;
  content_id: string | null;
  metric_date: string;
  impressions: number | null;
  inflows: number | null;
  consultations: number | null;
};
type Expense = {
  id: string;
  channel_id: string | null;
  content_id: string | null;
  expense_date: string;
  amount: number;
};
type Funnel = {
  id: string;
  metric_date: string;
  inflows: number | null;
  kakao_consultations: number | null;
  phone_consultations: number | null;
  visit_consultations: number | null;
  enrollments: number | null;
};
type MarketingEvent = {
  id: string;
  title: string;
  starts_at: string;
  notes: string | null;
  event_type: string;
};
type Metric =
  | "inflows"
  | "kakao"
  | "phone"
  | "visit"
  | "enrollments"
  | "impressions"
  | "clicks"
  | "reactions"
  | "spend"
  | "views"
  | "reach"
  | "likes"
  | "comments"
  | "saves"
  | "shares"
  | "profileVisits"
  | "linkClicks";
type Row = {
  id: string;
  label: string;
  detail?: string;
  type: "group" | "asset" | "metric";
  indent: number;
  metric?: Metric;
  channel?: Channel;
  content?: Content;
  tone: "funnel" | "paid" | "social" | "cost";
  aggregation?: "sum" | "max";
};

const palette = ["#2f9e6a", "#e58c32", "#7b61d1", "#278ac9", "#d05c7a"];
const num = new Intl.NumberFormat("ko-KR");
const won = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const labels: Record<Metric, string> = {
  inflows: "유입",
  kakao: "카카오 상담",
  phone: "전화 상담",
  visit: "방문 상담",
  enrollments: "등록",
  impressions: "노출수",
  clicks: "클릭수",
  reactions: "반응수",
  spend: "지출",
  views: "조회수",
  reach: "도달",
  likes: "좋아요",
  comments: "댓글",
  saves: "저장",
  shares: "공유",
  profileVisits: "프로필 방문",
  linkClicks: "외부 링크 클릭",
};
const dateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
function profile(channel: Channel) {
  if (channel.measurement_template) return channel.measurement_template;
  const n = channel.name.toLowerCase();
  return n.includes("당근") || channel.channel_type === "paid"
    ? "paid_ad"
    : n.includes("인스타")
      ? "social_content"
      : n.includes("블로그")
        ? "blog_content"
        : "custom";
}

export default function Home() {
  const now = new Date();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [month, setMonth] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const [channels, setChannels] = useState<Channel[]>([]);
  const [contents, setContents] = useState<Content[]>([]);
  const [records, setRecords] = useState<Performance[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [events, setEvents] = useState<MarketingEvent[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    funnel: true,
    paid: true,
    content: true,
  });
  const [editing, setEditing] = useState<{ row: Row; day: number } | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [notice, setNotice] = useState("");
  const [nav, setNav] = useState("운영");
  const [reportOpen, setReportOpen] = useState(false);
  const [panel, setPanel] = useState<
    "quick" | "channel" | "asset" | "event" | null
  >(
    null,
  );
  const [channelName, setChannelName] = useState("");
  const [channelProfile, setChannelProfile] = useState("paid_ad");
  const [assetTitle, setAssetTitle] = useState("");
  const [assetChannel, setAssetChannel] = useState("");
  const [assetKind, setAssetKind] = useState<"paid" | "content">("content");
  const [eventTitle, setEventTitle] = useState("");
  const [eventNotes, setEventNotes] = useState("");
  const [eventDate, setEventDate] = useState(dateKey(now.getFullYear(), now.getMonth(), 1));
  const year = month.getFullYear(),
    monthIndex = month.getMonth(),
    monthNo = monthIndex + 1;
  const periodLabel = `${year}년 ${monthNo}월`;
  const days = Array.from(
    { length: new Date(year, monthNo, 0).getDate() },
    (_, i) => i + 1,
  );
  const start = dateKey(year, monthIndex, 1),
    end = dateKey(year, monthIndex, days.length);
  const moveMonth = (offset: number) => {
    setMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  };
  const openEvent = () => {
    setEventDate(start);
    setPanel("event");
  };

  const load = async () => {
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      setWorkspaceId(null);
      setLoading(false);
      return;
    }
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .limit(1)
      .maybeSingle();
    if (!member) {
      setAuthError("작업공간을 찾지 못했습니다.");
      setLoading(false);
      return;
    }
    const ws = member.workspace_id;
    setWorkspaceId(ws);
    const [channelResult, recordResult, expenseResult, funnelResult, eventResult] =
      await Promise.all([
        supabase
          .from("channels")
          .select("id,name,color,channel_type,measurement_template")
          .eq("workspace_id", ws)
          .is("deleted_at", null)
          .eq("is_active", true)
          .order("created_at"),
        supabase
          .from("performance_records")
          .select(
            "id,channel_id,content_id,metric_date,impressions,inflows,consultations",
          )
          .eq("workspace_id", ws)
          .gte("metric_date", start)
          .lte("metric_date", end)
          .is("deleted_at", null),
        supabase
          .from("expenses")
          .select("id,channel_id,content_id,expense_date,amount")
          .eq("workspace_id", ws)
          .gte("expense_date", start)
          .lte("expense_date", end)
          .is("deleted_at", null),
        supabase
          .from("daily_funnel_records")
          .select(
            "id,metric_date,inflows,kakao_consultations,phone_consultations,visit_consultations,enrollments",
          )
          .eq("workspace_id", ws)
          .gte("metric_date", start)
          .lte("metric_date", end)
          .is("deleted_at", null),
        supabase
          .from("marketing_events")
          .select("id,title,starts_at,notes,event_type")
          .eq("workspace_id", ws)
          .is("deleted_at", null)
          .gte("starts_at", `${start}T00:00:00`)
          .lte("starts_at", `${end}T23:59:59`)
          .order("starts_at"),
      ]);
    setChannels(
      (channelResult.data ?? []).map((item: Channel, i: number) => ({
        ...item,
        color: item.color ?? palette[i % palette.length],
      })),
    );
    setRecords((recordResult.data ?? []) as Performance[]);
    setExpenses((expenseResult.data ?? []) as Expense[]);
    setFunnels((funnelResult.data ?? []) as Funnel[]);
    setEvents((eventResult.data ?? []) as MarketingEvent[]);
    const result = await supabase
      .from("contents")
      .select("id,title,content_type,status,published_at,channel_id")
      .eq("workspace_id", ws)
      .is("deleted_at", null)
      .order("published_at", { ascending: false });
    if (result.error) {
      const legacy = await supabase
        .from("contents")
        .select("id,title,content_type,status,published_at")
        .eq("workspace_id", ws)
        .is("deleted_at", null);
      setContents((legacy.data ?? []) as Content[]);
    } else setContents((result.data ?? []) as Content[]);
    setLoading(false);
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [start, end]);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => void load());
    return () => data.subscription.unsubscribe();
  }, []);

  const recordFor = (row: Row, day: number) => {
    const date = dateKey(year, monthIndex, day);
    if (row.tone === "funnel")
      return funnels.find((x) => x.metric_date === date);
    return records.find(
      (x) =>
        x.metric_date === date &&
        x.channel_id === row.channel?.id &&
        (row.content ? x.content_id === row.content.id : !x.content_id),
    );
  };
  const valueFor = (row: Row, day: number): number | null => {
    const data = recordFor(row, day);
    if (row.tone === "funnel") {
      const f = data as Funnel | undefined;
      if (!f) return null;
      return row.metric === "kakao"
        ? f.kakao_consultations
        : row.metric === "phone"
          ? f.phone_consultations
          : row.metric === "visit"
            ? f.visit_consultations
            : row.metric === "enrollments"
              ? f.enrollments
              : f.inflows;
    }
    if (row.metric === "spend") {
      const date = dateKey(year, monthIndex, day);
      return (
        expenses
          .filter(
            (x) =>
              x.expense_date === date &&
              x.channel_id === row.channel?.id &&
              (!row.content || x.content_id === row.content.id),
          )
          .reduce((sum, x) => sum + Number(x.amount), 0) || null
      );
    }
    const r = data as Performance | undefined;
    if (!r) return null;
    if (row.metric === "clicks") return r.inflows;
    if (row.metric === "reactions") return r.consultations;
    return r.impressions;
  };
  const monthly = (row: Row) => {
    const values = days
      .map((day) => valueFor(row, day))
      .filter((x): x is number => x !== null);
    return !values.length
      ? null
      : row.aggregation === "max"
        ? Math.max(...values)
        : values.reduce((a, b) => a + b, 0);
  };
  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [
      {
        id: "funnel",
        label: "학원 전체 퍼널",
        detail: "채널과 분리된 일일 실적",
        type: "group",
        indent: 0,
        tone: "funnel",
      },
    ];
    if (expanded.funnel)
      ["inflows", "kakao", "phone", "visit", "enrollments"].forEach((metric) =>
        list.push({
          id: `funnel-${metric}`,
          label: labels[metric as Metric],
          type: "metric",
          indent: 1,
          metric: metric as Metric,
          tone: "funnel",
        }),
      );
    list.push({
      id: "paid",
      label: "유료 광고",
      detail: "광고 소재별 일일 성과",
      type: "group",
      indent: 0,
      tone: "paid",
    });
    if (expanded.paid)
      channels
        .filter((c) => profile(c) === "paid_ad")
        .forEach((c) => appendRows(list, c, contents, expanded));
    list.push({
      id: "content",
      label: "콘텐츠",
      detail: "게시물별 누적·발생 지표",
      type: "group",
      indent: 0,
      tone: "social",
    });
    if (expanded.content)
      channels
        .filter((c) => ["social_content", "blog_content"].includes(profile(c)))
        .forEach((c) => appendRows(list, c, contents, expanded));
    return list;
  }, [channels, contents, expanded]);
  const sumFunnel = (metric: Metric) =>
    days.reduce(
      (total, day) =>
        total +
        (valueFor(
          {
            id: metric,
            label: labels[metric],
            type: "metric",
            indent: 0,
            metric,
            tone: "funnel",
          },
          day,
        ) ?? 0),
      0,
    );
  const consultations =
    sumFunnel("kakao") + sumFunnel("phone") + sumFunnel("visit");
  const totalSpend = expenses.reduce(
    (total, item) => total + Number(item.amount),
    0,
  );
  const openCell = (row: Row, day: number) => {
    if (row.type !== "metric") return;
    setEditing({ row, day });
    const value = valueFor(row, day);
    setDraft(value === null ? "" : String(value));
  };
  const saveCell = async () => {
    if (!editing || !workspaceId) return;
    const { row, day } = editing;
    const value = draft === "" ? null : Number(draft);
    if (Number.isNaN(value)) return;
    setSaving(true);
    setStatus("saving");
    const date = dateKey(year, monthIndex, day);
    let error = "";
    if (row.tone === "funnel") {
      const old = recordFor(row, day) as Funnel | undefined;
      const field =
        row.metric === "kakao"
          ? "kakao_consultations"
          : row.metric === "phone"
            ? "phone_consultations"
            : row.metric === "visit"
              ? "visit_consultations"
              : row.metric === "enrollments"
                ? "enrollments"
                : "inflows";
      const payload = {
        workspace_id: workspaceId,
        metric_date: date,
        [field]: value,
      };
      const result = old
        ? await supabase
            .from("daily_funnel_records")
            .update(payload)
            .eq("id", old.id)
        : await supabase.from("daily_funnel_records").insert(payload);
      error = result.error?.message ?? "";
    } else if (row.metric === "spend") {
      const old = expenses.find(
        (x) =>
          x.expense_date === date &&
          x.channel_id === row.channel?.id &&
          (!row.content || x.content_id === row.content.id),
      );
      const payload = {
        workspace_id: workspaceId,
        expense_date: date,
        channel_id: row.channel?.id ?? null,
        content_id: row.content?.id ?? null,
        category: "media",
        amount: value ?? 0,
        notes: "운영 시트 수기 입력",
      };
      const result = old
        ? await supabase.from("expenses").update(payload).eq("id", old.id)
        : await supabase.from("expenses").insert(payload);
      error = result.error?.message ?? "";
    } else {
      const old = recordFor(row, day) as Performance | undefined;
      const field =
        row.metric === "clicks"
          ? "inflows"
          : row.metric === "reactions"
            ? "consultations"
            : "impressions";
      const payload = {
        workspace_id: workspaceId,
        metric_date: date,
        channel_id: row.channel?.id,
        content_id: row.content?.id ?? null,
        [field]: value,
      };
      const result = old
        ? await supabase
            .from("performance_records")
            .update(payload)
            .eq("id", old.id)
        : await supabase.from("performance_records").insert(payload);
      error = result.error?.message ?? "";
    }
    setSaving(false);
    if (error) {
      setNotice(`저장하지 못했습니다: ${error}`);
      setStatus("error");
    } else {
      setEditing(null);
      setNotice("");
      setStatus("saved");
      await load();
    }
  };
  const createChannel = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !channelName.trim()) return;
    const result = await supabase
      .from("channels")
      .insert({
        workspace_id: workspaceId,
        name: channelName.trim(),
        channel_type: channelProfile === "paid_ad" ? "paid" : "organic",
        measurement_template: channelProfile,
        color: palette[channels.length % palette.length],
      });
    if (result.error)
      setNotice(`채널을 만들지 못했습니다: ${result.error.message}`);
    else {
      setPanel(null);
      setChannelName("");
      await load();
    }
  };
  const createAsset = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !assetTitle.trim() || !assetChannel) return;
    const result = await supabase
      .from("contents")
      .insert({
        workspace_id: workspaceId,
        title: assetTitle.trim(),
        channel_id: assetChannel,
        content_type: assetKind === "paid" ? "ad_creative" : "post",
        status: "published",
        published_at: new Date().toISOString(),
      });
    if (result.error)
      setNotice(`자산을 만들지 못했습니다: ${result.error.message}`);
    else {
      setPanel(null);
      setAssetTitle("");
      await load();
    }
  };
  const createEvent = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !eventTitle.trim()) return;
    const result = await supabase.from("marketing_events").insert({
      workspace_id: workspaceId,
      title: eventTitle.trim(),
      event_type: "offline",
      starts_at: new Date(`${eventDate}T09:00:00`).toISOString(),
      notes: eventNotes.trim() || null,
      status: "planned",
    });
    if (result.error) {
      setNotice(`이벤트를 만들지 못했습니다: ${result.error.message}`);
      return;
    }
    setPanel(null);
    setEventTitle("");
    setEventNotes("");
    await load();
  };
  const reportInput = () => ({
    periodLabel,
    channels: channels.map((x) => ({
      id: x.id,
      name: x.name,
      channelType: x.channel_type,
    })),
    days,
    totals: {
      impressions: 0,
      inflows: sumFunnel("inflows"),
      consultations,
      enrollments: sumFunnel("enrollments"),
      spend: totalSpend,
    },
    getMetric: () => ({
      impressions: null,
      inflows: null,
      consultations: null,
      enrollments: null,
      spend: null,
      notes: "",
    }),
  });
  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setAuthError(error.message);
  };
  if (loading && !workspaceId)
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f6f5] text-sm text-[#66746c]">
        운영 시트를 불러오는 중입니다…
      </main>
    );
  if (!workspaceId)
    return (
      <Login
        email={email}
        password={password}
        setEmail={setEmail}
        setPassword={setPassword}
        error={authError}
        submit={signIn}
      />
    );
  return (
    <main className="min-h-screen bg-[#f4f6f5] text-[#15221a]">
      <TopBar
        nav={nav}
        setNav={setNav}
        reportOpen={reportOpen}
        setReportOpen={setReportOpen}
        pdf={() => openPrintableReport(reportInput())}
        excel={() => downloadExcelReport(reportInput())}
        logout={() => void supabase.auth.signOut()}
      />
      <section className="mx-auto max-w-[1800px] px-5 py-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-medium text-[#78877e]">
              운영 <span className="mx-1 text-[#b5beb7]">/</span> 월간 컨트롤 룸
            </p>
            <h1 className="text-[26px] font-semibold tracking-[-.04em]">
              {periodLabel} 운영 현황
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => moveMonth(-1)}
              className="toolbar-button"
            >
              ‹
            </button>
            <button className="toolbar-button min-w-28 font-semibold">
              {periodLabel}
            </button>
            <button
              onClick={() => moveMonth(1)}
              className="toolbar-button"
            >
              ›
            </button>
            <button
              onClick={() =>
                setMonth(new Date(now.getFullYear(), now.getMonth(), 1))
              }
              className="toolbar-button"
            >
              이번 달
            </button>
            <button
              onClick={() => setPanel("quick")}
              className="ml-1 rounded-lg bg-[#1b6d47] px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
            >
              + 빠른 입력
            </button>
            <button
              onClick={() => {
                setAssetKind("paid");
                setPanel("asset");
              }}
              className="toolbar-button"
            >
              + 유료 광고
            </button>
            <button
              onClick={() => {
                setAssetKind("content");
                setPanel("asset");
              }}
              className="toolbar-button"
            >
              + 콘텐츠
            </button>
            <button onClick={openEvent} className="toolbar-button">
              + 이벤트
            </button>
            <button
              onClick={() => setPanel("channel")}
              className="toolbar-button"
            >
              + 채널
            </button>
          </div>
        </div>
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi
            label="유입"
            value={num.format(sumFunnel("inflows"))}
            helper="학원 전체"
          />
          <Kpi
            label="상담"
            value={num.format(consultations)}
            helper="카카오 · 전화 · 방문"
          />
          <Kpi
            label="등록"
            value={num.format(sumFunnel("enrollments"))}
            helper="현장 등록"
            green
          />
          <Kpi
            label="총 직접비"
            value={won.format(totalSpend)}
            helper="광고 · 제작 · 이벤트"
            orange
          />
          <Kpi
            label="상담 → 등록"
            value={
              consultations
                ? `${((sumFunnel("enrollments") / consultations) * 100).toFixed(1)}%`
                : "—"
            }
            helper="학원 전체 전환율"
          />
        </div>
        <EventDock events={events} onAdd={openEvent} />
        <section className="overflow-hidden rounded-2xl border border-[#dce4dd] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7ece8] px-5 py-3.5">
            <div className="flex gap-1.5">
              {["전체", "입력 필요", "광고", "콘텐츠", "이벤트"].map((x, i) => (
                <button
                  key={x}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${i === 0 ? "bg-[#eaf4ed] text-[#17633f]" : "text-[#68776e]"}`}
                >
                  {x}
                </button>
              ))}
            </div>
            <p
              className={`text-xs ${status === "error" ? "text-red-600" : "text-[#728178]"}`}
            >
              <i
                className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${status === "saved" ? "bg-[#2eae70]" : status === "saving" ? "bg-[#e58c32]" : "bg-red-500"}`}
              />
              {status === "saving"
                ? "저장 중…"
                : status === "error"
                  ? "저장 실패"
                  : "자동 저장됨"}{" "}
              <span className="mx-1.5 text-[#c4ccc6]">·</span> 숫자를 클릭해
              바로 입력
            </p>
          </div>
          {notice && (
            <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-700">
              {notice}
            </div>
          )}
          <div className="overflow-auto">
            <div className="min-w-[2200px]">
              <GridHeader days={days} year={year} month={monthIndex} />
              {rows.map((row) => (
                <GridRow
                  key={row.id}
                  row={row}
                  days={days}
                  expanded={expanded}
                  toggle={() =>
                    setExpanded((x) => ({ ...x, [row.id]: !x[row.id] }))
                  }
                  total={monthly(row)}
                  value={(day) => valueFor(row, day)}
                  editing={editing}
                  draft={draft}
                  setDraft={setDraft}
                  open={openCell}
                  save={saveCell}
                  cancel={() => setEditing(null)}
                  saving={saving}
                />
              ))}
            </div>
          </div>
        </section>
        <p className="mt-3 text-xs text-[#819087]">
          상담·등록은 학원 전체 퍼널에 한 번만 기록합니다. 채널·콘텐츠·이벤트
          성과는 별도 접점으로 관리합니다.
        </p>
      </section>
      {panel && (
        <SidePanel
          panel={panel}
          close={() => setPanel(null)}
          channels={channels}
          channelName={channelName}
          setChannelName={setChannelName}
          channelProfile={channelProfile}
          setChannelProfile={setChannelProfile}
          createChannel={createChannel}
          assetTitle={assetTitle}
          setAssetTitle={setAssetTitle}
          assetChannel={assetChannel}
          setAssetChannel={setAssetChannel}
          createAsset={createAsset}
          assetKind={assetKind}
          eventTitle={eventTitle}
          setEventTitle={setEventTitle}
          eventNotes={eventNotes}
          setEventNotes={setEventNotes}
          eventDate={eventDate}
          setEventDate={setEventDate}
          createEvent={createEvent}
          openAsset={(kind) => {
            setAssetKind(kind);
            setPanel("asset");
          }}
          openEvent={openEvent}
        />
      )}
    </main>
  );
}

function EventDock({
  events,
  onAdd,
}: {
  events: MarketingEvent[];
  onAdd: () => void;
}) {
  return (
    <section className="mb-5 rounded-2xl border border-[#eadfce] bg-[#fffdf9] p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#4d3823]">이벤트 · 오프라인</p>
          <p className="mt-1 text-xs text-[#8a7968]">
            설명회, 커피차, 방송 출연, 협업처럼 숫자만으로 남길 수 없는 사건을 기록합니다.
          </p>
        </div>
        <button onClick={onAdd} className="rounded-lg border border-[#e2c9ae] bg-white px-3.5 py-2 text-sm font-semibold text-[#8e572b]">
          + 사건 기록
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {events.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#ead9c7] px-3 py-2 text-xs text-[#9b8977]">
            이번 달에 기록된 이벤트가 없습니다. 사건 기록을 추가해 맥락을 남겨주세요.
          </p>
        ) : (
          events.map((event) => (
            <article key={event.id} className="min-w-[220px] rounded-lg border border-[#eadfce] bg-white px-3 py-2.5">
              <p className="text-sm font-semibold text-[#4b3927]">{event.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#8a7968]">
                {event.notes || "메모 없음"}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function appendRows(
  list: Row[],
  channel: Channel,
  contents: Content[],
  expanded: Record<string, boolean>,
) {
  const channelId = `channel-${channel.id}`,
    p = profile(channel);
  list.push({
    id: channelId,
    label: channel.name,
    detail:
      p === "paid_ad"
        ? "유료 광고"
        : p === "blog_content"
          ? "블로그"
          : "소셜 콘텐츠",
    type: "asset",
    indent: 1,
    channel,
    tone: p === "paid_ad" ? "paid" : "social",
  });
  if (!expanded[channelId]) return;
  const assets = contents.filter((x) => x.channel_id === channel.id);
  if (!assets.length) {
    list.push({
      id: `${channelId}-empty`,
      label: "콘텐츠 또는 광고 소재를 추가하세요",
      detail: "좌측 + 버튼에서 생성",
      type: "asset",
      indent: 2,
      channel,
      tone: p === "paid_ad" ? "paid" : "social",
    });
    return;
  }
  assets.forEach((content) => {
    const assetId = `asset-${content.id}`,
      tone = p === "paid_ad" ? "paid" : "social";
    list.push({
      id: assetId,
      label: content.title,
      detail: content.published_at
        ? `발행 ${new Date(content.published_at).getMonth() + 1}/${new Date(content.published_at).getDate()}`
        : content.status,
      type: "asset",
      indent: 2,
      channel,
      content,
      tone,
    });
    if (!expanded[assetId]) return;
    const metrics: Metric[] =
      p === "paid_ad"
        ? ["impressions", "clicks", "reactions", "spend"]
        : p === "social_content"
          ? [
              "views",
              "reach",
              "likes",
              "comments",
              "saves",
              "shares",
              "profileVisits",
              "linkClicks",
            ]
          : ["views", "clicks"];
    metrics.forEach((metric) =>
      list.push({
        id: `${assetId}-${metric}`,
        label: labels[metric],
        type: "metric",
        indent: 3,
        metric,
        channel,
        content,
        tone: metric === "spend" ? "cost" : tone,
        aggregation: p === "social_content" ? "max" : "sum",
      }),
    );
  });
}
function TopBar({
  nav,
  setNav,
  reportOpen,
  setReportOpen,
  pdf,
  excel,
  logout,
}: {
  nav: string;
  setNav: (x: string) => void;
  reportOpen: boolean;
  setReportOpen: (x: boolean) => void;
  pdf: () => void;
  excel: () => void;
  logout: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#dce4dd] bg-white/95 px-5 backdrop-blur lg:px-8">
      <div className="mx-auto flex h-16 max-w-[1800px] items-center gap-6">
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#1b6d47] text-sm font-bold text-white">
            C
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-[-.025em]">채움 마케팅</p>
            <p className="text-[10px] font-medium text-[#829087]">풍무캠퍼스</p>
          </div>
        </div>
        <div className="hidden h-6 w-px bg-[#e4e9e5] lg:block" />
        <nav className="flex h-full items-center gap-.5">
          {["운영", "콘텐츠", "이벤트", "비용", "분석", "채널 설정"].map(
            (x) => (
              <button
                key={x}
                onClick={() => {
                  setNav(x);
                  setReportOpen(false);
                }}
                className={`h-full border-b-2 px-2.5 text-sm font-medium ${nav === x ? "border-[#1b6d47] text-[#185c3e]" : "border-transparent text-[#64736a]"}`}
              >
                {x}
              </button>
            ),
          )}
          <div className="relative h-full">
            <button
              onClick={() => {
                setNav("리포트");
                setReportOpen(!reportOpen);
              }}
              className={`h-full border-b-2 px-2.5 text-sm font-medium ${nav === "리포트" ? "border-[#1b6d47] text-[#185c3e]" : "border-transparent text-[#64736a]"}`}
            >
              리포트⌄
            </button>
            {reportOpen && (
              <div className="absolute left-0 top-[56px] w-44 rounded-xl border border-[#dfe6e0] bg-white p-1.5 shadow-xl">
                <button onClick={pdf} className="menu-item">
                  PDF로 저장
                </button>
                <button onClick={excel} className="menu-item">
                  Excel 다운로드
                </button>
              </div>
            )}
          </div>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-xs text-[#718177] lg:flex">
            <i className="h-1.5 w-1.5 rounded-full bg-[#36ad72]" />
            동기화됨
          </span>
          <div className="grid h-8 w-8 place-items-center rounded-full bg-[#e8f3eb] text-[11px] font-bold text-[#1b6d47]">
            BH
          </div>
          <button onClick={logout} className="text-xs text-[#829087]">
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
function Kpi({
  label,
  value,
  helper,
  green,
  orange,
}: {
  label: string;
  value: string;
  helper: string;
  green?: boolean;
  orange?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#dfe6e0] bg-white px-4 py-3.5">
      <p className="text-xs font-medium text-[#728178]">{label}</p>
      <p
        className={`mt-1 text-[22px] font-semibold tracking-[-.035em] ${green ? "text-[#1a8050]" : orange ? "text-[#c96d25]" : "text-[#19271f]"}`}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-[#94a098]">{helper}</p>
    </div>
  );
}
function GridHeader({
  days,
  year,
  month,
}: {
  days: number[];
  year: number;
  month: number;
}) {
  return (
    <div
      className="grid border-b border-[#dfe6e0] bg-[#f8faf8]"
      style={{ gridTemplateColumns: `330px 112px repeat(${days.length},58px)` }}
    >
      <div className="sticky left-0 z-20 bg-[#f8faf8] px-5 py-3 text-xs font-semibold text-[#68776e]">
        운영 대상 / 지표
      </div>
      <div className="sticky left-[330px] z-20 border-l border-[#e5eae6] bg-[#f8faf8] px-2 py-3 text-center text-xs font-semibold text-[#68776e]">
        {month + 1}월 합계
      </div>
      {days.map((day) => (
        <div
          key={day}
          className="border-l border-[#e9eeea] px-1 py-2.5 text-center"
        >
          <p className="text-xs font-semibold text-[#44544a]">{day}</p>
          <p className="mt-.5 text-[10px] text-[#98a39b]">
            {weekdays[new Date(year, month, day).getDay()]}
          </p>
        </div>
      ))}
    </div>
  );
}
function GridRow({
  row,
  days,
  expanded,
  toggle,
  total,
  value,
  editing,
  draft,
  setDraft,
  open,
  save,
  cancel,
  saving,
}: {
  row: Row;
  days: number[];
  expanded: Record<string, boolean>;
  toggle: () => void;
  total: number | null;
  value: (day: number) => number | null;
  editing: { row: Row; day: number } | null;
  draft: string;
  setDraft: (x: string) => void;
  open: (row: Row, day: number) => void;
  save: () => void;
  cancel: () => void;
  saving: boolean;
}) {
  const group = row.type === "group",
    metric = row.type === "metric",
    empty = row.id.endsWith("-empty"),
    bg = group
      ? "bg-[#f8faf8]"
      : row.type === "asset"
        ? "bg-[#fcfdfc]"
        : "bg-white";
  return (
    <div
      className={`grid border-b border-[#edf0ed] ${bg}`}
      style={{ gridTemplateColumns: `330px 112px repeat(${days.length},58px)` }}
    >
      <div
        className={`sticky left-0 z-10 flex min-h-[${group ? "46" : "38"}px] items-center border-r border-[#edf0ed] ${bg}`}
        style={{ paddingLeft: `${18 + row.indent * 18}px` }}
      >
        <button
          onClick={toggle}
          disabled={metric || empty}
          className={`mr-2 h-5 w-5 text-xs ${metric || empty ? "text-transparent" : "text-[#69786f]"}`}
        >
          {expanded[row.id] ? "⌄" : "›"}
        </button>
        <div className="min-w-0">
          <p
            className={`${group ? "font-semibold text-[#2a3a2f]" : metric ? "text-[12px] text-[#4b5b51]" : "text-sm font-medium text-[#34443a]"} truncate`}
          >
            {row.label}
          </p>
          {row.detail && (
            <p className="mt-.5 truncate text-[10px] text-[#95a199]">
              {row.detail}
            </p>
          )}
        </div>
      </div>
      <div
        className={`sticky left-[330px] z-10 flex items-center justify-end border-r border-[#e7ece8] ${bg} px-3 text-xs font-semibold ${row.tone === "cost" ? "text-[#c76e2d]" : "text-[#435249]"}`}
      >
        {metric && total !== null
          ? row.metric === "spend"
            ? won.format(total)
            : num.format(total)
          : ""}
      </div>
      {days.map((day) => {
        const current = value(day),
          active = editing?.row.id === row.id && editing.day === day;
        return (
          <div key={day} className="min-h-[38px] border-r border-[#f0f2f0]">
            {metric &&
              (active ? (
                <input
                  autoFocus
                  type="number"
                  min="0"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={save}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void save();
                    if (e.key === "Escape") cancel();
                  }}
                  disabled={saving}
                  className="h-full min-h-[38px] w-full bg-[#eff8f1] px-1 text-right text-xs font-semibold outline-2 outline-[#53a978]"
                />
              ) : (
                <button
                  onClick={() => open(row, day)}
                  className={`h-full min-h-[38px] w-full px-1 text-right text-xs hover:bg-[#edf8f0] ${current === null ? "text-[#c4cec6]" : row.tone === "cost" ? "font-semibold text-[#bd6728]" : "font-medium text-[#304037]"}`}
                >
                  {current === null ? "—" : num.format(current)}
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
}
function SidePanel({
  panel,
  close,
  channels,
  channelName,
  setChannelName,
  channelProfile,
  setChannelProfile,
  createChannel,
  assetTitle,
  setAssetTitle,
  assetChannel,
  setAssetChannel,
  createAsset,
  assetKind,
  eventTitle,
  setEventTitle,
  eventNotes,
  setEventNotes,
  eventDate,
  setEventDate,
  createEvent,
  openAsset,
  openEvent,
}: {
  panel: "quick" | "channel" | "asset" | "event";
  close: () => void;
  channels: Channel[];
  channelName: string;
  setChannelName: (x: string) => void;
  channelProfile: string;
  setChannelProfile: (x: string) => void;
  createChannel: (e: FormEvent) => void;
  assetTitle: string;
  setAssetTitle: (x: string) => void;
  assetChannel: string;
  setAssetChannel: (x: string) => void;
  createAsset: (e: FormEvent) => void;
  assetKind: "paid" | "content";
  eventTitle: string;
  setEventTitle: (x: string) => void;
  eventNotes: string;
  setEventNotes: (x: string) => void;
  eventDate: string;
  setEventDate: (x: string) => void;
  createEvent: (e: FormEvent) => void;
  openAsset: (kind: "paid" | "content") => void;
  openEvent: () => void;
}) {
  const title =
    panel === "channel"
      ? "채널 추가"
      : panel === "asset"
        ? assetKind === "paid"
          ? "유료 광고 소재 추가"
          : "콘텐츠 추가"
        : panel === "event"
          ? "이벤트 · 오프라인 기록"
        : "빠른 입력";
  const eligibleChannels = channels.filter((channel) =>
    assetKind === "paid"
      ? profile(channel) === "paid_ad"
      : profile(channel) !== "paid_ad",
  );
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#142218]/20"
      onMouseDown={close}
    >
      <aside
        className="h-full w-full max-w-[430px] bg-white p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-[#829087]">운영 관리</p>
            <h2 className="mt-1 text-xl font-semibold">{title}</h2>
          </div>
          <button onClick={close} className="text-xl text-[#718077]">
            ×
          </button>
        </div>
        {panel === "channel" && (
          <form onSubmit={createChannel} className="mt-8 space-y-5">
            <Field label="채널 이름">
              <input
                autoFocus
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="예: 당근 광고"
                className="field"
                required
              />
            </Field>
            <Field label="측정 프로필">
              <select
                value={channelProfile}
                onChange={(e) => setChannelProfile(e.target.value)}
                className="field"
              >
                <option value="paid_ad">유료 광고 — 노출·클릭·반응·지출</option>
                <option value="social_content">
                  인스타그램 — 조회·도달·반응·프로필
                </option>
                <option value="blog_content">
                  블로그 — 조회·검색·링크 클릭
                </option>
                <option value="custom">사용자 정의</option>
              </select>
            </Field>
            <p className="rounded-lg bg-[#f2f7f3] p-3 text-xs leading-5 text-[#527060]">
              측정 프로필이 운영 시트의 하위 지표 행과 월간 집계 방식을
              결정합니다.
            </p>
            <Submit label="채널 만들기" />
          </form>
        )}
        {panel === "asset" && (
          <form onSubmit={createAsset} className="mt-8 space-y-5">
            <Field
              label={
                assetKind === "paid" ? "광고 소재 제목" : "콘텐츠 제목"
              }
            >
              <input
                autoFocus
                value={assetTitle}
                onChange={(e) => setAssetTitle(e.target.value)}
                placeholder={
                  assetKind === "paid"
                    ? "예: 중고등부 오픈 설명회 광고"
                    : "예: 풍무 중3 고입 영어 공략"
                }
                className="field"
                required
              />
            </Field>
            <Field label="연결 채널">
              <select
                value={assetChannel}
                onChange={(e) => setAssetChannel(e.target.value)}
                className="field"
                required
              >
                <option value="">
                  {assetKind === "paid" ? "광고 채널 선택" : "콘텐츠 채널 선택"}
                </option>
                {eligibleChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="rounded-lg bg-[#f2f7f3] p-3 text-xs leading-5 text-[#527060]">
              {assetKind === "paid"
                ? "광고 채널만 선택할 수 있습니다. 노출·클릭·반응·지출 행이 생성됩니다."
                : "콘텐츠 채널만 선택할 수 있습니다. 플랫폼별 측정 프로필에 맞는 행이 생성됩니다."}
            </p>
            <Submit label={assetKind === "paid" ? "광고 소재 만들기" : "콘텐츠 만들기"} />
          </form>
        )}
        {panel === "event" && (
          <form onSubmit={createEvent} className="mt-8 space-y-5">
            <Field label="발생일">
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="field"
                required
              />
            </Field>
            <Field label="사건·이벤트 이름">
              <input
                autoFocus
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="예: 9월 고입 설명회 / 커피차 / 방송 출연"
                className="field"
                required
              />
            </Field>
            <Field label="기록 메모">
              <textarea
                value={eventNotes}
                onChange={(e) => setEventNotes(e.target.value)}
                placeholder="장소, 협업처, 목적, 발생한 일, 다음 액션 등 자유롭게 기록"
                className="field min-h-32 resize-y"
              />
            </Field>
            <Submit label="이벤트 기록 만들기" />
          </form>
        )}
        {panel === "quick" && (
          <div className="mt-8 space-y-3">
            <button onClick={openEvent} className="quick-option">
              <b>이벤트 · 오프라인 기록</b>
              <span>설명회, 커피차, 방송 출연, 협업 등</span>
            </button>
            <button onClick={() => openAsset("paid")} className="quick-option">
              <b>유료 광고 소재 추가</b>
              <span>당근 등 광고 채널의 소재·지출 기록</span>
            </button>
            <button onClick={() => openAsset("content")} className="quick-option">
              <b>콘텐츠 추가</b>
              <span>블로그, 인스타그램 게시물·릴스</span>
            </button>
            <button onClick={close} className="quick-option">
              <b>오늘의 학원 퍼널 입력</b>
              <span>유입 · 카카오 · 전화 · 방문 · 등록</span>
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[#34443a]">
        {label}
      </span>
      {children}
    </label>
  );
}
function Submit({ label }: { label: string }) {
  return (
    <button className="mt-2 w-full rounded-lg bg-[#1b6d47] py-3 text-sm font-semibold text-white">
      {label}
    </button>
  );
}
function Login({
  email,
  password,
  setEmail,
  setPassword,
  error,
  submit,
}: {
  email: string;
  password: string;
  setEmail: (x: string) => void;
  setPassword: (x: string) => void;
  error: string;
  submit: (e: FormEvent) => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f6f5] p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-[#dce4dd] bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold">채움 마케팅</h1>
        <p className="mb-6 mt-1 text-sm text-[#728178]">
          풍무캠퍼스 운영 시스템
        </p>
        <Field label="이메일">
          <input
            type="email"
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <div className="mt-4">
          <Field label="비밀번호">
            <input
              type="password"
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
        </div>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <Submit label="로그인" />
      </form>
    </main>
  );
}
