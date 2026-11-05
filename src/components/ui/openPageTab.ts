/** The window event a page's `PageTabs` listens for to open one of its tabs. */
export const OPEN_PAGE_TAB_EVENT = "app:open-page-tab";

/**
 * Opens a tab of the page's `PageTabs` from elsewhere on the page (a stat
 * card in the record header, A28): in the browser, with no server round trip,
 * so the kept tabs and their tables stay as they are.
 */
export function openPageTab(value: string): void {
  window.dispatchEvent(new CustomEvent<string>(OPEN_PAGE_TAB_EVENT, { detail: value }));
}
