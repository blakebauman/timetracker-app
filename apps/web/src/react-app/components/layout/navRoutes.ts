import {
  Timer,
  FolderOpen,
  ListChecks,
  Users,
  BarChart2,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavRoute {
  to: string;
  icon: LucideIcon;
  label: string;
  /** The second key of its `G` sequence, when it has one. */
  key?: string;
}

/**
 * The work routes: the rail's top group, the sheet's first block, and the
 * command palette's Navigate group, in that order everywhere. Five, so the
 * group stays within what an eye takes in without counting.
 *
 * Each has a `G`-then-letter sequence. Tasks is `G A`, not `G K`: `K` is
 * "previous task" on the Tasks page and would fire too.
 */
export const WORK_ROUTES: NavRoute[] = [
  { to: "/", icon: Timer, label: "Timer", key: "t" },
  { to: "/tasks", icon: ListChecks, label: "Tasks", key: "a" },
  { to: "/projects", icon: FolderOpen, label: "Projects", key: "p" },
  { to: "/clients", icon: Users, label: "Clients", key: "c" },
  { to: "/reports", icon: BarChart2, label: "Reports", key: "r" },
];

/**
 * Settings (and Admin, for site admins) are destinations you visit, not
 * places you work: they sit at the rail's foot with the account, apart from
 * the work routes. No sequence for Settings — `S` starts a timer on the
 * focused task.
 */
export const SETTINGS_ROUTE: NavRoute = { to: "/settings", icon: Settings, label: "Settings" };
export const ADMIN_ROUTE: NavRoute = { to: "/admin", icon: ShieldCheck, label: "Admin" };

/** `g>t` — react-hotkeys-hook's sequence syntax. */
export function routeHotkey(route: NavRoute) {
  return route.key ? `g>${route.key}` : null;
}
