import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Timer,
  FolderOpen,
  ListChecks,
  Users,
  BarChart2,
  Settings,
  LogOut,
  Menu,
  ShieldCheck,
  Search,
  Keyboard,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { cn } from "@/lib/utils";
import { useTimerStore } from "@/stores/timerStore";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/stores/uiStore";
import { useAssistantStore } from "@/stores/assistantStore";
import { useAssistantNudges } from "@/hooks/useAssistant";
import { modKey } from "@/lib/platform";
import { Kbd } from "@/components/ui/kbd";

const navItems: { to: string; icon: LucideIcon; label: string }[] = [
  { to: "/", icon: Timer, label: "Timer" },
  { to: "/tasks", icon: ListChecks, label: "Tasks" },
  { to: "/projects", icon: FolderOpen, label: "Projects" },
  { to: "/clients", icon: Users, label: "Clients" },
  { to: "/reports", icon: BarChart2, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

/**
 * A rail button: a 48px circle. The active one lifts a step off the chassis
 * and carries a brand-red ring that fades downward (`tt-rail-ring`) — the
 * rail's signature, in the brand's colour. Everything else on the rail
 * is muted ink that brightens on hover.
 */
const RAIL_BUTTON =
  "relative flex size-12 items-center justify-center rounded-full transition-colors duration-fast ease-out-quart focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
const RAIL_ACTIVE = "bg-foreground/6 text-foreground shadow-lg";
const RAIL_IDLE = "text-muted-foreground hover:bg-foreground/6 hover:text-foreground";

function RailRing() {
  return (
    <span
      aria-hidden
      className="tt-rail-ring pointer-events-none absolute inset-0 rounded-full border border-primary/60"
    />
  );
}

function useNavItems() {
  const { user } = useAuth();
  return user?.role === "admin"
    ? [...navItems, { to: "/admin", icon: ShieldCheck, label: "Admin" }]
    : navItems;
}

/**
 * Active state computed here rather than through NavLink's function-form
 * `className`. The rail wraps each link in a Tooltip's `asChild` slot, and
 * Radix's Slot merges `className` by string-joining it — a function comes out
 * as its own source text, the link loses every class, and the active ring
 * (absolute, inset-0) positions itself against the viewport instead.
 */
function useIsActive() {
  const { pathname } = useLocation();
  return (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
}

/** The quiet running cue on the Timer icon: a breathing red dot. */
function RunningDot() {
  const running = useTimerStore((s) => Boolean(s.runningEntry));
  if (!running) return null;
  return (
    <span
      aria-hidden
      className="absolute top-2.5 right-2.5 size-2 rounded-full bg-primary animate-running-dot"
    />
  );
}

/** Icon rail for md and up. */
function Rail() {
  const items = useNavItems();
  const isActive = useIsActive();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const openCommand = useUIStore((s) => s.openCommand);
  const openShortcuts = useUIStore((s) => s.openShortcuts);
  const toggleAssistant = useAssistantStore((s) => s.toggleOpen);
  const assistantOpen = useAssistantStore((s) => s.open);
  const { nudges } = useAssistantNudges();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <aside
      aria-label="Sidebar"
      className="hidden h-full w-20 shrink-0 flex-col items-center border-r bg-rail py-5 md:flex"
    >
      {/* Brand — the one place the red is a light rather than a fill. */}
      <NavLink
        to="/"
        aria-label="Time Tracker home"
        className="mb-5 flex size-12 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <BrandMark className="tt-brand-glow size-9" />
      </NavLink>

      <nav aria-label="Main" className="flex flex-col items-center gap-2">
        {items.map(({ to, icon: Icon, label }) => (
          <Tooltip key={to}>
            <TooltipTrigger asChild>
              <NavLink
                to={to}
                end={to === "/"}
                aria-label={label}
                className={cn(RAIL_BUTTON, isActive(to) ? RAIL_ACTIVE : RAIL_IDLE)}
              >
                {isActive(to) && <RailRing />}
                <Icon className="relative size-5" />
                {to === "/" && <RunningDot />}
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2">
        {/* The Assistant. Its nudge count is a live indicator, which is what the
            brand red is reserved for. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleAssistant}
              aria-pressed={assistantOpen}
              aria-label={
                nudges.length > 0
                  ? `Open Assistant — ${nudges.length} ${nudges.length === 1 ? "nudge" : "nudges"}`
                  : "Open Assistant"
              }
              className={cn(RAIL_BUTTON, assistantOpen ? RAIL_ACTIVE : RAIL_IDLE)}
            >
              {assistantOpen && <RailRing />}
              <Sparkles className="relative size-5" />
              {nudges.length > 0 && (
                <span
                  aria-hidden
                  className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-micro font-medium leading-none text-primary-foreground"
                >
                  {nudges.length > 9 ? "9+" : nudges.length}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Assistant
            <span className="ml-1.5 text-background/60">{modKey}I</span>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={openCommand}
              aria-label="Open command palette (Command or Control K)"
              className={cn(RAIL_BUTTON, RAIL_IDLE)}
            >
              <Search className="size-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Search and commands
            <span className="ml-1.5 text-background/60">{modKey}K</span>
          </TooltipContent>
        </Tooltip>

        {user && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Account menu — ${user.name || user.email}`}
                    className={cn(RAIL_BUTTON, RAIL_IDLE, "mt-1")}
                  >
                    <UserAvatar
                      name={user.name}
                      email={user.email}
                      image={user.image}
                      className="size-9 border border-border bg-muted text-foreground"
                    />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">Account</TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="right" align="end" className="w-60">
              <DropdownMenuLabel className="flex flex-col">
                <span className="truncate">{user.name}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {user.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={openShortcuts}>
                <Keyboard />
                Keyboard shortcuts
                <DropdownMenuShortcut>
                  <Kbd>?</Kbd>
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate("/settings?tab=account")}>
                <Settings />
                Account settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={handleSignOut}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </aside>
  );
}

/** The labelled nav list inside the phone sheet. */
function SheetNav({ onNavigate }: { onNavigate: () => void }) {
  const items = useNavItems();
  const isActive = useIsActive();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const openCommand = useUIStore((s) => s.openCommand);
  const openShortcuts = useUIStore((s) => s.openShortcuts);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="flex h-full flex-col">
      <nav aria-label="Main" className="flex-1 space-y-1 p-3">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            aria-label={label}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-fast ease-out-quart focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              isActive(to)
                ? "bg-foreground/6 text-foreground"
                : "text-muted-foreground hover:bg-foreground/6 hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => {
            openCommand();
            onNavigate();
          }}
          className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-fast ease-out-quart hover:bg-foreground/6 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 text-left">Search</span>
          <Kbd>{modKey}K</Kbd>
        </button>
        <button
          type="button"
          onClick={() => {
            openShortcuts();
            onNavigate();
          }}
          className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-fast ease-out-quart hover:bg-foreground/6 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Keyboard className="size-4 shrink-0" />
          <span className="flex-1 text-left">Keyboard shortcuts</span>
          <Kbd>?</Kbd>
        </button>
      </nav>
      {user && (
        <div className="flex items-center gap-3 border-t p-4">
          <UserAvatar name={user.name} email={user.email} image={user.image} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p title={user.email} className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={handleSignOut}
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleAssistant = useAssistantStore((s) => s.toggleOpen);
  const { nudges } = useAssistantNudges();

  return (
    <>
      {/* Phone: a chassis strip across the top, with the nav in a sheet. */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b bg-rail px-3 md:hidden">
        <div className="flex items-center gap-2">
          <BrandMark className="tt-brand-glow size-6 shrink-0" />
          <span className="font-semibold tracking-tight">Time Tracker</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-lg"
            className="tt-touch relative text-muted-foreground"
            onClick={toggleAssistant}
            aria-label={
              nudges.length > 0
                ? `Open Assistant — ${nudges.length} ${nudges.length === 1 ? "nudge" : "nudges"}`
                : "Open Assistant"
            }
          >
            <Sparkles className="size-5" />
            {nudges.length > 0 && (
              <span
                aria-hidden
                className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-micro font-medium leading-none text-primary-foreground"
              >
                {nudges.length > 9 ? "9+" : nudges.length}
              </span>
            )}
          </Button>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-lg" className="tt-touch" aria-label="Open navigation menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-14 items-center gap-2 border-b px-4">
                <BrandMark className="tt-brand-glow size-6 shrink-0" />
                <span className="font-semibold tracking-tight">Time Tracker</span>
              </div>
              <SheetNav onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Rail />
    </>
  );
}
