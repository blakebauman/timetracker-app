import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { WifiOff } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { TimerBar } from "@/components/timer/TimerBar";
import { ProductivityManager } from "@/components/timer/ProductivityManager";
import { CommandPalette } from "./CommandPalette";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { PageFallback } from "./PageFallback";
import { Toaster } from "@/components/ui/sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useHydrateSettings } from "@/hooks/useSettings";

export function AppShell() {
  useWebSocket();
  useHydrateSettings();
  const { isOnline } = useOfflineSync();
  const location = useLocation();
  // useTimerLifecycle() is called inside TimerBar (always mounted), which
  // registers the tick loop, IDB restore, and keyboard shortcuts globally.

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background md:flex-row">
      <div className="contents print:hidden">
        <Sidebar />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
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
        <main className="flex-1 overflow-y-auto">
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
      <ProductivityManager />
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
