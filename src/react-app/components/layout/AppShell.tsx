import { Outlet } from "react-router-dom";
import { WifiOff } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { TimerBar } from "@/components/timer/TimerBar";
import { CommandPalette } from "./CommandPalette";
import { Toaster } from "@/components/ui/sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useOfflineSync } from "@/hooks/useOfflineSync";

export function AppShell() {
  useWebSocket();
  const { isOnline } = useOfflineSync();
  // useTimer() is called inside TimerBar (always mounted), which registers
  // the tick loop, IDB restore, and keyboard shortcuts globally.

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background md:flex-row">
      <Sidebar />

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
        <TimerBar />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
