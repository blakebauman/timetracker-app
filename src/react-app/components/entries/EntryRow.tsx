import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Play, Trash2, MoreHorizontal, Edit2, Upload, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { AssignProjectChip } from "./ProjectPicker";
import { TimeRangePopover } from "./TimeRangePopover";
import { useUpdateEntry, useDeleteEntry, useCreateEntry } from "@/hooks/useEntries";
import { useProjects, useTagColors } from "@/hooks/useProjects";
import { usePushEntries, useIntegrations } from "@/hooks/useIntegrations";
import { useTimer } from "@/hooks/useTimer";
import { cn } from "@/lib/utils";
import {
  formatDurationShort,
  formatShortDate,
  formatEntryTime,
  localDayKey,
  parseTimeInput,
} from "@/lib/dateUtils";
import { toCreatePayload } from "@/lib/entryUtils";
import { useUIStore } from "@/stores/uiStore";
import { useSavedFlash } from "@/hooks/useSavedFlash";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { SavedTick } from "./SavedTick";
import { ColorDot } from "@/components/ColorDot";
import { ProjectBadge } from "@/components/ProjectBadge";
import type { TimeEntry } from "@shared/schemas";

interface EntryRowProps {
  entry: TimeEntry;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

/** Must match `duration-base` on the row's exit animation below. */
const EXIT_MS = 200;

export function EntryRow({ entry, isSelected = false, onToggleSelect }: EntryRowProps) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(entry.description);
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationInput, setDurationInput] = useState("");
  const [durationInvalid, setDurationInvalid] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Flushed if the row unmounts before its exit animation finishes — see handleDelete.
  const pendingDelete = useRef<(() => void) | null>(null);
  useEffect(() => () => pendingDelete.current?.(), []);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();
  const createEntry = useCreateEntry();
  const pushEntries = usePushEntries();
  const { data: projects = [] } = useProjects();
  const tagColor = useTagColors();
  const { data: integrations = [] } = useIntegrations();
  const { startTimer } = useTimer();
  const timeFormat = useUIStore((s) => s.timeFormat);
  const highlighted = useUIStore((s) => s.highlightedEntryId === entry.id);
  // Inline commits acknowledge themselves; see useSavedFlash.
  const savedDesc = useSavedFlash();
  const savedDuration = useSavedFlash();
  const savedRange = useSavedFlash();
  const savedProject = useSavedFlash();
  // The editor is hosted by EntryList, not here — a row that unmounts (its day
  // changed, its group collapsed) must not take a half-finished edit with it.
  const openEntryEditor = useUIStore((s) => s.openEntryEditor);
  const flashEntry = useUIStore((s) => s.flashEntry);

  // Resync the draft description when it changes from outside — a WS edit from
  // another tab, or a failed mutation rolling back. Previously this was masked
  // by the row's key being derived from the description: any change remounted
  // the row and reset the state. Now that the key is stable, the resync has to
  // be explicit or a stale draft would be written back on the next blur.
  const [syncedDesc, setSyncedDesc] = useState(entry.description);
  if (syncedDesc !== entry.description) {
    setSyncedDesc(entry.description);
    // Never clobber what the user is actively typing.
    if (!editingDesc) setDesc(entry.description);
  }

  const project = projects.find((p) => p.id === entry.projectId);
  const integration = integrations.find((i) => i.id === project?.integrationId);
  const isCompleted = !!entry.stop && (entry.duration ?? 0) > 0;
  const isPushing =
    pushEntries.isPending && !!pushEntries.variables?.entryIds.includes(entry.id);

  const handlePush = () => {
    if (!integration || (!isCompleted && entry.syncStatus !== "error")) return;
    pushEntries.mutate({ entryIds: [entry.id] });
  };

  const pushTitle = isPushing
    ? "Pushing…"
    : entry.syncStatus === "synced"
      ? `Pushed to ${integration?.name ?? "integration"}${
          entry.syncedAt
            ? ` · ${formatShortDate(entry.syncedAt)} ${formatEntryTime(entry.syncedAt, timeFormat)}`
            : ""
        } — click to push again`
      : entry.syncStatus === "error"
        ? `${entry.syncError ?? "Push failed"} — click to retry`
        : isCompleted
          ? `Push to ${integration?.name ?? "integration"}`
          : "Finish the entry before pushing";

  const handleDescBlur = () => {
    setEditingDesc(false);
    if (desc !== entry.description) {
      updateEntry.mutate(
        { id: entry.id, data: { description: desc } },
        { onSuccess: savedDesc.flash }
      );
    }
  };

  const handleStartEditDuration = () => {
    // Seed with the same text the row was showing. It used to seed with
    // formatSeconds ("01:30:00") under a display of formatDurationShort
    // ("1h 30m"), so the value appeared to change the instant you clicked it.
    // parseTimeInput round-trips this form, so nothing is lost.
    setDurationInput(entry.duration ? formatDurationShort(entry.duration) : "");
    setDurationInvalid(false);
    setEditingDuration(true);
  };

  const handleSaveDuration = () => {
    const parsed = parseTimeInput(durationInput);
    // Unparseable or non-positive input used to close the field and silently
    // restore the old duration — the edit simply evaporated. Hold the field open
    // and mark it instead; on this screen a dropped duration is a wrong invoice.
    if (parsed === null || parsed <= 0 || !entry.start) {
      setDurationInvalid(true);
      return;
    }
    setDurationInvalid(false);
    setEditingDuration(false);
    const newStop = new Date(new Date(entry.start).getTime() + parsed * 1000).toISOString();
    updateEntry.mutate(
      { id: entry.id, data: { stop: newStop } },
      { onSuccess: savedDuration.flash }
    );
  };

  const cancelDurationEdit = () => {
    setDurationInvalid(false);
    setEditingDuration(false);
  };

  const handleRangeChange = ({ start, stop }: { start: string; stop: string | null }) => {
    // Changing the date moves the entry to another day group, so this row
    // unmounts on the optimistic patch and a tick rendered here would never be
    // seen. Flash the entry instead — the same machinery that shows you where a
    // stopped timer landed — and fire it now, before the row relocates, rather
    // than from an onSuccess this component won't be around to receive.
    const movedDay = localDayKey(start) !== localDayKey(entry.start);
    if (movedDay) flashEntry(entry.id);
    updateEntry.mutate(
      // `undefined` omits the field: a running entry keeps its null stop rather
      // than having it explicitly cleared.
      { id: entry.id, data: { start, stop: stop ?? undefined } },
      movedDay ? undefined : { onSuccess: savedRange.flash }
    );
  };

  const handleContinue = () => {
    startTimer({
      description: entry.description,
      projectId: entry.projectId,
      billable: entry.billable,
    });
  };

  /**
   * Let the exit animation play, then commit — but never let the animation be
   * what decides whether the delete happens.
   *
   * This used to fire from the row's `onAnimationEnd`, so the deletion only
   * happened if the animation was allowed to finish. Anything that unmounted the
   * row inside that 200 ms window — collapsing its group or day header, switching
   * Timer view, navigating the period — cancelled it silently: no delete, no
   * toast, no error, and the row reappeared on the next refetch.
   *
   * The commit is held in a ref and flushed on unmount, so the window is a
   * presentation delay rather than a condition.
   */
  const handleDelete = () => {
    if (removing) return;
    setRemoving(true);
    const payload = toCreatePayload(entry);
    pendingDelete.current = () => {
      pendingDelete.current = null;
      deleteEntry.mutate(entry.id);
      toast.success("Entry deleted", {
        action: {
          label: "Undo",
          onClick: () => createEntry.mutate(payload),
        },
      });
    };
    setTimeout(() => pendingDelete.current?.(), reducedMotion ? 0 : EXIT_MS);
  };

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-3 border-b border-border-strong px-4 py-2.5 transition-colors duration-fast ease-out-quart hover:bg-accent/40",
          removing
            ? "pointer-events-none animate-out fade-out slide-out-to-right-4 fill-mode-forwards duration-base ease-out-quart"
            : highlighted
              ? "animate-stopped"
              : "animate-fade-up",
          isSelected && "bg-accent/60"
        )}
      >
        {/* Checkbox (visible on hover or when any selection active) */}
        {onToggleSelect && (
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label="Select entry"
            onClick={() => onToggleSelect(entry.id)}
            // The 16×16 box is the only control here that failed even WCAG 2.2
            // AA's 24px floor (SC 2.5.8). The ::before expands the hit target to
            // 28×28 without changing the visual weight of the checkbox itself.
            className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-fast ease-out-quart before:absolute before:-inset-1.5 before:content-[''] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/40 tt-reveal hover:border-primary"
            }`}
          >
            {isSelected && (
              <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        )}

        {/* Project color dot */}
        <ColorDot color={entry.projectColor} className="h-3 w-3" />

        {/* Description */}
        <div className="relative min-w-0 flex-1">
          <SavedTick saved={savedDesc.saved} className="-right-3" />
          {editingDesc ? (
            <input
              autoFocus
              // The inline editor had no accessible name at all — a screen reader
              // landed on an unlabelled text field. The button it replaces reads
              // out the description itself, so the swap lost the only context.
              aria-label="Description"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={handleDescBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setDesc(entry.description);
                  setEditingDesc(false);
                }
              }}
              className="w-full border-b border-primary/40 bg-transparent text-sm outline-none ring-0"
            />
          ) : (
            <button
              // Use the system focus ring rather than a bare underline: a third
              // focus vocabulary in one page means keyboard users have to relearn
              // "where am I" per control.
              className="relative rounded-sm text-left text-sm transition-colors duration-fast ease-out-quart before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] hover:text-primary-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={() => setEditingDesc(true)}
            >
              {entry.description || (
                <span className="italic text-muted-foreground">
                  No description
                </span>
              )}
            </button>
          )}

          {/* Project + tags row. Below `sm` this line also carries the time
              range: the row's horizontal rail has no space for it there (adding
              it pushed the row to 568px inside a 390px viewport and clipped the
              duration off the end), but correcting "that meeting started at
              14:00, not 13:30" is the single most likely edit on a phone, and
              dropping the control entirely meant it could not be made from the
              list at all. One of the two instances is always `hidden`, so it
              adds no tab stop. */}
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <span className="relative inline-flex sm:hidden">
              <TimeRangePopover
                start={entry.start}
                stop={entry.stop}
                onChange={handleRangeChange}
                triggerClassName="flex items-center gap-1 rounded-sm px-1 text-micro tabular-nums text-muted-foreground"
              >
                <span>{formatEntryTime(entry.start, timeFormat)}</span>
                <span>–</span>
                <span>
                  {entry.stop ? formatEntryTime(entry.stop, timeFormat) : "…"}
                </span>
              </TimeRangePopover>
            </span>
            {entry.projectName ? (
              <ProjectBadge name={entry.projectName} color={entry.projectColor} />
            ) : (
              <span className="relative">
                <SavedTick saved={savedProject.saved} className="-right-3" />
                {/* Assigning a project is an inline commit like the others and
                    gets the same acknowledgement — it was the one that said
                    nothing at all. */}
                <AssignProjectChip
                  // Scoped like the group chip's label. The bare "Assign
                  // project" collided with the stop toast's action, which does
                  // something different (opens the whole editor) at a different
                  // scope — a screen reader heard two identical controls.
                  ariaLabel="Assign project to this entry"
                  onAssign={(projectId) =>
                    updateEntry.mutate(
                      { id: entry.id, data: { projectId } },
                      { onSuccess: savedProject.flash }
                    )
                  }
                />
              </span>
            )}
            {entry.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="h-4 gap-1 px-1 py-0 text-micro font-normal"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tagColor(tag) }}
                />
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Integration sync status — persistent indicator, only once it's meaningful */}
        {integration && (isPushing || entry.syncStatus === "synced" || entry.syncStatus === "error") && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-label={pushTitle}
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center",
                  entry.syncStatus === "synced"
                    ? "text-success-ink"
                    : entry.syncStatus === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"
                )}
              >
                {isPushing ? (
                  <Spinner size="sm" />
                ) : entry.syncStatus === "synced" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent>{pushTitle}</TooltipContent>
          </Tooltip>
        )}

        {/* Billable indicator */}
        {entry.billable && (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Was a bare <span> whose only "Billable" text lived in a mouse-only
                  tooltip, so the state was invisible to screen readers. An sr-only
                  label announces it in reading order — better than making it
                  focusable, which would add a tab stop per row to an already
                  tab-stop-heavy list for something that isn't an action. */}
              <span className="text-micro font-semibold text-primary-ink">
                <span aria-hidden>$</span>
                <span className="sr-only">Billable</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>Billable</TooltipContent>
          </Tooltip>
        )}

        {/* Time range — click to edit start/stop + date inline. A running entry
            has no stop yet but its start is just as correctable, and it used to
            be the one row you couldn't fix without opening the sheet. */}
        <span className="relative hidden sm:inline-flex">
          <SavedTick saved={savedRange.saved} />
          <TimeRangePopover
            start={entry.start}
            stop={entry.stop}
            onChange={handleRangeChange}
            // font-mono + tabular-nums + a fixed width, like the duration
            // beside it. Without them this was the one number in the row that
            // wasn't in a column: proportional digits made the trigger's width
            // depend on which digits it held, which walked the billable "$"
            // before it across a measured 13px down a single list while the
            // durations held an exact column. DESIGN.md §8 asks for tabular
            // figures in any list column, and this is the app's most-read list.
            //
            // The width is per-format because 12h is genuinely wider and its
            // strings are ragged ("9:00 AM" vs "11:15 AM"); justify-end pulls
            // the short ones into the same right edge.
            triggerClassName={cn(
              "flex items-center justify-end gap-1 px-1 font-mono text-xs tabular-nums text-muted-foreground",
              timeFormat === "12h" ? "w-[9.25rem]" : "w-[6.5rem]"
            )}
          >
            <span>{formatEntryTime(entry.start, timeFormat)}</span>
            <span>–</span>
            <span>
              {entry.stop ? formatEntryTime(entry.stop, timeFormat) : "…"}
            </span>
          </TimeRangePopover>
        </span>

        {/* Duration — click to edit */}
        {editingDuration ? (
          <input
            autoFocus
            value={durationInput}
            onChange={(e) => {
              setDurationInput(e.target.value);
              if (durationInvalid) setDurationInvalid(false);
            }}
            onBlur={handleSaveDuration}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveDuration();
              if (e.key === "Escape") cancelDurationEdit();
            }}
            aria-label="Duration"
            aria-invalid={durationInvalid}
            // "1h 30m" needs more room than "01:30:00" did, and the width has to
            // match the button below or the row shifts on every click.
            title={durationInvalid ? "Enter a duration like 1h 30m, 1:30, or 90m" : undefined}
            className={cn(
              "w-20 bg-transparent text-right font-mono text-sm tabular-nums outline-none ring-0 border-b",
              durationInvalid ? "border-destructive text-destructive" : "border-primary"
            )}
          />
        ) : (
          <span className="relative">
            <SavedTick saved={savedDuration.saved} />
            <button
              onClick={handleStartEditDuration}
              className="relative min-w-20 rounded-sm text-right font-mono text-sm tabular-nums transition-colors duration-fast ease-out-quart before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] hover:text-primary-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {entry.duration ? formatDurationShort(entry.duration) : "–"}
            </button>
          </span>
        )}

        {/* Actions (visible on hover) */}
        <div className="tt-reveal flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Continue timing this entry"
                onClick={handleContinue}
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Continue</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Entry actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEntryEditor(entry.id)}>
                <Edit2 className="mr-2 h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleContinue}>
                <Play className="mr-2 h-3.5 w-3.5" />
                Continue
              </DropdownMenuItem>
              {integration && (
                <DropdownMenuItem
                  onClick={handlePush}
                  disabled={isPushing || (!isCompleted && entry.syncStatus !== "error")}
                >
                  <Upload className="mr-2 h-3.5 w-3.5" />
                  {entry.syncStatus === "synced"
                    ? "Push again"
                    : entry.syncStatus === "error"
                      ? "Retry push"
                      : "Push to integration"}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={handleDelete}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
}
