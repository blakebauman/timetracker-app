import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Timer, FolderOpen, ListChecks, Users, BarChart2, Settings, LogOut, ChevronLeft, Menu, ShieldCheck, Search, Keyboard } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { cn } from "@/lib/utils";
import { useTimerStore } from "@/stores/timerStore";
import { formatSeconds } from "@/lib/dateUtils";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUIStore } from "@/stores/uiStore";
import { Kbd } from "@/components/ui/kbd";

const navItems = [
  { to: "/", icon: Timer, label: "Timer" },
  { to: "/tasks", icon: ListChecks, label: "Tasks" },
  { to: "/projects", icon: FolderOpen, label: "Projects" },
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
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleOpenCommand}
              aria-label="Open command palette (Command or Control K)"
              className={cn(
                "flex w-full items-center rounded-md border bg-background text-sm text-muted-foreground transition-colors duration-fast ease-out-quart hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                collapsed ? "justify-center p-2" : "gap-2 px-2.5 py-1.5"
              )}
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Search…</span>
                  {/* text-foreground, not muted: 10px muted-on-muted measured
                      4.38:1. A keycap is a label, not secondary text. */}
                  <Kbd>⌘K</Kbd>
                </>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Search and commands
            <span className="ml-1.5 text-background/60">⌘K</span>
          </TooltipContent>
        </Tooltip>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="h-2 w-2 rounded-full bg-primary animate-running-dot"
                  aria-label={`Timer running — ${formatSeconds(elapsed)}`}
                />
              </TooltipTrigger>
              <TooltipContent side="right">Running — {formatSeconds(elapsed)}</TooltipContent>
            </Tooltip>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary animate-running-dot" />
                <span className="font-mono font-medium text-primary-ink">
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
      <nav aria-label="Main" className="flex-1 space-y-0.5 p-2 pt-3">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            aria-label={label}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors duration-fast ease-out-quart focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                collapsed ? "justify-center gap-0" : "gap-3",
                isActive
                  ? "bg-primary/10 text-primary-ink"
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
                  <p title={user.email} className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={handleSignOut}
                  aria-label="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign out</TooltipContent>
            </Tooltip>
          </div>
        )}
        {/* Keyboard shortcut reference — opens the full cheat sheet (also “?”) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleOpenShortcuts}
              aria-label="Keyboard shortcuts"
              className={cn(
                "flex w-full items-center rounded-md text-xs text-muted-foreground transition-colors duration-fast ease-out-quart hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                collapsed ? "justify-center p-2" : "gap-2 px-2 py-1.5"
              )}
            >
              <Keyboard className="h-3.5 w-3.5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Keyboard shortcuts</span>
                  <Kbd>?</Kbd>
                </>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Keyboard shortcuts
            <span className="ml-1.5 text-background/60">?</span>
          </TooltipContent>
        </Tooltip>
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
      <div className="flex h-14 shrink-0 items-center justify-between bg-card px-3 md:hidden">
        <div className="flex items-center gap-2">
          <BrandMark className="h-5 w-5 shrink-0" />
          <span className="font-semibold tracking-tight">Time Tracker</span>
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon-lg" className="tt-touch" aria-label="Open navigation menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
            </TooltipTrigger>
            <TooltipContent>Open navigation menu</TooltipContent>
          </Tooltip>
          <SheetContent side="left" className="w-64 gap-0 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-14 items-center border-b px-4">
              <BrandMark className="h-5 w-5 shrink-0" />
              <span className="ml-2 font-semibold tracking-tight">Time Tracker</span>
            </div>
            <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop sidebar */}
      <aside
        aria-label="Sidebar"
        className={cn(
          "hidden h-full flex-col overflow-hidden bg-card transition-all duration-base ease-out-quart md:flex",
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
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-label="Expand sidebar"
                  className="flex h-full w-full items-center justify-center transition-colors duration-fast ease-out-quart hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
                >
                  <BrandMark className="h-5 w-5 shrink-0" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          ) : (
            <>
              <BrandMark className="h-5 w-5 shrink-0" />
              {/* nowrap + clipped so the label doesn't wrap to two lines while the
                  rail width animates open (was a "Time / Tracker" flash). */}
              <span className="ml-2 whitespace-nowrap font-semibold tracking-tight">
                Time Tracker
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-2 shrink-0 text-muted-foreground"
                    onClick={toggleSidebar}
                    aria-label="Collapse sidebar"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Collapse sidebar</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        <SidebarContent collapsed={sidebarCollapsed} />
      </aside>
    </>
  );
}
