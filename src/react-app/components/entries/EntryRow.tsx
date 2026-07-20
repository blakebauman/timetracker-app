import { useState } from "react";
import { toast } from "sonner";
import { Play, Trash2, MoreHorizontal, Edit2, Upload, Check, AlertTriangle, Loader2 } from "lucide-react";
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
import { EntryForm } from "./EntryForm";
import { TimeRangePopover } from "./TimeRangePopover";
import { useUpdateEntry, useDeleteEntry, useCreateEntry } from "@/hooks/useEntries";
import { useProjects, useTagColors } from "@/hooks/useProjects";
import { usePushEntries, useIntegrations } from "@/hooks/useIntegrations";
import { useTimer } from "@/hooks/useTimer";
import { cn } from "@/lib/utils";
import { formatSeconds, formatDurationShort, formatShortDate, formatEntryTime, parseTimeInput } from "@/lib/dateUtils";
import { toCreatePayload } from "@/lib/entryUtils";
import { useUIStore } from "@/stores/uiStore";
import { useSavedFlash } from "@/hooks/useSavedFlash";
import { SavedTick } from "./SavedTick";
import { ColorDot } from "@/components/ColorDot";
import { ProjectBadge } from "@/components/ProjectBadge";
import type { TimeEntry } from "@shared/schemas";

interface EntryRowProps {
  entry: TimeEntry;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function EntryRow({ entry, isSelected = false, onToggleSelect }: EntryRowProps) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(entry.description);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationInput, setDurationInput] = useState("");
  const [removing, setRemoving] = useState(false);
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
  // A toast elsewhere (e.g. "Stopped 2h 30m with no project") can request this
  // row's editor; treat that as equivalent to opening it from the row menu.
  const editRequested = useUIStore((s) => s.editEntryId === entry.id);
  const closeEntryEditor = useUIStore((s) => s.closeEntryEditor);
  const editorOpen = showEditDialog || editRequested;

  const closeEditor = () => {
    setShowEditDialog(false);
    if (editRequested) closeEntryEditor();
  };

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
    setDurationInput(entry.duration ? formatSeconds(entry.duration) : "");
    setEditingDuration(true);
  };

  const handleSaveDuration = () => {
    setEditingDuration(false);
    const parsed = parseTimeInput(durationInput);
    if (parsed !== null && parsed > 0 && entry.start) {
      const newStop = new Date(new Date(entry.start).getTime() + parsed * 1000).toISOString();
      updateEntry.mutate(
        { id: entry.id, data: { stop: newStop } },
        { onSuccess: savedDuration.flash }
      );
    }
  };

  const handleContinue = () => {
    startTimer({
      description: entry.description,
      projectId: entry.projectId,
      billable: entry.billable,
    });
  };

  // Play the exit animation first, then actually delete once it finishes. The
  // reduced-motion guard collapses the animation to ~0ms, so those users get an
  // immediate delete.
  const finalizeDelete = () => {
    const payload = toCreatePayload(entry);
    deleteEntry.mutate(entry.id);
    toast.success("Entry deleted", {
      action: {
        label: "Undo",
        onClick: () => createEntry.mutate(payload),
      },
    });
  };

  const handleDelete = () => setRemoving(true);

  return (
    <>
      <div
        onAnimationEnd={(e) => {
          if (removing && e.target === e.currentTarget) finalizeDelete();
        }}
        className={cn(
          "group flex items-center gap-3 border-b border-border-strong px-4 py-2.5 transition-colors hover:bg-accent/40",
          removing
            ? "pointer-events-none animate-out fade-out slide-out-to-right-4 fill-mode-forwards duration-200 ease-out"
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
            className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors before:absolute before:-inset-1.5 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
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
              className="rounded-sm text-left text-sm transition-colors hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setEditingDesc(true)}
            >
              {entry.description || (
                <span className="italic text-muted-foreground">
                  No description
                </span>
              )}
            </button>
          )}

          {/* Project + tags row */}
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {entry.projectName && (
              <ProjectBadge name={entry.projectName} color={entry.projectColor} />
            )}
            {entry.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="h-4 gap-1 px-1 py-0 text-[10px] font-normal"
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
                    ? "text-success"
                    : entry.syncStatus === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"
                )}
              >
                {isPushing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
              <span className="text-[11px] font-semibold text-primary-ink">
                <span aria-hidden>$</span>
                <span className="sr-only">Billable</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>Billable</TooltipContent>
          </Tooltip>
        )}

        {/* Time range — click to edit start/stop + date inline (running
            entries have no stop yet, so they stay plain text). */}
        {entry.stop ? (
          <span className="relative hidden sm:inline-flex">
          <SavedTick saved={savedRange.saved} />
          <TimeRangePopover
            start={entry.start}
            stop={entry.stop}
            onChange={({ start, stop }) =>
              updateEntry.mutate(
                { id: entry.id, data: { start, stop } },
                { onSuccess: savedRange.flash }
              )
            }
            triggerClassName="hidden text-xs text-muted-foreground sm:flex items-center gap-1 px-1"
          >
            <span>{formatEntryTime(entry.start, timeFormat)}</span>
            <span>–</span>
            <span>{formatEntryTime(entry.stop, timeFormat)}</span>
          </TimeRangePopover>
          </span>
        ) : (
          <div className="hidden text-xs text-muted-foreground sm:flex items-center gap-1">
            <span>{formatEntryTime(entry.start, timeFormat)}</span>
            <span>–</span>
            <span>...</span>
          </div>
        )}

        {/* Duration — click to edit */}
        {editingDuration ? (
          <input
            autoFocus
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            onBlur={handleSaveDuration}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveDuration();
              if (e.key === "Escape") setEditingDuration(false);
            }}
            className="w-16 bg-transparent text-right font-mono text-sm tabular-nums outline-none ring-0 border-b border-primary"
          />
        ) : (
          <span className="relative">
            <SavedTick saved={savedDuration.saved} />
            <button
              onClick={handleStartEditDuration}
              className="min-w-16 rounded-sm text-right font-mono text-sm tabular-nums transition-colors hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
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

      {editorOpen && (
        <EntryForm entry={entry} open={editorOpen} onClose={closeEditor} />
      )}
    </>
  );
}
