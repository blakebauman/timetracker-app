import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TimerControl } from "./TimerControl";
import { FavoritesMenu } from "./FavoritesMenu";
import { DescriptionAutocomplete } from "./DescriptionAutocomplete";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { TaskPicker } from "@/components/entries/TaskPicker";
import { AssistantButton } from "@/components/assistant/AssistantButton";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { useTimer, useTimerLifecycle, type StartTimerInput } from "@/hooks/useTimer";
import { useProjects } from "@/hooks/useProjects";
import { useUpdateEntry } from "@/hooks/useEntries";
import { useTagColors } from "@/hooks/useProjects";
import { BillableToggle } from "./BillableToggle";
import { getDefaultBillable } from "@/lib/billable";
import { cn } from "@/lib/utils";
import type { EntrySuggestion } from "@shared/schemas";

export function TimerBar() {
  const { runningEntry } = useTimerStore();
  const { startTimer, stopTimer, discardTimer } = useTimer();
  const updateEntry = useUpdateEntry();
  // Shared with the Alt+Shift+X hotkey (registered in useTimerLifecycle) so
  // both the trash-icon button and the keyboard shortcut open the same
  // confirm dialog.
  const confirmDiscard = useUIStore((s) => s.discardConfirmOpen);
  const setConfirmDiscard = useUIStore((s) => s.setDiscardConfirmOpen);

  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  // Tags carried over from a picked suggestion (or synced from the running
  // entry). The bar has no tag *picker* — chips are removable but only ever
  // added via suggestions/favorites; full editing lives in the entry sheet.
  const [tags, setTags] = useState<string[]>([]);
  // Whether this hour is invoiceable. `billable` is the only column reports read
  // to compute revenue, and until this control existed the bar had no way to say
  // — so every timer started here was written non-billable regardless of the
  // project. Seeded from the project on selection, overridable by the user.
  const [billable, setBillable] = useState(getDefaultBillable);
  const tagColor = useTagColors();
  const { data: projects = [] } = useProjects();
  const descRef = useRef<HTMLInputElement>(null);

  const isRunning = Boolean(runningEntry);

  // Sync the editable fields from the running entry whenever it changes
  // (restored from IndexedDB, or started/stopped in another tab). Adjusting
  // during render avoids a frame of stale fields. The task is cleared on user
  // project changes by the ProjectPicker handler below, so restoring the
  // entry's own task here is safe and correct.
  const [syncedEntryId, setSyncedEntryId] = useState<string | null>(
    runningEntry?.id ?? null
  );
  const [syncedProjectId, setSyncedProjectId] = useState<string | null>(
    runningEntry?.projectId ?? null
  );
  const [syncedTaskId, setSyncedTaskId] = useState<string | null>(
    runningEntry?.taskId ?? null
  );
  const tagsKey = (runningEntry?.tags ?? []).join("\0");
  const [syncedTagsKey, setSyncedTagsKey] = useState(tagsKey);
  const [syncedBillable, setSyncedBillable] = useState(
    runningEntry?.billable ?? false
  );
  if (syncedEntryId !== (runningEntry?.id ?? null)) {
    setSyncedEntryId(runningEntry?.id ?? null);
    setSyncedProjectId(runningEntry?.projectId ?? null);
    setSyncedTaskId(runningEntry?.taskId ?? null);
    setSyncedTagsKey(tagsKey);
    setDescription(runningEntry?.description ?? "");
    setProjectId(runningEntry?.projectId ?? null);
    setTaskId(runningEntry?.taskId ?? null);
    setTags(runningEntry?.tags ?? []);
    // On stop (runningEntry → null) the bar resets to the user's preference,
    // not to a hard false — otherwise "Default billable" silently applied to
    // the first timer of a session and nothing after it.
    setBillable(runningEntry?.billable ?? getDefaultBillable());
  } else if (runningEntry) {
    // Same entry, but its project/task may have been reassigned elsewhere
    // (e.g. from the entries list). Keep the bar's pickers in sync. Description
    // is intentionally not re-synced here to avoid clobbering in-progress typing
    // while the debounced save is in flight.
    if (syncedProjectId !== (runningEntry.projectId ?? null)) {
      setSyncedProjectId(runningEntry.projectId ?? null);
      setProjectId(runningEntry.projectId ?? null);
    }
    if (syncedTaskId !== (runningEntry.taskId ?? null)) {
      setSyncedTaskId(runningEntry.taskId ?? null);
      setTaskId(runningEntry.taskId ?? null);
    }
    if (syncedTagsKey !== tagsKey) {
      setSyncedTagsKey(tagsKey);
      setTags(runningEntry.tags ?? []);
    }
    if (syncedBillable !== runningEntry.billable) {
      setSyncedBillable(runningEntry.billable);
      setBillable(runningEntry.billable);
    }
  }

  // Debounced description update while running. A rejected save used to be
  // completely silent — the bar kept showing text the server never stored, and
  // the user found out when the stopped entry turned up blank.
  useEffect(() => {
    if (!runningEntry || description === runningEntry.description) return;
    const t = setTimeout(() => {
      updateEntry.mutate(
        { id: runningEntry.id, data: { description } },
        {
          onError: () =>
            toast.error("Couldn't save the description", {
              description: "It hasn't been stored on this entry yet.",
            }),
        }
      );
    }, 800);
    return () => clearTimeout(t);
  }, [description, runningEntry?.id]);

  // The single definition of "what the bar would start", handed to both the
  // button below and the Alt+Shift+S hotkey inside `useTimerLifecycle`. That
  // hotkey used to call `startTimer()` with no arguments at all — starting a
  // blank, project-less, non-billable entry, whose sync then wiped the staged
  // description and project off the screen. The button and the shortcut it
  // advertises now start the same entry.
  const draft: StartTimerInput = { description, projectId, taskId, tags, billable };

  // Owns the tick loop, mount-restore, and Alt+Shift+S/X hotkeys — must be
  // called exactly once (TimerBar is always mounted), not from every component
  // that just needs the action functions above. Takes the draft so the start
  // shortcut commits what's on screen rather than an empty entry.
  useTimerLifecycle(draft);

  const handleStart = () => startTimer(draft);
  const handleStop = () => stopTimer();
  const handleSubmit = () => {
    if (isRunning) handleStop();
    else handleStart();
  };

  // Picking a suggestion restores the whole combo it was usually logged against,
  // not just the text — mirroring FavoritesMenu. While a timer is running the
  // project/task have to be pushed to the server too, exactly as the pickers
  // below do; the description rides along on the existing debounced save.
  const handleSuggestion = (s: EntrySuggestion) => {
    setDescription(s.description);
    setProjectId(s.projectId);
    setTaskId(s.taskId);
    setTags(s.tags);
    // `billable` was the one field of the combo the bar dropped, even though the
    // server computes it per description×project×task and ships it in the
    // suggestion. "Make it like last time" has to include whether last time was
    // invoiceable.
    setBillable(s.billable);
    if (runningEntry) {
      updateEntry.mutate({
        id: runningEntry.id,
        data: {
          description: s.description,
          projectId: s.projectId,
          taskId: s.taskId,
          tags: s.tags,
          billable: s.billable,
        },
      });
    }
    descRef.current?.focus();
  };

  // Chips are explicit state, removable one by one; typing a different
  // description deliberately does NOT clear them (the bar fully resets on
  // stop/discard anyway). PUT replaces the entry's whole tag set, so send the
  // filtered list.
  const removeTag = (name: string) => {
    const previous = tags;
    const next = tags.filter((t) => t !== name);
    setTags(next);
    if (runningEntry) {
      updateEntry.mutate(
        { id: runningEntry.id, data: { tags: next } },
        {
          // Without this the chip vanished from the bar while the tag stayed on
          // the entry — the bar and the server silently disagreeing about what
          // is being tracked, with nothing on screen to say so.
          onError: () => {
            setTags(previous);
            toast.error(`Couldn't remove the tag "${name}"`, {
              description: "It's still on this entry. Try again.",
            });
          },
        }
      );
    }
  };

  return (
    // Wrap is load-bearing, not a fallback. `md:flex-nowrap` used to switch this
    // row to nowrap while every control except the description was `shrink-0`
    // (Button's base class), so between 768px and ~1000px the row needed 680px
    // in a 544–676px container: the Stop button rendered past the viewport's
    // right edge with `scrollWidth === clientWidth`, i.e. clipped, not
    // scrollable. A running timer could not be stopped from the bar on an iPad
    // in portrait or a laptop at half width. Single row is now `xl` only, where
    // the numbers actually fit, and the controls are one shrink-0 unit that
    // wraps whole rather than being pushed off.
    <header aria-label="Timer" className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2 shadow-sm xl:h-14 xl:flex-nowrap xl:gap-3 xl:py-0">
      {/* Description input, with autocomplete over the last 90 days of entries */}
      <DescriptionAutocomplete
        inputRef={descRef}
        value={description}
        onChange={setDescription}
        onSelect={handleSuggestion}
        onSubmit={handleSubmit}
        className={cn(
          // `focus-visible:ring-0` left the app's most-used control with no
          // focus indicator at all (WCAG 2.4.7) — and axe doesn't catch it,
          // because the element is focusable and labelled, just invisible when
          // focused. An inset ring keeps the borderless look in the bar while
          // still marking focus.
          //
          // The one deliberate deviation from the house ring: `inset`, because
          // an outset ring on a full-bleed borderless input clips against the
          // bar, and full opacity rather than /50, because with `border-0` this
          // ring is the *only* focus signal — the canonical pairing leans on
          // `border-ring` for half its contrast. Width follows the scale.
          //
          // `min-w-0` is what lets `flex-1` actually yield at `xl`; without it
          // the input's intrinsic min-width fights the row and the overflow
          // comes out of whatever sits furthest right.
          "basis-full border-0 bg-transparent text-sm shadow-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset xl:min-w-0 xl:flex-1 xl:basis-auto",
          isRunning && "font-medium"
        )}
      />

      {/* Tags carried over from a suggestion/favorite — removable, but only
          addable via those paths; full tag editing stays in the entry sheet. */}
      {tags.length > 0 && (
        <span className="flex shrink-0 items-center gap-1">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="gap-1 pr-1 text-xs font-normal"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: tagColor(tag) }}
              />
              <span className="max-w-32 truncate">{tag}</span>
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => removeTag(tag)}
                className="rounded-sm text-muted-foreground transition-colors duration-fast ease-out-quart hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </span>
      )}

      {/* Project + task chips. Button's base is `shrink-0`, so these could never
          give up width and the overflow came out of the controls instead.
          `basis-28` is the load-bearing part: flex wraps a line *before* it
          shrinks anything, so chips sized by their content (178px + 184px for a
          real project name) pushed the control cluster onto a row of its own at
          every width below `lg`. Sizing them from a 7rem basis and letting them
          grow into the leftover keeps chips and controls on one line down to
          768px, and the same 7rem as `min-w` stops them collapsing into
          unreadable slivers when they genuinely don't fit. */}
      <ProjectPicker
        value={projectId}
        onChange={(id) => {
          setProjectId(id);
          setTaskId(null);
          // Picking a project answers "is this invoiceable?" for the user —
          // that's what the project's own billable flag is for. An explicit
          // toggle afterwards still wins; this only sets the starting point,
          // and matches what the server does for callers that say nothing.
          // Precedence: an explicit toggle beats the project's flag, which
          // beats the user's "Default billable" preference. Clearing the
          // project falls back to that preference rather than hard false.
          const next = id
            ? (projects.find((p) => p.id === id)?.billable ?? getDefaultBillable())
            : getDefaultBillable();
          setBillable(next);
          if (runningEntry) {
            updateEntry.mutate({
              id: runningEntry.id,
              data: { projectId: id, taskId: null, billable: next },
            });
          }
        }}
        compact
        className="tt-touch shrink max-xl:min-w-28 max-xl:grow max-xl:basis-28"
      />


      {/* Task picker — only when a project is selected */}
      <TaskPicker
        projectId={projectId}
        value={taskId}
        onChange={(id) => {
          setTaskId(id);
          if (runningEntry) {
            updateEntry.mutate({ id: runningEntry.id, data: { taskId: id } });
          }
        }}
        compact
        className="tt-touch shrink max-xl:min-w-28 max-xl:grow max-xl:basis-28"
      />

      {/* Billable toggle. Last in the draft sequence — description, then what
          it's against, then whether it's invoiceable — and using the same bare
          `$` glyph and --primary-ink the entry row uses for its billable
          indicator, so the two surfaces read as one vocabulary. */}
      <BillableToggle
        value={billable}
        onChange={(next) => {
          setBillable(next);
          if (runningEntry) {
            updateEntry.mutate({ id: runningEntry.id, data: { billable: next } });
          }
        }}
      />

      {/* Control cluster. One shrink-0 unit, pushed right by `ml-auto`: it wraps
          to its own row as a whole when the chips can't make room, and never
          gives up width to them. Stop must be on screen at every width — that
          is the invariant `e2e/timer-bar-responsive.spec.ts` guards. */}
      <div className="ml-auto flex shrink-0 items-center gap-1 xl:gap-2">
        {/* Discard button (only when running) */}
        {isRunning && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="tt-touch animate-in fade-in text-muted-foreground duration-base ease-out-quart hover:text-destructive"
                onClick={() => setConfirmDiscard(true)}
                aria-label="Discard timer"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Discard timer
              <span className="ml-1.5 text-background/60">Alt+Shift+X</span>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Favorites: one-click start from a saved preset */}
        {!isRunning && (
          <FavoritesMenu current={{ description, projectId, taskId, tags, billable }} />
        )}

        {/* Combined elapsed + Start/Stop capsule */}
        <TimerControl isRunning={isRunning} onStart={handleStart} onStop={handleStop} />

        <AssistantButton />
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard running timer?"
        description="The time tracked so far will be permanently deleted. This cannot be undone."
        confirmLabel="Discard"
        onConfirm={discardTimer}
      />
    </header>
  );
}
