"use client";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import {
  Data,
  Source,
  datePart,
  localDate,
  modeLabels,
  scopeLabels,
  timestamp,
  categories,
} from "@/lib/domain";
import { Collection } from "@/lib/repository";
import { CarrotGuide } from "./carrot-guide";
import { EventPurchases, ItemSelection } from "./event-purchases";
export type EditorState = {
  collection: Collection;
  record?: Record<string, unknown>;
};
export const titles: Partial<Record<Collection, string>> = {
  channels: "채널",
  contents: "소재",
  events: "이벤트",
  purchases: "구매",
  promotions: "광고 집행",
  metrics: "지표",
  values: "비용 지표 금액",
  costs: "비용",
  customers: "고객·전환",
  payments: "결제·환불",
};
const sourceValue = (r: Record<string, unknown>) =>
  ["channel_id", "content_id", "promotion_id", "event_id"]
    .map((k) => (r[k] ? `${k}:${r[k]}` : null))
    .find(Boolean) ?? "";
export function sourceFields(value: string): Source {
  const fields: Source = {
    channel_id: null,
    content_id: null,
    promotion_id: null,
    event_id: null,
  };
  const [key, id] = value.split(":");
  if (key in fields && id) fields[key as keyof Source] = id;
  return fields;
}
export function SourceOptions({ data }: { data: Data }) {
  return (
    <>
      <option value="">공용 / 출처 미확인</option>
      {data.channels.map((c) => (
        <option key={c.id} value={`channel_id:${c.id}`}>
          채널 · {c.name}
          {c.deleted_at ? " (휴지통)" : ""}
        </option>
      ))}
      {data.contents.map((c) => (
        <option key={c.id} value={`content_id:${c.id}`}>
          소재 · {c.title}
          {c.deleted_at ? " (휴지통)" : ""}
        </option>
      ))}
      {data.promotions.map((p) => (
        <option key={p.id} value={`promotion_id:${p.id}`}>
          광고 · {p.title} ({p.start_date}~{p.end_date})
        </option>
      ))}
      {data.events.map((e) => (
        <option key={e.id} value={`event_id:${e.id}`}>
          이벤트 · {e.title}
        </option>
      ))}
    </>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Editor({
  state,
  data,
  busy,
  onSave,
  onClose,
  today = localDate(),
}: {
  state: EditorState;
  data: Data;
  busy: boolean;
  onSave: (
    collection: Collection,
    record: Record<string, unknown>,
  ) => Promise<void>;
  onClose: () => void;
  today?: string;
}) {
  const { collection, record: r = {} } = state;
  const keyword = r.content_type === "search_keyword";
  const hasMetricValues =
    collection === "metrics" && data.values.some((v) => v.metric_id === r.id);
  const rankMetric = r.unit === "rank" || r.key_prefix === "keywordRank";
  const [keywordMetrics, setKeywordMetrics] = useState<string[] | null>(
    (r.keyword_metric_ids as string[] | null) ?? null,
  );
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [items, setItems] = useState<ItemSelection[]>(() =>
    data.eventItems
      .filter((i) => !i.deleted_at && i.event_id === r.id)
      .map((i) => ({ purchase_id: i.purchase_id, quantity: i.quantity })),
  );
  const [metricScope, setMetricScope] = useState(
    String(r.scope ?? (r.channel_id ? "total" : "funnel")),
  );
  const [metricMode, setMetricMode] = useState(String(r.mode ?? "daily"));
  const [metricUnit, setMetricUnit] = useState(String(r.unit ?? "count"));
  const [metricChannel, setMetricChannel] = useState(
    String(r.channel_id ?? ""),
  );
  const [source, setSource] = useState(sourceValue(r));
  const channelTemplate = data.channels.find(
    (c) => c.id === metricChannel,
  )?.measurement_template;
  const createWithAd =
    collection === "contents" &&
    !r.id &&
    !keyword &&
    channelTemplate === "search_ad";
  const [paymentCustomer, setPaymentCustomer] = useState(
    String(r.customer_id ?? ""),
  );
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    form.current?.querySelector<HTMLElement>("input,select,textarea")?.focus();
    return () => previous?.focus();
  }, []);
  const text = (key: string, fallback = "") => String(r[key] ?? fallback);
  const input = (
    name: string,
    type = "text",
    required = false,
    fallback = "",
    extra: Record<string, unknown> = {},
  ) => (
    <input
      name={name}
      type={type}
      required={required}
      defaultValue={text(name, fallback)}
      {...extra}
    />
  );
  const channel = (
    <Field label="채널">
      <select
        disabled={hasMetricValues}
        name="channel_id"
        required
        value={metricChannel}
        onChange={(e) => setMetricChannel(e.target.value)}
      >
        <option value="">선택하세요</option>
        {data.channels
          .filter((c) => !c.deleted_at || c.id === r.channel_id)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>
    </Field>
  );
  const notes = (
    <Field label="메모">
      <textarea name="notes" defaultValue={text("notes")} rows={3} />
    </Field>
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const fd = new FormData(form.current!);
    const get = (k: string) => String(fd.get(k) ?? "").trim();
    const nullable = (k: string) => get(k) || null;
    let patch: Record<string, unknown> = {
      ...(r.id ? { id: r.id } : {}),
      notes: nullable("notes"),
    };
    try {
      if (collection === "channels")
        patch = {
          ...patch,
          name: get("name"),
          color: get("color"),
          measurement_template: get("measurement_template"),
          channel_type: "other",
          is_active: true,
        };
      if (collection === "contents") {
        patch = {
          ...patch,
          title: get("title"),
          channel_id: get("channel_id"),
          content_type: keyword
            ? "search_keyword"
            : get("content_type") || r.content_type,
          ...(keyword ? { keyword_metric_ids: keywordMetrics } : {}),
          published_at: get("published_at")
            ? timestamp(get("published_at"))
            : null,
          url: nullable("url"),
          status: r.status ?? "published",
        };
        if (createWithAd) {
          const start = get("ad_start"),
            end = get("ad_end");
          if (!start || !end || start > end)
            throw new Error("광고 시작일과 종료일을 확인하세요.");
          patch.content_type = "ad_creative";
          patch.initial_promotion = {
            start_date: start,
            end_date: end,
            title: `${get("title")} 광고`,
          };
        }
      }
      if (collection === "events")
        patch = {
          ...patch,
          title: get("title"),
          starts_at: timestamp(get("starts_at")),
          ends_at: get("ends_at") ? timestamp(get("ends_at")) : null,
          location: nullable("location"),
          status: get("status"),
          event_type: "other",
          items,
        };
      if (collection === "purchases") {
        const quantity = Number(get("quantity")),
          total = Number(get("total_amount"));
        if (
          !Number.isInteger(quantity) ||
          quantity <= 0 ||
          !Number.isFinite(total) ||
          total < 0
        )
          throw new Error(
            "구매 수량은 1 이상의 정수, 결제액은 0 이상으로 입력하세요.",
          );
        patch = {
          ...patch,
          title: get("title"),
          purchased_on: get("purchased_on"),
          quantity,
          total_amount: total,
        };
      }
      if (collection === "promotions")
        patch = {
          ...patch,
          title: get("title"),
          content_id: get("content_id"),
          start_date: get("start_date"),
          end_date: get("end_date"),
        };
      if (collection === "metrics") {
        patch = {
          ...(r.id ? { id: r.id } : {}),
          name: get("name"),
          key: r.key ?? `${r.key_prefix ?? ""}${crypto.randomUUID()}`,
          channel_id: metricScope === "funnel" ? null : metricChannel,
          scope: rankMetric ? "total" : metricScope,
          mode: rankMetric
            ? "latest"
            : metricScope === "funnel"
              ? "daily"
              : metricMode,
          unit: rankMetric ? "rank" : metricUnit,
          sort_order: Number(get("sort_order")),
          numerator: metricMode === "ratio" ? nullable("numerator") : null,
          denominator: metricMode === "ratio" ? nullable("denominator") : null,
          multiplier:
            metricMode === "ratio"
              ? Number(get("multiplier") || 100)
              : (r.multiplier ?? 100),
          include_in_marketing:
            metricUnit === "currency" &&
            (metricScope === "funnel" || metricMode === "daily") &&
            get("include_in_marketing") === "yes",
          funnel_role:
            metricScope === "funnel" && metricUnit === "count"
              ? nullable("funnel_role")
              : null,
        };
      }
      if (collection === "costs") {
        const amount = Number(get("amount"));
        if (!Number.isFinite(amount) || amount < 0)
          throw new Error("비용은 0 이상의 금액으로 입력하세요.");
        patch = {
          ...patch,
          ...sourceFields(source),
          title: get("title"),
          expense_date: get("expense_date"),
          amount,
          category: get("category"),
          payment_status: get("payment_status"),
          grid_entry:
            !!sourceFields(source).promotion_id && get("category") === "media",
        };
      }
      if (collection === "values") {
        patch = {
          metric_id: r.metric_id,
          content_id: r.content_id,
          promotion_id: r.promotion_id,
          metric_date: r.metric_date,
          value: get("value") === "" ? null : Number(get("value")),
        };
      }
      if (collection === "customers")
        patch = {
          ...patch,
          ...sourceFields(source),
          reference_code: get("reference_code"),
          consulted_on: get("consulted_on"),
          enrolled_on: nullable("enrolled_on"),
          confidence: get("confidence"),
        };
      if (collection === "payments") {
        const amount = Number(get("amount"));
        const service_cost =
          get("service_cost") === "" ? null : Number(get("service_cost"));
        if (
          !Number.isFinite(amount) ||
          amount === 0 ||
          (service_cost !== null && !Number.isFinite(service_cost))
        )
          throw new Error("올바른 결제 금액과 원가를 입력하세요.");
        patch = {
          ...patch,
          customer_id: paymentCustomer,
          paid_on: get("paid_on"),
          amount,
          service_cost,
          adjusts_id: nullable("adjusts_id"),
        };
      }
      await onSave(collection, patch);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다.");
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onClose();
          if (e.key === "Tab") {
            const nodes = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
              ),
            );
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <small>로한 마케팅</small>
            <h2 id="editor-title">
              {keyword ? "키워드" : titles[collection]} {r.id ? "수정" : "추가"}
            </h2>
          </div>
          <button aria-label="닫기" disabled={busy} onClick={onClose}>
            ✕
          </button>
        </header>
        <form ref={form} onSubmit={submit}>
          {collection === "channels" && (
            <>
              <Field label="채널 이름">{input("name", "text", true)}</Field>
              <div className="form-pair">
                <Field label="색상">
                  {input("color", "color", true, "#287a56")}
                </Field>
                <Field label="기본 지표 템플릿">
                  <select
                    name="measurement_template"
                    defaultValue={text("measurement_template", "custom")}
                  >
                    <option value="custom">사용자 정의</option>
                    <option value="social_content">인스타그램</option>
                    <option value="blog_content">네이버 블로그</option>
                    <option value="paid_ad">당근 마켓</option>
                    <option value="search_ad">검색 광고</option>
                  </select>
                </Field>
              </div>
              <p className="form-note">
                템플릿은 시작 항목입니다. 저장 후 지표를 추가·수정할 수 있으며
                기존 기록은 덮어쓰지 않습니다.
              </p>
            </>
          )}
          {collection === "contents" && (
            <>
              <Field label={keyword ? "검색 키워드" : "소재 제목"}>
                {input("title", "text", true)}
              </Field>
              {channel}
              <div className="form-pair">
                <Field label="형식">
                  <select
                    disabled={keyword}
                    name="content_type"
                    defaultValue={text("content_type", "post")}
                  >
                    {keyword && (
                      <option value="search_keyword">검색 키워드</option>
                    )}
                    <option value="post">게시물</option>
                    <option value="reel">릴스</option>
                    <option value="blog">블로그 글</option>
                    <option value="ad_creative">광고 소재</option>
                    {r.content_type === "business_profile" && (
                      <option value="business_profile">비즈프로필</option>
                    )}
                    <option value="other">기타</option>
                  </select>
                </Field>
                <Field label={keyword ? "관리 시작일" : "발행일"}>
                  <input
                    name="published_at"
                    type="date"
                    defaultValue={datePart(r.published_at as string) || today}
                  />
                </Field>
              </div>
              <Field label={keyword ? "확인 대상 주소 (선택)" : "원본 링크"}>
                {input("url", "url")}
              </Field>
              {keyword ? (
                <>
                  <p className="form-note">
                    날짜별 셀에 순위를 입력합니다. 1위가 가장 높고, 미노출은
                    ‘미노출’로 입력하세요. 월간 합산 없이 최근 순위와 변화를
                    표시합니다.
                  </p>
                  <fieldset>
                    <legend>표시할 기기·노출 영역</legend>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={keywordMetrics === null}
                        onChange={(e) =>
                          setKeywordMetrics(
                            e.target.checked
                              ? null
                              : data.metrics
                                  .filter(
                                    (m) =>
                                      m.channel_id === metricChannel &&
                                      m.unit === "rank" &&
                                      !m.deleted_at,
                                  )
                                  .map((m) => m.id),
                          )
                        }
                      />
                      전체 · 새 영역도 자동 표시
                    </label>
                    {data.metrics
                      .filter(
                        (m) =>
                          m.channel_id === metricChannel &&
                          m.unit === "rank" &&
                          !m.deleted_at,
                      )
                      .map((m) => (
                        <label className="check" key={m.id}>
                          <input
                            type="checkbox"
                            checked={
                              keywordMetrics === null ||
                              keywordMetrics.includes(m.id)
                            }
                            onChange={(e) => {
                              const ids =
                                keywordMetrics ??
                                data.metrics
                                  .filter(
                                    (m) =>
                                      m.channel_id === metricChannel &&
                                      m.unit === "rank" &&
                                      !m.deleted_at,
                                  )
                                  .map((m) => m.id);
                              setKeywordMetrics(
                                e.target.checked
                                  ? [...ids, m.id]
                                  : ids.filter((id) => id !== m.id),
                              );
                            }}
                          />
                          {m.name}
                        </label>
                      ))}
                  </fieldset>
                </>
              ) : createWithAd ? (
                <fieldset className="ad-setup">
                  <legend>광고 기간 · 저장하면 지표 입력 칸이 열립니다</legend>
                  <div className="form-pair">
                    <Field label="광고 시작일">
                      {input("ad_start", "date", true, today)}
                    </Field>
                    <Field label="광고 종료일">
                      {input("ad_end", "date", true, today)}
                    </Field>
                  </div>
                  <p className="form-note">
                    노출 · 클릭 · 반응 · 지출 입력 / 클릭률 · 클릭당 비용 자동
                    계산
                  </p>
                </fieldset>
              ) : r.content_type === "business_profile" ? (
                <p className="form-note">
                  방문수·쿠폰 발급수·단골수는 기본적으로 그날 새로 발생한 수를
                  입력합니다. 월간에는 날짜별 값을 더합니다. 지표 옵션에서 집계
                  방식을 변경할 수 있습니다.
                </p>
              ) : channelTemplate === "paid_ad" ? (
                <p className="form-note">
                  저장 후 운영 시트에서 소재 이름을 누르면 노출·클릭·반응·지출을
                  날짜별로 입력할 수 있습니다. 클릭률과 클릭당 비용은 자동
                  계산됩니다.
                </p>
              ) : (
                <p className="form-note">
                  광고 집행은 소재 상세 또는 시트의 ‘광고 지표 입력’에서
                  추가하세요.
                </p>
              )}
              {channelTemplate === "paid_ad" && <CarrotGuide />}
            </>
          )}
          {collection === "purchases" && (
            <>
              <Field label="물품명">{input("title", "text", true)}</Field>
              <Field label="구매·결제일">
                {input("purchased_on", "date", true, today)}
              </Field>
              <div className="form-pair">
                <Field label="구매 수량">
                  {input("quantity", "number", true, "", { min: 1, step: 1 })}
                </Field>
                <Field label="총 결제액 (원)">
                  {input("total_amount", "number", true, "", {
                    min: 0,
                    step: "0.01",
                  })}
                </Field>
              </div>
              <p className="form-note">
                배송비·제작비를 포함한 실제 결제액을 입력하세요. 단가는 자동
                계산하며, 이 금액은 결제일의 마케팅 비용에 한 번 반영됩니다.
                비용 원장에 별도로 입력하지 마세요.
              </p>
            </>
          )}
          {collection === "events" && (
            <>
              <Field label="이벤트 이름">{input("title", "text", true)}</Field>
              <div className="form-pair">
                <Field label="시작일">
                  <input
                    name="starts_at"
                    type="date"
                    required
                    defaultValue={datePart(r.starts_at as string) || today}
                  />
                </Field>
                <Field label="종료일">
                  <input
                    name="ends_at"
                    type="date"
                    defaultValue={datePart(r.ends_at as string)}
                  />
                </Field>
              </div>
              <Field label="장소">{input("location")}</Field>
              <Field label="상태">
                <select name="status" defaultValue={text("status", "planned")}>
                  <option value="planned">예정</option>
                  <option value="active">진행 중</option>
                  <option value="completed">완료</option>
                  <option value="cancelled">취소</option>
                </select>
              </Field>
            </>
          )}
          {collection === "events" && (
            <EventPurchases
              data={data}
              eventId={r.id as string | undefined}
              items={items}
              onChange={setItems}
            />
          )}
          {collection === "promotions" && (
            <>
              <Field label="집행 이름">
                {input("title", "text", true, "광고 집행")}
              </Field>
              <Field label="연결 소재">
                <select
                  name="content_id"
                  required
                  defaultValue={text("content_id")}
                >
                  {data.contents
                    .filter((c) => !c.deleted_at || c.id === r.content_id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                </select>
              </Field>
              <div className="form-pair">
                <Field label="시작일">
                  {input("start_date", "date", true, today)}
                </Field>
                <Field label="종료일">
                  {input("end_date", "date", true, today)}
                </Field>
              </div>
              <p className="form-note">
                기간 내 광고 지표와 광고비만 입력할 수 있습니다. 종료 후에도
                기록은 보존됩니다.
              </p>
              {data.channels.find(
                (ch) =>
                  ch.id ===
                  data.contents.find((c) => c.id === r.content_id)?.channel_id,
              )?.measurement_template === "paid_ad" && <CarrotGuide />}
            </>
          )}
          {collection === "values" && (
            <>
              <p>
                {String(r.title ?? "비용")} · {String(r.metric_date)}
              </p>
              <Field label="금액">{input("value", "number")}</Field>
              <p className="form-note">
                원본 시트 값과 마케팅 비용에 함께 반영됩니다. 비워서 저장하면
                해당 날짜 비용을 지웁니다.
              </p>
            </>
          )}
          {collection === "metrics" && (
            <>
              {rankMetric && (
                <p className="form-note">
                  기기와 영역을 이름에 적으세요. 예: 모바일 · 블로그 순위. 순위
                  정의는 채널의 키워드에 공통으로 추가되며 각 키워드 설정에서
                  표시 여부를 선택합니다.
                </p>
              )}
              <Field label="지표 이름">{input("name", "text", true)}</Field>
              <Field label="측정 범위">
                <select
                  disabled={rankMetric || hasMetricValues}
                  value={metricScope}
                  onChange={(e) => setMetricScope(e.target.value)}
                >
                  {Object.entries(scopeLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              {metricScope !== "funnel" && channel}
              <div className="form-pair">
                <Field label="입력·집계 방식">
                  <select
                    value={metricScope === "funnel" ? "daily" : metricMode}
                    disabled={rankMetric || metricScope === "funnel"}
                    onChange={(e) => setMetricMode(e.target.value)}
                  >
                    {Object.entries(modeLabels).map(([key, label]) => (
                      <option
                        key={key}
                        value={key}
                        disabled={hasMetricValues && key === "ratio"}
                      >
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="단위">
                  <select
                    disabled={rankMetric || hasMetricValues}
                    name="unit"
                    value={metricUnit}
                    onChange={(e) => setMetricUnit(e.target.value)}
                  >
                    {rankMetric && (
                      <option value="rank">순위 (낮을수록 상위)</option>
                    )}
                    <option value="count">건 / 명 / 회</option>
                    <option value="currency">원</option>
                    <option value="percent">%</option>
                  </select>
                </Field>
              </div>
              {metricScope === "funnel" && metricUnit === "count" && (
                <Field label="학원 성과 집계">
                  <select
                    name="funnel_role"
                    defaultValue={text(
                      "funnel_role",
                      ["kakao", "phone", "visit"].includes(String(r.key))
                        ? "consultations"
                        : ["inflows", "enrollments"].includes(String(r.key))
                          ? String(r.key)
                          : "",
                    )}
                  >
                    <option value="">별도 기록만</option>
                    <option value="inflows">유입에 합산</option>
                    <option value="consultations">상담에 합산</option>
                    <option value="enrollments">등록에 합산</option>
                  </select>
                </Field>
              )}
              {metricUnit === "currency" &&
                (metricMode === "daily" || metricScope === "funnel") && (
                  <Field label="마케팅 비용에 합산할까요?">
                    <select
                      name="include_in_marketing"
                      required
                      defaultValue={
                        r.id ? (r.include_in_marketing ? "yes" : "no") : ""
                      }
                    >
                      <option value="" disabled>
                        선택하세요
                      </option>
                      <option value="yes">예 · 실제 지출로 합산</option>
                      <option value="no">아니요 · 지표로만 기록</option>
                    </select>
                  </Field>
                )}
              <p className="form-note">
                {metricMode === "daily"
                  ? "기간 합계: 일별 신규 수를 입력합니다. 1, 2, 1이면 월간 4입니다."
                  : metricMode === "ratio"
                    ? "계산식: 분자·분모 지표의 현재 집계 방식에 따라 다시 계산합니다."
                    : "누적 총수·최근값: 날짜마다 확인한 전체 수를 입력합니다. 1, 2, 1이면 마지막 값 1입니다. 더하지 않습니다."}
              </p>
              {r.include_in_marketing && metricMode !== "daily" && (
                <p className="form-note">
                  이 지표는 기간 합계 방식에서만 마케팅 비용에 합산됩니다.
                  변경하면 해당 지표 금액은 비용 합계에서 제외됩니다.
                </p>
              )}
              <Field label="표시 순서">
                {input("sort_order", "number", true, "0")}
              </Field>
              {metricMode === "ratio" && metricScope !== "funnel" && (
                <>
                  <Field label="분자">
                    <select
                      key={`${metricChannel}:${metricScope}:numerator`}
                      name="numerator"
                      required
                      defaultValue={text("numerator")}
                    >
                      <option value="">선택</option>
                      <option value="$spend">광고비</option>
                      {data.metrics
                        .filter(
                          (m) =>
                            m.channel_id === metricChannel &&
                            !m.deleted_at &&
                            m.scope === metricScope &&
                            m.mode !== "ratio" &&
                            m.unit !== "rank",
                        )
                        .map((m) => (
                          <option key={m.id} value={m.key}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="분모">
                    <select
                      name="denominator"
                      key={`${metricChannel}:${metricScope}:denominator`}
                      required
                      defaultValue={text("denominator")}
                    >
                      <option value="">선택</option>
                      {data.metrics
                        .filter(
                          (m) =>
                            m.channel_id === metricChannel &&
                            !m.deleted_at &&
                            m.scope === metricScope &&
                            m.mode !== "ratio" &&
                            m.unit !== "rank",
                        )
                        .map((m) => (
                          <option key={m.id} value={m.key}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="배수 (비율 100, 단가 1)">
                    {input("multiplier", "number", true, "100")}
                  </Field>
                </>
              )}
              <p className="form-note">
                기록이 있어도 집계 방식을 수정할 수 있습니다. 원본 숫자는
                유지하며 시트·요약·현재 보고서는 변경한 방식으로 다시
                계산합니다. 저장된 보고서는 당시 값을 보존합니다.
                {hasMetricValues &&
                  " 연결 대상·단위 변경과 계산식 전환은 기존 기록과 호환되지 않아 잠겨 있습니다."}
              </p>
            </>
          )}
          {collection === "costs" && (
            <>
              <Field label="비용 이름">{input("title", "text", true)}</Field>
              <div className="form-pair">
                <Field label="지급일">
                  {input("expense_date", "date", true, localDate())}
                </Field>
                <Field label="금액">
                  {input("amount", "number", true, "", {
                    min: 0,
                    step: "0.01",
                  })}
                </Field>
              </div>
              <div className="form-pair">
                <Field label="비용 항목">
                  <select
                    name="category"
                    defaultValue={text("category", "media")}
                  >
                    {Object.entries(categories).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="지급 상태">
                  <select
                    name="payment_status"
                    defaultValue={text("payment_status", "paid")}
                  >
                    <option value="paid">지급 완료</option>
                    <option value="pending">미지급</option>
                    <option value="planned">계획</option>
                    <option value="cancelled">취소</option>
                  </select>
                </Field>
              </div>
              <Field label="비용 대상">
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <SourceOptions data={data} />
                </select>
              </Field>
              <p className="form-note">
                광고 집행의 일별 광고비는 표와 같은 기록입니다. 같은 날짜의
                금액을 수정하면 해당 일의 광고비가 변경됩니다.
              </p>
            </>
          )}
          {collection === "customers" && (
            <>
              <Field
                label="고객 참조번호"
                hint="이름·전화번호 대신 학원에서 구분할 수 있는 번호를 사용하세요."
              >
                {input("reference_code", "text", true)}
              </Field>
              <div className="form-pair">
                <Field label="최초 상담일">
                  {input("consulted_on", "date", true, localDate())}
                </Field>
                <Field label="신규 등록일">
                  {input("enrolled_on", "date")}
                </Field>
              </div>
              <Field label="주 유입 경로">
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <SourceOptions data={data} />
                </select>
              </Field>
              <Field label="확인 근거">
                <select
                  name="confidence"
                  defaultValue={text("confidence", "unknown")}
                >
                  <option value="unknown">미확인</option>
                  <option value="reported">고객이 답변함</option>
                  <option value="direct">직접 확인</option>
                  <option value="inferred">운영자 추정</option>
                </select>
              </Field>
              <p className="form-note">
                일일 전체 상담·등록 집계에 더하지 않습니다. 확인된 고객 기록으로
                출처와 실제 상담→등록을 분석합니다.
              </p>
            </>
          )}
          {collection === "payments" && (
            <>
              <Field label="고객 참조번호">
                <select
                  name="customer_id"
                  required
                  value={paymentCustomer}
                  onChange={(e) => setPaymentCustomer(e.target.value)}
                >
                  <option value="">고객 선택</option>
                  {data.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.reference_code}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="실제 결제 / 환불일">
                {input("paid_on", "date", true, localDate())}
              </Field>
              <Field label="수납액 (환불은 음수)">
                {input("amount", "number", true, "", { step: "0.01" })}
              </Field>
              <Field
                label="서비스 원가"
                hint="마케팅 비용을 제외한 해당 수납의 서비스 제공 원가. 미확인은 빈칸, 실제 원가가 없으면 0."
              >
                {input("service_cost", "number", false, "", { step: "0.01" })}
              </Field>
              <Field label="조정할 원결제 (환불 시 필수)">
                <select name="adjusts_id" defaultValue={text("adjusts_id")}>
                  <option value="">일반 결제</option>
                  {data.payments
                    .filter(
                      (p) =>
                        p.customer_id === paymentCustomer &&
                        p.amount > 0 &&
                        !p.deleted_at &&
                        p.id !== r.id,
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.paid_on} · {p.amount.toLocaleString()}원
                      </option>
                    ))}
                </select>
              </Field>
            </>
          )}
          {collection !== "metrics" && collection !== "values" && notes}
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          <footer>
            <button type="button" disabled={busy} onClick={onClose}>
              취소
            </button>
            <button className="primary" disabled={busy} type="submit">
              {busy ? "저장 중…" : "저장"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
