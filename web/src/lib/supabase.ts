import { createBrowserClient } from "@supabase/ssr";

/** No request may wait forever: a stalled one (e.g. after the laptop slept) fails instead. */
export const REQUEST_TIMEOUT_MS = 30_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
  baseFetch: typeof fetch = globalThis.fetch.bind(globalThis),
) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("서버 응답이 없습니다. 다시 시도하세요.", "TimeoutError")),
    timeoutMs,
  );
  const outer = init.signal;
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener("abort", () => controller.abort(outer.reason), { once: true });
  }
  return baseFetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { global: { fetch: (input, init) => fetchWithTimeout(input, init) } },
);
