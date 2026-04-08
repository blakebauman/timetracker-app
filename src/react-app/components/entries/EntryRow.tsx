import { useState } from "react";
import { Play, Trash2, MoreHorizontal, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EntryForm } from "./EntryForm";
import { useUpdateEntry, useDeleteEntry } from "@/hooks/useEntries";
import { useTimer } from "@/hooks/useTimer";
import { formatSeconds, formatEntryTime, parseTimeInput } from "@/lib/dateUtils";
import { useUIStore } from "@/stores/uiStore";
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
  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();
  const { startTimer } = useTimer();
  const timeFormat = useUIStore((s) => s.timeFormat);

  const handleDescBlur = () => {
    setEditingDesc(false);
    if (desc !== entry.description) {
      updateEntry.mutate({ id: entry.id, data: { description: desc } });
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
      updateEntry.mutate({ id: entry.id, data: { stop: newStop } });
    }
  };

  const handleContinue = () => {
    startTimer({
      description: entry.description,
      projectId: entry.projectId,
      billable: entry.billable,
    });
  };

  return (
    <>
      <div className={`group flex items-center gap-3 border-b px-4 py-2.5 hover:bg-accent/40 transition-colors ${isSelected ? "bg-accent/60" : ""}`}>
        {/* Checkbox (visible on hover or when any selection active) */}
        {onToggleSelect && (
          <button
            onClick={() => onToggleSelect(entry.id)}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:border-primary"
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
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{
            backgroundColor: entry.projectColor ?? "#94a3b8",
          }}
        />

        {/* Description */}
        <div className="min-w-0 flex-1">
          {editingDesc ? (
            <input
              autoFocus
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={handleDescBlur}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="w-full bg-transparent text-sm outline-none ring-0"
            />
          ) : (
            <button
              className="text-left text-sm hover:text-primary transition-colors"
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
              <span
                className="rounded-sm px-1.5 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: `${entry.projectColor}22`,
                  color: entry.projectColor ?? undefined,
                }}
              >
                {entry.projectName}
              </span>
            )}
            {entry.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="h-4 px-1 py-0 text-[10px] font-normal"
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Billable indicator */}
        {entry.billable && (
          <span
            className="text-[10px] font-semibold text-primary"
            title="Billable"
          >
            $
          </span>
        )}

        {/* Time range */}
        <div className="hidden text-xs text-muted-foreground sm:flex items-center gap-1">
          <span>{formatEntryTime(entry.start, timeFormat)}</span>
          <span>–</span>
          <span>{entry.stop ? formatEntryTime(entry.stop, timeFormat) : "..."}</span>
        </div>

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
          <button
            onClick={handleStartEditDuration}
            className="min-w-16 text-right font-mono text-sm tabular-nums hover:text-primary transition-colors"
          >
            {entry.duration ? formatSeconds(entry.duration) : "–"}
          </button>
        )}

        {/* Actions (visible on hover) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Continue"
            onClick={handleContinue}
          >
            <Play className="h-3.5 w-3.5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
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
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => deleteEntry.mutate(entry.id)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {showEditDialog && (
        <EntryForm
          entry={entry}
          open={showEditDialog}
          onClose={() => setShowEditDialog(false)}
        />
      )}
    </>
  );
}
