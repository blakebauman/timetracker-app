import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TimerBar } from "@/components/timer/TimerBar";
import { Toaster } from "@/components/ui/sonner";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useOfflineSync } from "@/hooks/useOfflineSync";

export function AppShell() {
  useWebSocket();
  useOfflineSync();
  // useTimer() is called inside TimerBar (always mounted), which registers
  // the tick loop, IDB restore, and keyboard shortcuts globally.

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Timer bar — always visible at the top */}
        <TimerBar />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <Toaster richColors position="bottom-right" />
    </div>
  );
}
