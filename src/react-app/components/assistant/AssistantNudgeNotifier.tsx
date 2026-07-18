import { useEffect } from "react";
import { toast } from "sonner";
import { useAssistantStore } from "@/stores/assistantStore";
import { useAssistantNudges } from "@/hooks/useAssistant";
import { notify } from "@/lib/notify";

// How many nudges may toast in one poll cycle — a backlog (first login of the
// day) shouldn't produce a wall of toasts; the badge carries the full count.
const MAX_TOASTS_PER_BATCH = 3;

/**
 * Headless: turns newly appearing nudges into a toast (and a browser
 * notification when the tab is hidden). Each nudge alerts at most once per
 * browser — `seen` is persisted — and never while the panel is already open.
 * Mounted once in AppShell.
 */
export function AssistantNudgeNotifier() {
  const { nudges } = useAssistantNudges();
  const alertsEnabled = useAssistantStore((s) => s.alertsEnabled);
  const open = useAssistantStore((s) => s.open);
  const seen = useAssistantStore((s) => s.seen);
  const dismissed = useAssistantStore((s) => s.dismissed);
  const markSeen = useAssistantStore((s) => s.markSeen);
  const setOpen = useAssistantStore((s) => s.setOpen);

  // Relay dismissals to the browser extension (content script → service
  // worker) so its badge count excludes nudges dismissed in the app — the
  // extension polls the server, which knows nothing about dismissals.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("timetracker:assistant", {
        detail: { dismissed: Object.keys(dismissed) },
      })
    );
  }, [dismissed]);

  useEffect(() => {
    if (!alertsEnabled || open) return;
    const fresh = nudges.filter((n) => !(n.id in seen));
    if (!fresh.length) return;

    for (const n of fresh.slice(0, MAX_TOASTS_PER_BATCH)) {
      // Keyed by nudge id so a re-render can't duplicate a live toast. Longer
      // than the default duration — these are actionable, not just FYIs.
      toast(n.title, {
        id: n.id,
        description: n.body,
        duration: 12_000,
        action: { label: "Open Aski", onClick: () => setOpen(true) },
      });
      // The toast is invisible when the tab is backgrounded — that's exactly
      // when the OS-level notification earns its keep. No-op unless granted.
      if (document.hidden) notify(n.title, n.body);
    }
    // Mark the whole batch (even beyond the toast cap) so a backlog doesn't
    // drip-feed three more toasts on every later poll.
    markSeen(fresh.map((n) => n.id));
  }, [nudges, alertsEnabled, open, seen, markSeen, setOpen]);

  return null;
}
