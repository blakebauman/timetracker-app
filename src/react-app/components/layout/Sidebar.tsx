import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Timer, FolderOpen, ListChecks, Users, BarChart2, Settings, Clock, LogOut, ChevronLeft, Menu, ShieldCheck, Search, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTimerStore } from "@/stores/timerStore";
import { formatSeconds } from "@/lib/dateUtils";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useUIStore } from "@/stores/uiStore";

const navItems = [
  { to: "/", icon: Timer, label: "Timer" },
  { to: "/projects", icon: FolderOpen, label: "Projects" },
  { to: "/tasks", icon: ListChecks, label: "Tasks" },
  { to: "/clients", icon: Users, label: "Clients" },
  { to: "/reports", icon: BarChart2, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

interface SidebarContentProps {
  collapsed: boolean;
  onNavigate?: () => void;
}

function SidebarContent({ collapsed, onNavigate }: SidebarContentProps) {
  const { runningEntry, elapsed } = useTimerStore();
  const { user, signOut } = useAuth();
  const openCommand = useUIStore((s) => s.openCommand);
  const openShortcuts = useUIStore((s) => s.openShortcuts);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const handleOpenCommand = () => {
    openCommand();
    onNavigate?.();
  };

  const handleOpenShortcuts = () => {
    openShortcuts();
    onNavigate?.();
  };

  const items =
    user?.role === "admin"
      ? [...navItems, { to: "/admin", icon: ShieldCheck, label: "Admin" }]
      : navItems;

  return (
    <>
      {/* Command palette trigger — reminds users of the ⌘K shortcut */}
      <div className="px-2 pt-3">
        <button
          type="button"
          onClick={handleOpenCommand}
          aria-label="Open command palette (Command or Control K)"
          title="Search and commands — ⌘K"
          className={cn(
            "flex w-full items-center rounded-md border bg-background text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            collapsed ? "justify-center p-2" : "gap-2 px-2.5 py-1.5"
          )}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search…</span>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Running timer indicator. When collapsed the pill is too narrow for the
          full HH:MM:SS, so we show just a pulsing dot (time on hover) instead of
          letting the timer text overflow the rail. */}
      {runningEntry && (
        <div
          className={cn(
            "mt-3 rounded-md bg-primary/10 text-xs",
            collapsed ? "mx-2 flex justify-center p-2.5" : "mx-3 px-3 py-2"
          )}
        >
          {collapsed ? (
            <span
              className="h-2 w-2 rounded-full bg-primary animate-pulse"
              title={`Running — ${formatSeconds(elapsed)}`}
              aria-label={`Timer running — ${formatSeconds(elapsed)}`}
            />
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary animate-pulse" />
                <span className="font-mono font-medium text-primary">
                  {formatSeconds(elapsed)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-muted-foreground">
                {runningEntry.description || "No description"}
              </p>
            </>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 p-2 pt-3">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            aria-label={label}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                collapsed ? "justify-center gap-0" : "gap-3",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* Footer — user info + sign out */}
      <div className="border-t p-3">
        {user && (
          <div
            className={cn(
              "mb-2 flex items-center rounded-md px-1 py-1",
              collapsed ? "justify-center" : "justify-between gap-2"
            )}
          >
            {!collapsed && (
              <div className="flex min-w-0 items-center gap-2">
                <UserAvatar name={user.name} email={user.email} image={user.image} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{user.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
                </div>
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
        {/* Keyboard shortcut reference — opens the full cheat sheet (also “?”) */}
        <button
          type="button"
          onClick={handleOpenShortcuts}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts — ?"
          className={cn(
            "flex w-full items-center rounded-md text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            collapsed ? "justify-center p-2" : "gap-2 px-2 py-1.5"
          )}
        >
          <Keyboard className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Keyboard shortcuts</span>
              <kbd className="pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center rounded border bg-muted px-1 font-mono text-[10px] font-medium">
                ?
              </kbd>
            </>
          )}
        </button>
      </div>
    </>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar — replaces the sidebar below md */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-3 md:hidden">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 shrink-0 text-primary" />
          <span className="font-semibold tracking-tight">Time Tracker</span>
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open navigation menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 gap-0 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-14 items-center border-b px-4">
              <Clock className="h-5 w-5 shrink-0 text-primary" />
              <span className="ml-2 font-semibold tracking-tight">Time Tracker</span>
            </div>
            <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden h-full flex-col overflow-hidden border-r bg-card transition-all duration-200 md:flex",
          sidebarCollapsed ? "w-14" : "w-56"
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            "relative flex h-14 overflow-hidden border-b",
            sidebarCollapsed ? "justify-center px-0" : "items-center px-4"
          )}
        >
          {sidebarCollapsed ? (
            // Collapsed: the logo itself is the expand affordance (no arrow).
            <button
              type="button"
              onClick={toggleSidebar}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="flex h-full w-full items-center justify-center text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <Clock className="h-5 w-5 shrink-0" />
            </button>
          ) : (
            <>
              <Clock className="h-5 w-5 shrink-0 text-primary" />
              {/* nowrap + clipped so the label doesn't wrap to two lines while the
                  rail width animates open (was a "Time / Tracker" flash). */}
              <span className="ml-2 whitespace-nowrap font-semibold tracking-tight">
                Time Tracker
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 h-8 w-8 shrink-0 text-muted-foreground"
                onClick={toggleSidebar}
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>

        <SidebarContent collapsed={sidebarCollapsed} />
      </aside>
    </>
  );
}
