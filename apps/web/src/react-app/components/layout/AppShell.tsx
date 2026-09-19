import { Suspense, useEffect, useState, type CSSProperties } from "react";
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
import { useMediaQuery, BELOW_MD } from "@/hooks/useMediaQuery";
import { useTimerStore } from "@/stores/timerStore";
import { useAssistantStore } from "@/stores/assistantStore";
import { lazyWithReload } from "@/lib/lazyWithReload";

// The Assistant's chat pulls the whole agents/AI SDK chain (~a quarter of the
// entry chunk) — split it out and mount it on first open. The nudge notifier
// stays eager: it's tiny and must toast without the panel ever opening.
const AssistantPanel = lazyWithReload(() =>
  import("@/components/assistant/AssistantPanel").then((m) => ({ default: m.AssistantPanel }))
);

// Mounted once, here, because the toast that opens it fires from the Tasks page,
// the Timer rail and the timer's own stop handler.
const LogTaskTimeSheet = lazyWithReload(() =>
  import("@/components/tasks/LogTaskTimeSheet").then((m) => ({ default: m.LogTaskTimeSheet }))
);

/**
 * How much of the bottom edge the timer surfaces cover, so every pane pads
 * its last row clear of them. The composer floats 24px up and is ~104px
 * tall; the docked running bar is 88px flush to the edge. Both are exposed
 * as `--dock-h` on the shell, in case a page needs it for its own geometry.
 */
const DOCK_CLEARANCE = { idle: "8.5rem", running: "6.5rem" } as const;
// Desktop toasts stack up from the bottom-right, where the composer (idle) or
// the docked bar (running) already is. The offset follows the same clearance
// plus one gutter, so an Undo toast never lands under the timer surface at the
// widths where the composer reaches the right half of the pane.
const TOAST_BOTTOM_PX = { idle: 8.5 * 16 + 16, running: 6.5 * 16 + 16 } as const;

export function AppShell() {
  useWebSocket();
  useHydrateSettings();
  const { isOnline } = useOfflineSync();
  const location = useLocation();
  const quickAddOpen = useUIStore((s) => s.quickAddOpen);
  const setQuickAddOpen = useUIStore((s) => s.setQuickAddOpen);
  const logTimeTaskId = useUIStore((s) => s.logTimeTaskId);
  const assistantOpen = useAssistantStore((s) => s.open);
  const running = useTimerStore((s) => Boolean(s.runningEntry));
  // On a phone the composer spans the whole bottom edge, so a bottom toast
  // lands on it; toasts drop in from the top there instead.
  const belowMd = useMediaQuery(BELOW_MD);
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
    <div
      className="flex h-screen flex-col overflow-hidden bg-background md:flex-row"
      style={{ "--dock-h": running ? DOCK_CLEARANCE.running : DOCK_CLEARANCE.idle } as CSSProperties}
    >
      {/* Every page load costs a keyboard user a dozen tab stops through the
          rail before the composer — the one field the whole app exists around.
          Visually hidden until focused, then pinned above everything. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:z-portal focus:fixed focus:top-3 focus:left-3 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-md focus:outline-none focus:ring-[3px] focus:ring-ring/50"
      >
        Skip to content
      </a>

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

        {/* The pane. Pads its bottom by the dock's clearance so the last row of
            any route clears the composer or the running bar. Routes that own
            their scrolling (a Pane) fill it; the rest scroll here. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto transition-[padding] duration-slow ease-out-quart print:pb-0"
          style={{ paddingBottom: "var(--dock-h)" }}
        >
          <div className="mx-auto h-full w-full max-w-[1800px]">
            <Suspense fallback={<PageFallback />}>
              {/* Keyed by route so each page crossfades in on navigation. */}
              <div key={location.pathname} className="h-full animate-fade-in">
                <Outlet />
              </div>
            </Suspense>
          </div>
        </main>
      </div>

      {/* The composer (idle) or the docked running bar. Fixed to the viewport,
          above every pane and below every portal. */}
      <div className="contents print:hidden">
        <TimerBar />
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
      {logTimeTaskId && (
        <Suspense fallback={null}>
          <LogTaskTimeSheet />
        </Suspense>
      )}
      <ProductivityManager />
      <Toaster
        richColors
        position={belowMd ? "top-center" : "bottom-right"}
        // Sonner reads `mobileOffset` below 600px and `offset` above it, so
        // both are set: the phone toast must clear the 56px brand bar.
        offset={belowMd ? { top: 72 } : { bottom: running ? TOAST_BOTTOM_PX.running : TOAST_BOTTOM_PX.idle }}
        mobileOffset={{ top: 72 }}
      />
    </div>
  );
}
