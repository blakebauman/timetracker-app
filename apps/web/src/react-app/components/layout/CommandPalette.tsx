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
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { SETTINGS_ROUTE, WORK_ROUTES } from "./navRoutes";
import { useTimer } from "@/hooks/useTimer";
import { useGroupedEntries } from "@/hooks/useEntries";
import { useAllTasks } from "@/hooks/useTasks";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { useAssistantStore } from "@/stores/assistantStore";
import {
  ListChecks,
  Play,
  Square,
  Sparkles,
} from "lucide-react";
import { ColorDot } from "@/components/ColorDot";
import type { Task, TimeEntry } from "@timetracker/core/schemas";

export function CommandPalette() {
  const open = useUIStore((s) => s.commandOpen);
  const setOpen = useUIStore((s) => s.setCommandOpen);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { startTimer, stopTimer } = useTimer();
  const { runningEntry } = useTimerStore();
  const openAssistant = useAssistantStore((s) => s.setOpen);
  const { entries } = useGroupedEntries(30);
  const { data: tasks = [] } = useAllTasks();

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

  const handleStartTask = (task: Task) => {
    startTimer({ description: task.name, projectId: task.projectId, taskId: task.id });
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

  // Open tasks matching the query by name or notes. Only while typing: an
  // unfiltered palette is for actions, and a list of every task would bury them.
  const query = search.trim().toLowerCase();
  const matchingTasks = query
    ? tasks
        .filter(
          (t) =>
            t.active &&
            (t.name.toLowerCase().includes(query) ||
              (t.description?.toLowerCase().includes(query) ?? false))
        )
        .slice(0, 6)
    : [];

  // The rail's own list, so the two can't drift (Tasks was once missing here).
  const navItems = [...WORK_ROUTES, SETTINGS_ROUTE];

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette">
      <CommandInput
        placeholder="Search or start a timer…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        {/* The Timer group's "Start: …" item below already carries the typed
            text and therefore always matches it, so this slot only shows
            while a timer is running and nothing else matches. It used to hold
            a plain button that cmdk never made arrow-selectable. */}
        <CommandEmpty>No matches.</CommandEmpty>

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
            <CommandShortcut>
              <Kbd>{modKey}I</Kbd>
            </CommandShortcut>
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

        {/* Tasks — selecting one starts a timer on it, the same primary action
            as the ▷ on its row. `value` carries the notes too, so cmdk's own
            filter keeps a notes-only match instead of hiding it. */}
        {matchingTasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tasks">
              {matchingTasks.map((task) => (
                <CommandItem
                  key={task.id}
                  value={`task ${task.name} ${task.description ?? ""} ${task.id}`}
                  onSelect={() => handleStartTask(task)}
                >
                  <ListChecks className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{task.name}</span>
                  {task.projectName && (
                    <span className="ml-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <ColorDot color={task.projectColor} className="h-2 w-2" />
                      {task.projectName}
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
          {navItems.map(({ to, label, icon: Icon, key }) => (
            <CommandItem key={to} onSelect={() => handleNavigate(to)}>
              <Icon className="h-4 w-4" />
              {label}
              {key && (
                <CommandShortcut>
                  <KbdGroup>
                    <Kbd>G</Kbd>
                    <Kbd>{key.toUpperCase()}</Kbd>
                  </KbdGroup>
                </CommandShortcut>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
