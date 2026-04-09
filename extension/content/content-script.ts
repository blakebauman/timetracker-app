// Content script — detects page context from supported apps
// and sends it to the background service worker

// ─── Real-time timer sync from the web app ────────────────────────────────────
// The web app fires "timetracker:sync" CustomEvents on the window whenever the
// timer starts or stops (received via WebSocket). We relay them instantly to the
// service worker so the badge updates without waiting for a poll cycle.
window.addEventListener("timetracker:sync", (e: Event) => {
  const { detail } = e as CustomEvent;
  // sendMessage wakes the service worker if it's sleeping; ignore errors
  // (e.g. extension reloading mid-session) to avoid uncaught promise rejections.
  chrome.runtime.sendMessage({ type: "TIMER_STATE_CHANGED", state: detail }).catch(() => {});
});

function detectContext(): string | null {
  const url = window.location.href;

  // GitHub — issue or PR
  const ghIssue = url.match(
    /github\.com\/[^/]+\/[^/]+\/(issues|pull)\/(\d+)/
  );
  if (ghIssue) {
    const title =
      document.querySelector(
        "[data-testid='issue-title'], .gh-header-title .js-issue-title"
      )?.textContent?.trim() ??
      document.querySelector("h1")?.textContent?.trim();
    if (title) return `#${ghIssue[2]}: ${title.slice(0, 100)}`;
  }

  // Jira — ticket view
  const jiraTicket = url.match(/atlassian\.net\/browse\/([A-Z]+-\d+)/);
  if (jiraTicket) {
    const title = document
      .querySelector(
        "[data-testid='issue.views.issue-base.foundation.summary.heading'] h1"
      )
      ?.textContent?.trim();
    if (title) return `${jiraTicket[1]}: ${title.slice(0, 100)}`;
  }

  // Linear — issue view
  const linearIssue = url.match(/linear\.app\/[^/]+\/issue\/([A-Z]+-\d+)/);
  if (linearIssue) {
    const title = document
      .querySelector("h1")
      ?.textContent?.trim();
    if (title) return `${linearIssue[1]}: ${title.slice(0, 100)}`;
  }

  return null;
}

const context = detectContext();
if (context) {
  chrome.runtime.sendMessage({ type: "PAGE_CONTEXT", context });
}
