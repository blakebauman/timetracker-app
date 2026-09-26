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

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * A rail button: a 48px circle. The active one lifts a step off the chassis
 * and carries a brand-red ring that fades downward (`tt-rail-ring`) — the
 * rail's signature, in the brand's colour. Everything else on the rail
 * is muted ink that brightens on hover.
 *
 * The lift is in the transition list alongside the colours, and the ring is
 * always mounted and crossfaded, so switching routes moves both together at
 * the fast duration instead of popping the ring and easing the fill.
 */
const RAIL_BUTTON = `relative flex size-12 items-center justify-center rounded-full transition-[color,background-color,box-shadow] duration-fast ease-out-quart ${FOCUS_RING}`;
const RAIL_ACTIVE = "bg-foreground/6 text-foreground shadow-lg";
const RAIL_IDLE = "text-muted-foreground hover:bg-foreground/6 hover:text-foreground";

/** The sheet nav's rows: the rail's buttons, unrolled into labelled pills. */
const SHEET_ROW = `flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium tt-touch relative transition-colors duration-fast ease-out-quart ${FOCUS_RING}`;
const SHEET_ROW_ACTIVE = "bg-foreground/6 text-foreground";
const SHEET_ROW_IDLE = "text-muted-foreground hover:bg-foreground/6 hover:text-foreground";

function RailRing({ shown }: { shown: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "tt-rail-ring pointer-events-none absolute inset-0 rounded-full border border-primary/60 transition-opacity duration-fast ease-out-quart",
        shown ? "opacity-100" : "opacity-0"
      )}
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

/** True while a timer is running — the cue the Timer nav item carries. */
function useTimerRunning() {
  return useTimerStore((s) => Boolean(s.runningEntry));
}

/**
 * The quiet running cue: a breathing red dot. It is decoration for the eye
 * only — the state reaches a screen reader through the item's own name, since
 * an `aria-label` would swallow any text nested inside the link.
 */
function RunningDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("absolute size-2 rounded-full bg-primary animate-running-dot", className)}
    />
  );
}

/** The Assistant's unread nudges, on the rail button and the phone strip. */
function NudgeBadge({ count, className }: { count: number; className?: string }) {
  if (count < 1) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-micro font-medium leading-none text-primary-foreground",
        className
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/**
 * The toggle's name stays "Assistant" whether the panel is open or shut —
 * `aria-pressed` already says which, and a button that reads "Open Assistant"
 * while the Assistant is open contradicts it.
 */
function assistantLabel(count: number) {
  return count > 0 ? `Assistant — ${count} ${count === 1 ? "nudge" : "nudges"}` : "Assistant";
}

/** A name to greet by, and the email only when it isn't already the name. */
function useIdentity() {
  const { user } = useAuth();
  if (!user) return null;
  const name = user.name?.trim();
  return { name: name || user.email, secondary: name ? user.email : null };
}

/** Icon rail for md and up. */
function Rail() {
  const items = useNavItems();
  const isActive = useIsActive();
  const { user, signOut } = useAuth();
  const identity = useIdentity();
  const navigate = useNavigate();
  const running = useTimerRunning();
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
        className={`mb-5 flex size-12 items-center justify-center rounded-full ${FOCUS_RING}`}
      >
        <BrandMark className="tt-brand-glow size-9" />
      </NavLink>

      <nav aria-label="Main" className="flex flex-col items-center gap-2">
        {items.map(({ to, icon: Icon, label }) => {
          // "Timer — running" rather than a silent dot: the rail is the only
          // place the running state shows once the route has moved on.
          const timerRunning = to === "/" && running;
          const name = timerRunning ? `${label} — running` : label;
          return (
            <Tooltip key={to}>
              <TooltipTrigger asChild>
                <NavLink
                  to={to}
                  end={to === "/"}
                  aria-label={name}
                  className={cn(RAIL_BUTTON, isActive(to) ? RAIL_ACTIVE : RAIL_IDLE)}
                >
                  <RailRing shown={isActive(to)} />
                  <Icon className="relative size-5" />
                  {timerRunning && <RunningDot className="top-2.5 right-2.5" />}
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right">{name}</TooltipContent>
            </Tooltip>
          );
        })}
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
              aria-label={assistantLabel(nudges.length)}
              className={cn(RAIL_BUTTON, assistantOpen ? RAIL_ACTIVE : RAIL_IDLE)}
            >
              <RailRing shown={assistantOpen} />
              <Sparkles className="relative size-5" />
              <NudgeBadge count={nudges.length} className="top-1.5 right-1.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Assistant
            <Kbd className="ml-1.5">{modKey}I</Kbd>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={openCommand}
              aria-label="Search and commands"
              className={cn(RAIL_BUTTON, RAIL_IDLE)}
            >
              <Search className="size-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Search and commands
            <Kbd className="ml-1.5">{modKey}K</Kbd>
          </TooltipContent>
        </Tooltip>

        {user && identity && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Account menu — ${identity.name}`}
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
                <span className="truncate">{identity.name}</span>
                {identity.secondary && (
                  <span
                    title={identity.secondary}
                    className="truncate text-xs font-normal text-muted-foreground"
                  >
                    {identity.secondary}
                  </span>
                )}
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

/**
 * The labelled nav list inside the phone sheet — the rail, unrolled. It wears
 * the rail's own signature on the active row (the fading red ring) because on
 * a phone it is the only thing that says which route you are on.
 */
function SheetNav({ onNavigate }: { onNavigate: () => void }) {
  const items = useNavItems();
  const isActive = useIsActive();
  const { user, signOut } = useAuth();
  const identity = useIdentity();
  const navigate = useNavigate();
  const running = useTimerRunning();
  const openCommand = useUIStore((s) => s.openCommand);
  const openShortcuts = useUIStore((s) => s.openShortcuts);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="flex h-full flex-col">
      <nav aria-label="Main" className="flex-1 space-y-1 p-3">
        {items.map(({ to, icon: Icon, label }) => {
          const timerRunning = to === "/" && running;
          return (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={onNavigate}
              className={cn(SHEET_ROW, isActive(to) ? SHEET_ROW_ACTIVE : SHEET_ROW_IDLE)}
            >
              <RailRing shown={isActive(to)} />
              <span className="relative shrink-0">
                <Icon className="size-4" />
                {timerRunning && <RunningDot className="-top-0.5 -right-1" />}
              </span>
              <span className="relative">{label}</span>
              {timerRunning && <span className="sr-only"> — running</span>}
            </NavLink>
          );
        })}
        <button
          type="button"
          onClick={() => {
            openCommand();
            onNavigate();
          }}
          className={cn(SHEET_ROW, SHEET_ROW_IDLE)}
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 text-left">Search</span>
          {/* A shortcut chip on a device that has no modifier key is an
              instruction it can't follow; the sheet also opens in a narrow
              desktop window, where it can. */}
          <Kbd className="pointer-coarse:hidden">{modKey}K</Kbd>
        </button>
        <button
          type="button"
          onClick={() => {
            openShortcuts();
            onNavigate();
          }}
          className={cn(SHEET_ROW, SHEET_ROW_IDLE)}
        >
          <Keyboard className="size-4 shrink-0" />
          <span className="flex-1 text-left">Keyboard shortcuts</span>
          <Kbd className="pointer-coarse:hidden">?</Kbd>
        </button>
      </nav>
      {user && identity && (
        <div className="flex items-center gap-3 border-t p-4">
          <UserAvatar name={user.name} email={user.email} image={user.image} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{identity.name}</p>
            {identity.secondary && (
              <p title={identity.secondary} className="truncate text-xs text-muted-foreground">
                {identity.secondary}
              </p>
            )}
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
  const assistantOpen = useAssistantStore((s) => s.open);
  const { nudges } = useAssistantNudges();

  return (
    <>
      {/* Phone: a chassis strip across the top, with the nav in a sheet. */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b bg-rail px-3 md:hidden">
        <NavLink
          to="/"
          end
          className={`-mx-2 flex items-center gap-2 rounded-full px-2 py-1 ${FOCUS_RING}`}
        >
          <BrandMark className="tt-brand-glow size-6 shrink-0" />
          <span className="font-semibold tracking-tight">Time Tracker</span>
        </NavLink>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-lg"
            className="relative text-muted-foreground"
            onClick={toggleAssistant}
            aria-pressed={assistantOpen}
            aria-label={assistantLabel(nudges.length)}
          >
            <Sparkles className="size-5" />
            <NudgeBadge count={nudges.length} className="top-1 right-1" />
          </Button>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-lg" aria-label="Open navigation menu">
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
