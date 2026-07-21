import { useHotkeys } from "react-hotkeys-hook";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUIStore } from "@/stores/uiStore";
import { modKey as mod } from "@/lib/platform";

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
];

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k, i) => (
        <span key={k} className="flex items-center gap-1">
          {i > 0 && <span className="text-[10px] text-muted-foreground">+</span>}
          <kbd className="inline-flex h-6 min-w-6 select-none items-center justify-center rounded border bg-muted px-1.5 font-mono text-[11px] font-medium text-foreground">
            {k}
          </kbd>
        </span>
      ))}
    </span>
  );
}

export function KeyboardShortcuts() {
  const open = useUIStore((s) => s.shortcutsOpen);
  const setOpen = useUIStore((s) => s.setShortcutsOpen);

  // "?" (Shift+/) toggles the reference from anywhere in the app.
  useHotkeys(
    "shift+/",
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
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
