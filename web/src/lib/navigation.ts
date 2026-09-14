export const navigationTabs = [
  "대시보드",
  "콘텐츠",
  "이벤트",
  "구매",
  "분석",
  "리포트",
];
const routes = [
  "dashboard",
  "contents",
  "events",
  "purchases",
  "analysis",
  "reports",
];
export function navigationTab(hash: string) {
  return (
    navigationTabs[routes.indexOf(hash.replace(/^#/, ""))] ?? navigationTabs[0]
  );
}
export function navigateTab(
  browser: Pick<Window, "location" | "history" | "dispatchEvent">,
  tab: string,
) {
  const index = navigationTabs.indexOf(tab);
  if (index < 0 || navigationTab(browser.location.hash) === tab) return;
  const url = new URL(browser.location.href);
  url.hash = routes[index];
  browser.history.pushState(browser.history.state, "", url.href);
  browser.dispatchEvent(new Event("rohan-navigation"));
}
