import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { DescriptionAutocomplete } from "@/components/timer/DescriptionAutocomplete";
import { ProjectPicker } from "./ProjectPicker";
import { TaskPicker } from "./TaskPicker";
import { TagPicker } from "./TagPicker";
import { TimeOfDayInput } from "./TimeOfDayInput";
import type { useEntryDraft } from "@/hooks/useEntryDraft";

type Draft = ReturnType<typeof useEntryDraft>;

interface EntryFormSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Verb + object, e.g. "Add entry" / "Save changes". */
  submitLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  onSubmit: () => void;
  draft: Draft;
  /** Edit allows a running entry (no stop); create requires a full span. */
  requireRange?: boolean;
  /** Slot above the footer, e.g. the calendar's "tracking a Google event" note. */
  children?: ReactNode;
}

/**
 * The one shell every time-entry form uses.
 *
 * Creating and editing the same object used to be two different products: a
 * centered dialog with a ghost Cancel and no Duration field, versus a right sheet
 * titled "Edit Time Entry" with an outline Cancel and a Duration field — plus a
 * third variant on the calendar. Same fields, three shells, three copies of the
 * state logic.
 *
 * A sheet rather than a dialog for all of them: the form is tall (a textarea,
 * five field groups, a three-across time row and a switch), and a sheet gives it
 * full viewport height with a scrolling body and a pinned footer instead of a
 * centered box that has to scroll inside itself.
 */
export function EntryFormSheet({
  open,
  onClose,
  title,
  submitLabel,
  pendingLabel = "Saving…",
  pending = false,
  onSubmit,
  draft,
  requireRange = true,
  children,
}: EntryFormSheetProps) {
  const { draft: d, patch, setDate, anchorDate } = draft;
  // A create needs a full span. An edit only has to not be *inverted*: a running
  // entry has no stop yet, and a zero-length entry may already exist and still
  // needs its description fixable. `requireRange: false` used to mean no check at
  // all, so Save stayed enabled while the form showed "Stop time must be after
  // start time" right below it and the only real feedback was the server's 400.
  const rangeError = requireRange ? !draft.hasValidRange : draft.rangeInverted;
  const canSubmit = !rangeError;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="entry-description">Description</Label>
            {/* Selecting a suggestion replaces project/task/billable AND tags —
                an explicit "make it like last time", even over tags already
                picked below; the TagPicker shows the result for easy fix-up. */}
            <DescriptionAutocomplete
              multiline
              id="entry-description"
              value={d.description}
              onChange={(description) => patch({ description })}
              onSelect={(s) =>
                patch({
                  description: s.description,
                  projectId: s.projectId,
                  taskId: s.taskId,
                  billable: s.billable,
                  tags: s.tags,
                })
              }
              className="min-h-20 resize-none"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Project</Label>
            <ProjectPicker
              value={d.projectId}
              onChange={(id) => patch({ projectId: id, taskId: null })}
            />
          </div>

          {d.projectId && (
            <div className="space-y-1.5">
              <Label>Task</Label>
              <TaskPicker
                projectId={d.projectId}
                value={d.taskId}
                onChange={(id) => patch({ taskId: id })}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Tags</Label>
            <TagPicker value={d.tags} onChange={(tags) => patch({ tags })} />
          </div>

          <div className="space-y-1.5">
            <Label>Date</Label>
            <DatePicker value={anchorDate} onSelect={setDate} />
          </div>

          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>Start</Label>
              <TimeOfDayInput
                value={d.start}
                fallbackIso={draft.fallbackIso}
                onChange={(iso) => patch({ start: iso })}
                allowClear
                ariaLabel="Start time"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label>Stop</Label>
              <TimeOfDayInput
                value={d.stop}
                fallbackIso={d.stop ?? draft.fallbackIso}
                onChange={(iso) => patch({ stop: iso })}
                allowClear
                ariaLabel="Stop time"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="entry-duration">Duration</Label>
              <Input
                id="entry-duration"
                value={draft.durationText}
                onChange={(e) => draft.setDurationText(e.target.value)}
                onBlur={draft.commitDuration}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    draft.commitDuration();
                    e.currentTarget.blur();
                  }
                }}
                disabled={!d.start || d.stop === null}
                placeholder={d.stop === null ? "—" : undefined}
              />
            </div>
          </div>

          {/* No "Duration: 1h" helper line: the create dialog carried one because
              it had no Duration field, and now every form does — it would restate
              the value sitting directly above it. */}
          {d.start && d.stop && rangeError && (
            <p className="text-xs text-destructive">Stop time must be after start time.</p>
          )}

          {children}

          <div className="flex items-center gap-3">
            <Switch
              id="entry-billable"
              checked={d.billable}
              onCheckedChange={(billable) => patch({ billable })}
            />
            <Label htmlFor="entry-billable">Billable</Label>
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={!canSubmit || pending}>
            {pending ? pendingLabel : submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
