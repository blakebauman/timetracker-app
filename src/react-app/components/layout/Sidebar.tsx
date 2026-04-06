import { NavLink, useNavigate } from "react-router-dom";
import { Timer, FolderOpen, Users, BarChart2, Settings, Clock, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTimerStore } from "@/stores/timerStore";
import { formatSeconds } from "@/lib/dateUtils";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/uiStore";

const navItems = [
  { to: "/", icon: Timer, label: "Timer" },
  { to: "/projects", icon: FolderOpen, label: "Projects" },
  { to: "/clients", icon: Users, label: "Clients" },
  { to: "/reports", icon: BarChart2, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const { runningEntry, elapsed } = useTimerStore();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r bg-card transition-all duration-200",
        sidebarCollapsed ? "w-14" : "w-56"
      )}
    >
      {/* Brand */}
      <div className="relative flex h-14 items-center border-b px-4">
        <Clock className="h-5 w-5 shrink-0 text-primary" />
        {!sidebarCollapsed && (
          <span className="ml-2 font-semibold tracking-tight">Time Tracker</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-6 w-6 shrink-0 text-muted-foreground",
            sidebarCollapsed ? "ml-auto" : "absolute right-2"
          )}
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Running timer indicator */}
      {runningEntry && (
        <div className="mx-3 mt-3 rounded-md bg-primary/10 px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary animate-pulse" />
            <span className="font-mono font-medium text-primary">
              {formatSeconds(elapsed)}
            </span>
          </div>
          {!sidebarCollapsed && (
            <p className="mt-0.5 truncate text-muted-foreground">
              {runningEntry.description || "No description"}
            </p>
          )}
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
                "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                sidebarCollapsed ? "justify-center gap-0" : "gap-3",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )
            }
            title={sidebarCollapsed ? label : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* Footer — user info + sign out */}
      <div className="border-t p-3">
        {user && (
          <div
            className={cn(
              "mb-2 flex items-center rounded-md px-1 py-1",
              sidebarCollapsed ? "justify-center" : "justify-between gap-2"
            )}
          >
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{user.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={handleSignOut}
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {!sidebarCollapsed && (
          <div className="text-[10px] text-muted-foreground">
            <p>Alt+Shift+S — Start/Stop</p>
            <p>Alt+Shift+X — Discard</p>
          </div>
        )}
      </div>
    </aside>
  );
}
