import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHotkeys } from "react-hotkeys-hook";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { modKey } from "@/lib/platform";
import { useTimer } from "@/hooks/useTimer";
import { useGroupedEntries } from "@/hooks/useEntries";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { useAssistantStore } from "@/stores/assistantStore";
import {
  Timer,
  ListChecks,
  FolderOpen,
  Users,
  BarChart2,
  Settings,
  Play,
  Square,
  Sparkles,
} from "lucide-react";
import { ColorDot } from "@/components/ColorDot";
import type { TimeEntry } from "@shared/schemas";

export function CommandPalette() {
  const open = useUIStore((s) => s.commandOpen);
  const setOpen = useUIStore((s) => s.setCommandOpen);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { startTimer, stopTimer } = useTimer();
  const { runningEntry } = useTimerStore();
  const openAssistant = useAssistantStore((s) => s.setOpen);
  const { entries } = useGroupedEntries(30);

  useHotkeys(
    "meta+k,ctrl+k",
    (e) => {
      e.preventDefault();
      const s = useUIStore.getState();
      s.setCommandOpen(!s.commandOpen);
    },
    { preventDefault: true }
  );

  const close = () => {
    setOpen(false);
    setSearch("");
  };

  const handleStartTimer = () => {
    startTimer({ description: search.trim() });
    close();
  };

  const handleContinue = (entry: TimeEntry) => {
    startTimer({ description: entry.description, projectId: entry.projectId });
    close();
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    close();
  };

  // Deduplicated recent entries by description
  const recentUnique = entries
    .filter((e) => e.description && e.stop)
    .reduce((acc: TimeEntry[], e) => {
      if (!acc.some((x) => x.description === e.description)) acc.push(e);
      return acc;
    }, [])
    .slice(0, 6);

  const filteredRecent = search
    ? recentUnique.filter((e) =>
        e.description.toLowerCase().includes(search.toLowerCase())
      )
    : recentUnique;

  const navItems = [
    { to: "/", label: "Timer", icon: Timer },
    // Same order as the sidebar. Tasks was missing here entirely — a top-level
    // page with no command-palette entry.
    { to: "/tasks", label: "Tasks", icon: ListChecks },
    { to: "/projects", label: "Projects", icon: FolderOpen },
    { to: "/clients", label: "Clients", icon: Users },
    { to: "/reports", label: "Reports", icon: BarChart2 },
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command Palette">
      <CommandInput
        placeholder="Search or start a timer…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors duration-fast ease-out-quart hover:bg-accent"
            onClick={handleStartTimer}
          >
            <Play className="h-4 w-4 text-primary" />
            <span>
              Start timer
              {search && (
                <>
                  {": "}
                  <span className="font-medium">"{search}"</span>
                </>
              )}
            </span>
          </button>
        </CommandEmpty>

        {/* Timer actions */}
        <CommandGroup heading="Timer">
          {runningEntry ? (
            <CommandItem
              onSelect={() => {
                stopTimer();
                close();
              }}
            >
              <Square className="h-4 w-4" />
              Stop current timer
              {runningEntry.description && (
                <span className="ml-2 truncate text-xs text-muted-foreground">
                  {runningEntry.description}
                </span>
              )}
            </CommandItem>
          ) : (
            <CommandItem onSelect={handleStartTimer}>
              <Play className="h-4 w-4" />
              {search ? (
                <>
                  Start: <span className="ml-1 font-medium">"{search}"</span>
                </>
              ) : (
                "Start new timer"
              )}
            </CommandItem>
          )}
          <CommandItem
            onSelect={() => {
              openAssistant(true);
              close();
            }}
          >
            <Sparkles className="h-4 w-4" />
            Ask Assistant
            <CommandShortcut>{modKey}I</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {/* Recent entries */}
        {filteredRecent.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent entries">
              {filteredRecent.map((entry) => (
                <CommandItem
                  key={entry.id}
                  value={entry.description}
                  onSelect={() => handleContinue(entry)}
                >
                  <Play className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{entry.description}</span>
                  {entry.projectName && (
                    <span className="ml-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <ColorDot color={entry.projectColor} className="h-2 w-2" />
                      {entry.projectName}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Navigation */}
        <CommandSeparator />
        <CommandGroup heading="Navigate">
          {navItems.map(({ to, label, icon: Icon }) => (
            <CommandItem key={to} onSelect={() => handleNavigate(to)}>
              <Icon className="h-4 w-4" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
