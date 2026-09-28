import { useHotkeys } from "react-hotkeys-hook";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUIStore } from "@/stores/uiStore";
import { modKey as mod } from "@/lib/platform";
import { Kbd } from "@/components/ui/kbd";

interface Shortcut {
  keys: string[];
  label: string;
}

interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: "General",
    items: [
      { keys: [mod, "K"], label: "Open command palette (search & quick actions)" },
      { keys: [mod, "I"], label: "Open the Assistant" },
      { keys: ["?"], label: "Show this keyboard shortcut reference" },
    ],
  },
  {
    title: "Timer",
    items: [
      { keys: ["Alt", "Shift", "S"], label: "Start or stop the timer" },
      { keys: ["Alt", "Shift", "X"], label: "Discard the running timer" },
    ],
  },
  {
    title: "Tasks",
    items: [
      { keys: ["Alt", "Shift", "T"], label: "Add a task (from anywhere)" },
      { keys: ["J"], label: "Next task (then ↓ works too)" },
      { keys: ["K"], label: "Previous task (then ↑ works too)" },
      { keys: ["X"], label: "Complete or reopen the task" },
      { keys: ["E"], label: "Edit the task" },
      { keys: ["1"], label: "Priority 1–4 (keys 1 to 4)" },
      { keys: ["S"], label: "Start or stop a timer on the task" },
      { keys: ["Del"], label: "Delete the task (with undo)" },
      { keys: ["Q"], label: "Jump to the add-task line" },
    ],
  },
];

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k, i) => (
        <span key={k} className="flex items-center gap-1">
          {i > 0 && <span className="text-micro text-muted-foreground">+</span>}
          <Kbd className="h-6 min-w-6">
            {k}
          </Kbd>
        </span>
      ))}
    </span>
  );
}

export function KeyboardShortcuts() {
  const open = useUIStore((s) => s.shortcutsOpen);
  const setOpen = useUIStore((s) => s.setShortcutsOpen);
  const navigate = useNavigate();

  // Capture from anywhere: the Tasks page reads the stamp and focuses its
  // capture line. A stamp, not a flag, so pressing it again while already
  // there still re-focuses.
  useHotkeys(
    "alt+shift+t",
    () => navigate("/tasks", { state: { capture: Date.now() } }),
    { preventDefault: true, enableOnFormTags: ["INPUT", "TEXTAREA"] },
    [navigate]
  );

  // "?" (Shift+/) toggles the reference from anywhere in the app. Spelled
  // `slash`: react-hotkeys-hook v5 matches the physical key code ("Slash"),
  // so "shift+/" never matched and "?" had been dead since the v5 upgrade.
  useHotkeys(
    "shift+slash",
    () => {
      const s = useUIStore.getState();
      s.setShortcutsOpen(!s.shortcutsOpen);
    },
    { preventDefault: true }
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Work faster without leaving the keyboard.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((s) => (
                  <li key={s.label} className="flex items-center justify-between gap-4">
                    <span className="text-sm">{s.label}</span>
                    <Keys keys={s.keys} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
