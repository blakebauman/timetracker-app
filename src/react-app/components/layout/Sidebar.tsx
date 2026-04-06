import { NavLink } from "react-router-dom";
import { Timer, FolderOpen, Users, BarChart2, Settings, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTimerStore } from "@/stores/timerStore";
import { formatSeconds } from "@/lib/dateUtils";

const navItems = [
  { to: "/", icon: Timer, label: "Timer" },
  { to: "/projects", icon: FolderOpen, label: "Projects" },
  { to: "/clients", icon: Users, label: "Clients" },
  { to: "/reports", icon: BarChart2, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const { runningEntry, elapsed } = useTimerStore();

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-card">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <Clock className="h-5 w-5 text-primary" />
        <span className="font-semibold tracking-tight">Time Tracker</span>
      </div>

      {/* Running timer indicator */}
      {runningEntry && (
        <div className="mx-3 mt-3 rounded-md bg-primary/10 px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="font-mono font-medium text-primary">
              {formatSeconds(elapsed)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-muted-foreground">
            {runningEntry.description || "No description"}
          </p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-2 pt-3">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )
            }
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t p-3 text-xs text-muted-foreground">
        <p>Alt+Shift+S — Start/Stop</p>
        <p>Alt+Shift+X — Discard</p>
      </div>
    </aside>
  );
}
