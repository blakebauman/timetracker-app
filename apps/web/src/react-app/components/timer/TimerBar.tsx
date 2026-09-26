import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { toast } from "sonner";
import { RotateCcw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { TimerControl, TransportDisc } from "./TimerControl";
import { FavoritesMenu } from "./FavoritesMenu";
import { ResumeLastButton } from "./ResumeLastButton";
import { DescriptionAutocomplete } from "./DescriptionAutocomplete";
import { DayRibbon } from "./DayRibbon";
import { useTodayTrace, type TodayTrace } from "@/hooks/useTodayTrace";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { TaskPicker } from "@/components/entries/TaskPicker";
import { TagPicker } from "@/components/entries/TagPicker";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { useTimer, useTimerLifecycle, type StartTimerInput } from "@/hooks/useTimer";
import { useProjects } from "@/hooks/useProjects";
import { useUpdateEntry } from "@/hooks/useEntries";
import { useTagColors } from "@/hooks/useProjects";
import { BillableToggle } from "./BillableToggle";
import { getDefaultBillable } from "@/lib/billable";
import { isOptimisticEntryId } from "@/lib/pendingStart";
import { formatDurationShort, formatEntryTime } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import type { EntrySuggestion } from "@timetracker/core/schemas";

/**
 * The timer has two bodies and one mind.
 *
 * Idle, it is the **composer**: a glass capsule floating over the bottom of
 * the pane, asking what you're working on, with the project / task / billable
 * pills beneath and the red Start disc at the right. Running, the capsule
 * docks into the **transport bar**: a full-width strip on the bottom edge
 * carrying the Stop disc and its breathing ring, the elapsed readout at
 * display size, the same editable description and pills, and the day ribbon
 * — today drawn as a trace, with the live segment growing.
 *
 * Everything below the render is unchanged from the top-bar era and is the
 * single source of truth for "what the bar would start": the draft, the sync
 * from the running entry, the debounced description save, and the lifecycle
 * hook that owns the tick loop and the Alt+Shift hotkeys.
 *
 * The two bodies are two React trees, so every Start and Stop unmounts the
 * control that was just pressed. Three things paper over the seam: focus is
 * carried across by intent (the disc goes to the disc, the field to the
 * field), a polite live region says what happened, and the rendered height is
 * published as `--timer-h` so panes clear whichever body is on screen.
 */
export function TimerBar() {
  const { runningEntry } = useTimerStore();
  const { startTimer, stopTimer, discardTimer } = useTimer();
  const updateEntry = useUpdateEntry();
  // Shared with the Alt+Shift+X hotkey (registered in useTimerLifecycle) so
  // both the trash-icon button and the keyboard shortcut open the same
  // confirm dialog.
  const confirmDiscard = useUIStore((s) => s.discardConfirmOpen);
  const setConfirmDiscard = useUIStore((s) => s.setDiscardConfirmOpen);

  // Seeded from the running entry, not blank: on a reload the store already
  // holds the timer in the first frame (the local mirror), and the sync below
  // only fires on a *change* of entry.
  const [description, setDescription] = useState(runningEntry?.description ?? "");
  const [projectId, setProjectId] = useState<string | null>(runningEntry?.projectId ?? null);
  const [taskId, setTaskId] = useState<string | null>(runningEntry?.taskId ?? null);
  // Tags carried over from a picked suggestion, synced from the running
  // entry, or added with the tag picker chip.
  const [tags, setTags] = useState<string[]>(runningEntry?.tags ?? []);
  // Whether this hour is invoiceable. Seeded from the project on selection,
  // overridable by the user.
  const [billable, setBillable] = useState(() => runningEntry?.billable ?? getDefaultBillable());
  const tagColor = useTagColors();
  const { data: projects = [] } = useProjects();
  const descRef = useRef<HTMLInputElement>(null);
  const discRef = useRef<HTMLButtonElement>(null);
  const phoneDiscRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const elapsed = useTimerStore((s) => s.elapsed);

  const isRunning = Boolean(runningEntry);

  // Sync the editable fields from the running entry whenever it changes
  // (restored from IndexedDB, or started/stopped in another tab). Adjusting
  // during render avoids a frame of stale fields.
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
  // The optimistic placeholder becoming the server's entry is the same timer,
  // not a new one: re-syncing there overwrote whatever had been typed into the
  // bar in the create's round-trip — the save still went out, so the server
  // held the new text while the field showed the old.
  const adoptingServerId =
    syncedEntryId !== null &&
    isOptimisticEntryId(syncedEntryId) &&
    runningEntry !== null &&
    !isOptimisticEntryId(runningEntry.id);
  if (adoptingServerId) {
    setSyncedEntryId(runningEntry.id);
  } else if (syncedEntryId !== (runningEntry?.id ?? null)) {
    setSyncedEntryId(runningEntry?.id ?? null);
    setSyncedProjectId(runningEntry?.projectId ?? null);
    setSyncedTaskId(runningEntry?.taskId ?? null);
    setSyncedTagsKey(tagsKey);
    setDescription(runningEntry?.description ?? "");
    setProjectId(runningEntry?.projectId ?? null);
    setTaskId(runningEntry?.taskId ?? null);
    setTags(runningEntry?.tags ?? []);
    // On stop (runningEntry → null) the bar resets to the user's preference,
    // not to a hard false.
    setBillable(runningEntry?.billable ?? getDefaultBillable());
  } else if (runningEntry) {
    // Same entry, but its project/task may have been reassigned elsewhere.
    // Description is intentionally not re-synced here to avoid clobbering
    // in-progress typing while the debounced save is in flight.
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

  // Debounced description update while running. A rejected save is not
  // silent: the bar would otherwise keep showing text the server never stored.
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveDescription = (id: string, text: string) =>
    updateEntry.mutate(
      { id, data: { description: text } },
      {
        onError: () =>
          toast.error("Couldn't save the description", {
            description: "It hasn't been stored on this entry yet.",
          }),
      }
    );
  useEffect(() => {
    if (!runningEntry || description === runningEntry.description) return;
    saveTimeout.current = setTimeout(() => saveDescription(runningEntry.id, description), 800);
    return () => clearTimeout(saveTimeout.current);
  }, [description, runningEntry?.id]);

  // The single definition of "what the bar would start", handed to both the
  // disc below and the Alt+Shift+S hotkey inside `useTimerLifecycle`.
  const draft: StartTimerInput = { description, projectId, taskId, tags, billable };

  // ─── Focus across the swap ─────────────────────────────────────────────
  // Recorded just before a Start or Stop, consumed once the other body has
  // mounted. Only focus that was already inside the bar is carried; a hotkey
  // pressed from elsewhere in the app must not pull focus down here.
  const focusIntent = useRef<"disc" | "description" | null>(null);
  const rememberFocus = useCallback(() => {
    const active = document.activeElement;
    // The field is carried however it was focused — you were typing. The disc
    // only for keyboard focus: after a click or a tap, focusing the new disc
    // would just pop its tooltip over the bar.
    focusIntent.current =
      active === descRef.current
        ? "description"
        : active && headerRef.current?.contains(active) && active.matches(":focus-visible")
          ? "disc"
          : null;
  }, []);
  useLayoutEffect(() => {
    const intent = focusIntent.current;
    focusIntent.current = null;
    if (intent === "description") descRef.current?.focus();
    else if (intent === "disc") {
      // Whichever disc is actually on screen at this width.
      [discRef.current, phoneDiscRef.current]
        .find((el) => el && el.offsetParent !== null)
        ?.focus();
    }
  }, [isRunning]);

  // ─── What just happened, for a screen reader ────────────────────────────
  // The readout's elapsed is in its accessible name, but nothing announced
  // the transitions themselves: a keyboard user pressed Start and heard
  // nothing at all. Subscribed to the store rather than derived from props,
  // because the transition can come from anywhere — a hotkey, an entry row,
  // the idle dialog, another tab — and the stop message needs the elapsed from
  // the moment *before* the store cleared it.
  const [announcement, setAnnouncement] = useState("");
  const discarding = useRef(false);
  const projectsRef = useRef(projects);
  useEffect(() => {
    projectsRef.current = projects;
  });
  useEffect(
    () =>
      useTimerStore.subscribe((state, prev) => {
        const wasRunning = Boolean(prev.runningEntry);
        const nowRunning = Boolean(state.runningEntry);
        if (wasRunning === nowRunning) return;
        // A restore isn't the user starting or stopping anything: on every
        // load with a timer running, a screen reader used to hear "Timer
        // started" for a timer that had been running for an hour.
        if (prev.restoring || state.restoring) return;
        if (state.runningEntry) {
          const entry = state.runningEntry;
          const project = projectsRef.current.find((p) => p.id === entry.projectId)?.name;
          const what = entry.description.trim();
          setAnnouncement(
            `Timer started${what ? `: ${what}` : ""}${project ? `, on ${project}` : ""}`
          );
        } else {
          const took =
            prev.elapsed < 60
              ? `${prev.elapsed} ${prev.elapsed === 1 ? "second" : "seconds"}`
              : formatDurationShort(prev.elapsed);
          setAnnouncement(
            discarding.current
              ? "Timer discarded"
              : `Timer stopped after ${took}. Keep running is available for 10 seconds, Alt+Shift+R.`
          );
          discarding.current = false;
        }
      }),
    []
  );

  // Owns the tick loop, mount-restore, and Alt+Shift+S/X hotkeys — must be
  // called exactly once (TimerBar is always mounted).
  useTimerLifecycle(draft, { onBeforeToggle: rememberFocus, onUseDescription: setDescription });

  // Until the restore has heard from the server, "nothing is running" is a
  // guess; the disc says so, and a start pressed now is held (see useTimer).
  const restoring = useTimerStore((s) => s.restoring);
  const handleStart = () => {
    rememberFocus();
    // `fromBar`: if this is held for the restore, apply whatever the bar
    // says when it runs, not the draft as it was at the press.
    startTimer({ ...draft, fromBar: true });
  };
  const handleStop = () => {
    rememberFocus();
    stopTimer();
  };
  // Enter in the field. Idle, it starts — the field is where you are when
  // you're about to. Running, it commits the description and nothing else:
  // Enter is "save my edit" everywhere else in the app, and a consultant
  // fixing a typo mid-task used to end the entry doing it. Stop is the disc
  // and Alt+Shift+S.
  const handleSubmit = () => {
    if (!isRunning) {
      handleStart();
      return;
    }
    clearTimeout(saveTimeout.current);
    if (runningEntry && description !== runningEntry.description) {
      saveDescription(runningEntry.id, description);
      setAnnouncement("Description saved");
    }
  };

  // Publish the rendered height so every pane pads its last row clear of the
  // timer — the bar's height varies with width, wrapping and safe-area insets,
  // which a fixed clearance got wrong on a phone by a third of the screen.
  const measureRef = useCallback((node: HTMLElement | null) => {
    headerRef.current = node;
  }, []);
  useEffect(() => {
    const node = headerRef.current;
    if (!node) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--timer-h", `${node.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isRunning]);

  // Picking a suggestion restores the whole combo it was usually logged
  // against, not just the text — including whether last time was invoiceable.
  const applyCombo = (c: {
    description: string;
    projectId: string | null;
    taskId: string | null;
    tags: string[];
    billable: boolean;
  }) => {
    setDescription(c.description);
    setProjectId(c.projectId);
    setTaskId(c.taskId);
    setTags(c.tags);
    setBillable(c.billable);
    if (runningEntry) {
      clearTimeout(saveTimeout.current);
      updateEntry.mutate({ id: runningEntry.id, data: c });
    }
  };
  const handleSuggestion = (s: EntrySuggestion) => {
    // What the entry *is*, not what's being typed: the text in the field is
    // the query that found this suggestion, and "Undo" restoring it would put
    // a search term on the entry.
    const before = runningEntry
      ? {
          description: runningEntry.description,
          projectId: runningEntry.projectId,
          taskId: runningEntry.taskId,
          tags: runningEntry.tags,
          billable: runningEntry.billable,
        }
      : { description, projectId, taskId, tags, billable };
    applyCombo({
      description: s.description,
      projectId: s.projectId,
      taskId: s.taskId,
      tags: s.tags,
      billable: s.billable,
    });
    // On a running timer a suggestion moves time that's already been tracked.
    // When it moves it to a different client, say so — with the way back.
    if (runningEntry && s.projectId !== before.projectId) {
      const to = s.projectId ? (s.projectName ?? "another project") : "no project";
      toast(`Moved this timer to ${to}`, {
        description: `"${s.description}"`,
        duration: 8000,
        action: { label: "Undo", onClick: () => applyCombo(before) },
      });
    }
    descRef.current?.focus();
  };

  const removeTag = (name: string) => {
    const previous = tags;
    const next = tags.filter((t) => t !== name);
    setTags(next);
    if (runningEntry) {
      updateEntry.mutate(
        { id: runningEntry.id, data: { tags: next } },
        {
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

  const handleTagsChange = (next: string[]) => {
    const previous = tags;
    setTags(next);
    if (runningEntry) {
      updateEntry.mutate(
        { id: runningEntry.id, data: { tags: next } },
        {
          onError: () => {
            setTags(previous);
            toast.error("Couldn't update the tags", {
              description: "They're unchanged on this entry. Try again.",
            });
          },
        }
      );
    }
  };

  const handleProjectChange = (id: string | null) => {
    setProjectId(id);
    setTaskId(null);
    // Precedence: an explicit toggle beats the project's flag, which beats the
    // user's "Default billable" preference. Clearing the project falls back to
    // that preference rather than hard false.
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
  };

  const handleTaskChange = (id: string | null) => {
    setTaskId(id);
    if (runningEntry) {
      updateEntry.mutate({ id: runningEntry.id, data: { taskId: id } });
    }
  };

  const handleBillableChange = (next: boolean) => {
    setBillable(next);
    if (runningEntry) {
      updateEntry.mutate({ id: runningEntry.id, data: { billable: next } });
    }
  };

  // The pills under the field. Shared by both bodies so the composer and the
  // bar can't drift — same controls, same order, same accessible names.
  const chipClass =
    "tt-touch relative h-8 min-w-0 max-w-48 shrink rounded-full max-sm:max-w-40 border border-border bg-background px-2.5 hover:bg-foreground/6";
  // An unassigned project is an unbillable hour. Said on the chip before the
  // timer starts — and while it runs — rather than only in a toast after Stop.
  const needsProject =
    !projectId && projects.length > 0 && (isRunning || description.trim().length > 0);
  const pills = (
    <>
      <ProjectPicker
        value={projectId}
        onChange={handleProjectChange}
        compact
        className={chipClass}
        attention={needsProject ? "No project yet — time without a project can't be billed" : undefined}
      />
      <TaskPicker
        projectId={projectId}
        value={taskId}
        onChange={handleTaskChange}
        compact
        className={chipClass}
      />
      {tags.length > 0 && (
        <span className="flex min-w-0 shrink items-center gap-1">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              // Same 32px step as the chips beside it. On a phone the tags
              // fold into the tag picker's count, so the pills keep to one row.
              className="h-8 gap-1 border-border bg-background pr-1 pl-2.5 text-xs font-normal max-sm:hidden"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: tagColor(tag) }}
              />
              <span className="max-w-28 truncate">{tag}</span>
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => removeTag(tag)}
                className="tt-touch relative grid size-6 place-items-center rounded-full text-muted-foreground transition-colors duration-fast ease-out-quart hover:bg-foreground/6 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}

        </span>
      )}
      {/* Adds (and, on a phone, lists and removes). Beside the chips it is
          just an icon; on a phone, where the chips fold away, it carries the
          count. Tags used to be removable from the bar but never addable. */}
      <TagPicker
        value={tags}
        onChange={handleTagsChange}
        className={chipClass}
        labelClassName={tags.length > 0 ? "sm:hidden" : "hidden"}
      />
    </>
  );

  // Beside the description, not at the end of the chips: whether this hour is
  // invoiceable is a property of the work being described, and at the end of
  // a wrapping chip row the lone "$" kept falling onto a line of its own.
  const billableToggle = <BillableToggle value={billable} onChange={handleBillableChange} />;

  const descriptionField = (
    <DescriptionAutocomplete
      inputRef={descRef}
      value={description}
      onChange={setDescription}
      onSelect={handleSuggestion}
      onSubmit={handleSubmit}
      title={description || undefined}
      ariaLabel="Description"
      className={cn(
        // Bare in both bodies: the capsule or the bar is the field's edge. The
        // inset ring is the only focus signal here, at full opacity, because
        // with `border-0` there is no border to shift colour. `truncate` ends
        // a long description on an ellipsis rather than mid-word.
        "tt-touch h-9 min-w-0 flex-1 truncate border-0 bg-transparent px-2 text-base shadow-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset md:text-base dark:bg-transparent",
        // Running, the field sits bare in the bar and read as a label; a hover
        // wash says it's editable.
        isRunning &&
          "font-medium transition-colors duration-fast ease-out-quart hover:bg-foreground/4 focus-visible:bg-transparent"
      )}
    />
  );

  const liveRegion = (
    <p role="status" aria-live="polite" className="sr-only">
      {announcement}
    </p>
  );

  const discardDialog = (
    <ConfirmDialog
      open={confirmDiscard}
      onOpenChange={setConfirmDiscard}
      title={`Discard ${formatDurationShort(elapsed)} of tracked time?`}
      description={`${
        runningEntry?.description?.trim() ? `"${runningEntry.description.trim()}"` : "This entry"
      } will be deleted instead of saved. This can't be undone — to keep the time, stop the timer instead.`}
      confirmLabel="Discard"
      onConfirm={() => {
        discarding.current = true;
        discardTimer();
      }}
    />
  );

  if (!isRunning) {
    return (
      <>
        {liveRegion}
        <header
          ref={measureRef}
          aria-label="Timer controls"
          // One focus signal: the field's cool ring. The capsule's red edge no
          // longer brightens on focus-within as a second, weaker one.
          className="group/composer tt-glass grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-dock animate-capsule-in rounded-capsule border border-primary/20 p-3 shadow-2xl md:bottom-6 md:left-[calc(5rem+1.5rem)] md:right-auto md:w-[min(46rem,calc(100vw-5rem-3rem))]"
        >
          <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2">
            {descriptionField}
            {billableToggle}
            {/* Said while you're typing, where you're looking — the hotkey
                lives in the tooltip, which a keyboard user never hovers. */}
            {description.trim() && (
              <span
                aria-hidden
                className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity duration-fast ease-out-quart group-focus-within/composer:opacity-100 sm:pointer-fine:flex"
              >
                <Kbd>Enter</Kbd> to start
              </span>
            )}
            {!description.trim() && <KeepRunningPill />}
          </div>

          <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-1.5">
            {pills}
            <span className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
              <DaySummary />
              {/* Resume the last thing tracked, and one-click start from a
                  saved preset. Both are idle-only. */}
              <span className="flex items-center">
                <ResumeLastButton
                  onResume={(s) => {
                    rememberFocus();
                    startTimer({
                      description: s.description,
                      projectId: s.projectId,
                      taskId: s.taskId,
                      tags: s.tags,
                      billable: s.billable,
                    });
                  }}
                />
                <FavoritesMenu current={{ description, projectId, taskId, tags, billable }} />
              </span>
            </span>
          </div>

          {/* Last in the DOM, first-row-right on screen: Tab runs describe →
              assign → start, the order the work is done in, instead of
              putting Start between the field and the chips it depends on. */}
          <div className="col-start-2 row-start-1">
            <TimerControl
              isRunning={false}
              pending={restoring}
              onStart={handleStart}
              onStop={handleStop}
              discRef={discRef}
            />
          </div>
          {discardDialog}
        </header>
      </>
    );
  }

  return (
    <>
      {liveRegion}
      <header
        ref={measureRef}
        aria-label="Timer controls"
        className="tt-glass fixed inset-x-0 bottom-0 z-dock animate-dock-in border-t md:left-20"
      >
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6">
          <TimerControl
            isRunning
            onStart={handleStart}
            onStop={handleStop}
            discRef={discRef}
            discClassName="max-md:hidden"
          />

          {/* Description + pills. Below md the readout and Discard share the
              first row, the field takes the second, the pills the third — so
              Stop stays on screen at every width and Discard no longer sits
              alone on a fourth row under the thumb. */}
          {/* `basis-0`, not `auto`: the column takes the room that's left and
              wraps its own pills, instead of a long description or a row of
              chips pushing Discard onto a line of its own. Capped so it
              doesn't strand the ribbon across a band of empty glass. */}
          <div className="flex min-w-0 basis-full flex-col gap-1.5 max-md:order-2 md:max-w-2xl md:basis-0 md:flex-1">
            <div className="flex min-w-0 items-center gap-1">
              {descriptionField}
              {billableToggle}
            </div>
            {/* One line on a phone, the project chip truncating, so the Stop
                disc at its end sits in the corner instead of wrapping. */}
            <div className="flex flex-wrap items-center gap-1.5 px-1 max-md:flex-nowrap">
              {pills}
              {/* Stop again, bottom-right, on a phone: the thumb's corner. The
                  one beside the readout is hidden there. */}
              <TransportDisc
                isRunning
                onStart={handleStart}
                onStop={handleStop}
                discRef={phoneDiscRef}
                className="ml-auto md:hidden"
              />
            </div>
          </div>

          {/* Today as a trace. Only where there is room for it to be read. */}
          <DayRibbon className="hidden min-w-56 max-w-md flex-1 xl:block" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto shrink-0 text-muted-foreground hover:text-destructive max-md:order-1"
                onClick={() => setConfirmDiscard(true)}
                aria-label="Discard timer"
                aria-keyshortcuts="Alt+Shift+X"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Discard timer
              <Kbd className="ml-1.5">Alt+Shift+X</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
        {discardDialog}
      </header>
    </>
  );
}

/**
 * Today, in the idle composer: the total, and — when the last timer stopped a
 * while ago — how long nothing has been tracked. The composer used to say
 * nothing about the day it was logging; this is the gap it now points at.
 */
function DaySummary() {
  const trace = useTodayTrace();
  // Unknown is not zero: hold the space while loading, and say nothing at all
  // if the day couldn't be read rather than claim an empty one.
  if (trace.status === "pending") {
    return <Skeleton aria-hidden className="h-3 w-24 rounded-full" />;
  }
  if (trace.status === "error") return null;
  return <DaySummaryReady trace={trace} />;
}

function DaySummaryReady({ trace }: { trace: TodayTrace }) {
  const timeFormat = useUIStore((s) => s.timeFormat);
  const gapSeconds =
    trace.lastStop !== null ? Math.floor((trace.now - trace.lastStop) / 1000) : 0;
  const showGap = gapSeconds >= 5 * 60;
  const lastStopLabel =
    trace.lastStop !== null ? formatEntryTime(new Date(trace.lastStop).toISOString(), timeFormat) : "";

  return (
    <span className="flex min-w-0 items-center gap-2 text-xs">
      <DayRibbon variant="compact" trace={trace} className="hidden w-20 lg:block" />
      <span className="min-w-0 whitespace-nowrap">
        {trace.total > 0 ? (
          <>
            <span className="font-mono font-medium tabular-nums text-foreground">
              {formatDurationShort(trace.total)}
            </span>{" "}
            <span className="text-muted-foreground">today</span>
          </>
        ) : (
          <span className="text-muted-foreground">Nothing tracked today</span>
        )}
        {showGap && (
          <span
            className="hidden text-muted-foreground sm:inline"
            title={`Nothing tracked since ${lastStopLabel}`}
          >
            {" · "}
            <span className="font-mono tabular-nums">{formatDurationShort(gapSeconds)}</span> untracked
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * The undo for a Stop, beside the disc that was pressed. For ten seconds
 * after any stop — online or off, with or without a project — and only while
 * the field is empty, so it never competes with starting something new.
 */
function KeepRunningPill() {
  const lastStopped = useTimerStore((s) => s.lastStopped);
  const { keepRunning } = useTimer();
  // Which window has closed. Compared by identity, so a new stop reopens it
  // without a reset step; the timer is the only place the clock is read.
  const [expired, setExpired] = useState<typeof lastStopped>(null);
  useEffect(() => {
    if (!lastStopped) return;
    const t = setTimeout(
      () => setExpired(lastStopped),
      Math.max(0, lastStopped.until - Date.now())
    );
    return () => clearTimeout(t);
  }, [lastStopped]);
  if (!lastStopped || expired === lastStopped) return null;
  const what = lastStopped.entry.description.trim();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => keepRunning()}
          aria-keyshortcuts="Alt+Shift+R"
          aria-label={`Keep running${what ? ` "${what}"` : ""}`}
          className="shrink-0 animate-in fade-in gap-1.5 duration-base ease-out-quart"
        >
          <RotateCcw aria-hidden className="h-3.5 w-3.5" />
          Keep running
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Undo the stop and carry on from{" "}
        {formatDurationShort(
          lastStopped.entry.duration ??
            (lastStopped.entry.stop
              ? Math.round((Date.parse(lastStopped.entry.stop) - Date.parse(lastStopped.entry.start)) / 1000)
              : 0)
        )}
        <Kbd className="ml-1.5">Alt+Shift+R</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}
