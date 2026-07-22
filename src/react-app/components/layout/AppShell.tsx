import { Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { WifiOff } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Sidebar } from "./Sidebar";
import { TimerBar } from "@/components/timer/TimerBar";
import { ProductivityManager } from "@/components/timer/ProductivityManager";
import { AssistantNudgeNotifier } from "@/components/assistant/AssistantNudgeNotifier";
import { AiQuickAddDialog } from "@/components/entries/AiQuickAddDialog";
import { CommandPalette } from "./CommandPalette";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { PageFallback } from "./PageFallback";
import { Toaster } from "@/components/ui/sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useHydrateSettings } from "@/hooks/useSettings";
import { useUIStore } from "@/stores/uiStore";
import { useAssistantStore } from "@/stores/assistantStore";
import { lazyWithReload } from "@/lib/lazyWithReload";

// The Assistant's chat pulls the whole agents/AI SDK chain (~a quarter of the
// entry chunk) — split it out and mount it on first open. The nudge notifier
// stays eager: it's tiny and must toast without the panel ever opening.
const AssistantPanel = lazyWithReload(() =>
  import("@/components/assistant/AssistantPanel").then((m) => ({ default: m.AssistantPanel }))
);

export function AppShell() {
  useWebSocket();
  useHydrateSettings();
  const { isOnline } = useOfflineSync();
  const location = useLocation();
  const quickAddOpen = useUIStore((s) => s.quickAddOpen);
  const setQuickAddOpen = useUIStore((s) => s.setQuickAddOpen);
  const assistantOpen = useAssistantStore((s) => s.open);
  // Mount on first open and keep mounted after, so chat state and the sheet's
  // close animation survive re-closing. Latched during render (not in an
  // effect) so the panel mounts in the same pass that opens it.
  const [assistantMounted, setAssistantMounted] = useState(false);
  if (assistantOpen && !assistantMounted) setAssistantMounted(true);

  // Global shortcut, mirrored in the launcher tooltip, command palette, and the
  // "?" reference. Lives here (not in AssistantPanel) so it works before the
  // lazy chunk has loaded. enableOnFormTags so it works mid-typing in any field.
  useHotkeys(
    "meta+i,ctrl+i",
    () => {
      const s = useAssistantStore.getState();
      s.setOpen(!s.open);
    },
    { preventDefault: true, enableOnFormTags: true }
  );

  // Warm the assistant chunk once the shell is idle so the first ⌘I still feels
  // instant — the download happens ahead of time, parse/execute waits for mount.
  useEffect(() => {
    const warm = () => void import("@/components/assistant/AssistantPanel");
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm);
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 3000);
    return () => window.clearTimeout(id);
  }, []);
  // useTimerLifecycle() is called inside TimerBar (always mounted), which
  // registers the tick loop, IDB restore, and keyboard shortcuts globally.

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background md:flex-row">
      <div className="contents print:hidden">
        <Sidebar />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Offline banner */}
        {!isOnline && (
          <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 py-2">
            <WifiOff className="h-4 w-4" />
            <AlertDescription>
              You're offline — changes will sync when your connection is restored.
            </AlertDescription>
          </Alert>
        )}

        {/* Timer bar — always visible at the top */}
        <div className="contents print:hidden">
          <TimerBar />
        </div>

        {/* Page content */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Suspense fallback={<PageFallback />}>
            {/* Keyed by route so each page crossfades in on navigation. */}
            <div key={location.pathname} className="h-full animate-fade-in">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>

      <CommandPalette />
      <KeyboardShortcuts />
      {assistantMounted && (
        <Suspense fallback={null}>
          <AssistantPanel />
        </Suspense>
      )}
      <AssistantNudgeNotifier />
      <AiQuickAddDialog open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      <ProductivityManager />
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
