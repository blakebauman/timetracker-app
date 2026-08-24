import { useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronLeft,
  Repeat,
  SquareDashed,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { BillableToggle } from "@/components/timer/BillableToggle";
import {
  useDrafts,
  useUpdateDraft,
  useDiscardDraft,
  useConfirmDrafts,
} from "@/hooks/useDrafts";
import { useEntriesRange } from "@/hooks/useEntries";
import { useUIStore } from "@/stores/uiStore";
import {
  formatDurationShort,
  formatEntryTime,
  formatPlainDate,
  parseTimeInput,
  formatTimeInput,
} from "@/lib/dateUtils";
import type { DraftEntry, DraftSource } from "@shared/schemas";

const SOURCE_ICON: Record<DraftSource, typeof CalendarClock> = {
  calendar: CalendarClock,
  gap: SquareDashed,
  pattern: Repeat,
};

const SOURCE_LABEL: Record<DraftSource, string> = {
  calendar: "From your calendar",
  gap: "Unaccounted time",
  pattern: "Weekly habit",
};

/** Nudge a draft's length without opening a time picker. */
const ADJUST_STEPS = [-30, -15, 15, 30];

interface DraftReviewDialogProps {
  open: boolean;
  /** Local 'YYYY-MM-DD' the review covers. */
  localDate: string;
  onClose: () => void;
}

/**
 * Review: confirm a drafted day one card at a time.
 *
 * The shape is deliberate. A drafted day is a list of claims about what someone
 * did, and a list is the wrong way to check claims — the eye slides over it and
 * the whole day gets approved in one click, which is how a plausible-but-wrong
 * entry ends up on an invoice. One card at a time forces a decision per entry
 * and makes each decision cheap: keep, fix the project, rename it, nudge the
 * minutes, or throw it away.
 *
 * The last card is the one that matters most: the day's *total*. Individually
 * plausible entries can still add up to a number the user won't stand behind,
 * and correcting that by hand-editing five entries is work nobody does. Setting
 * the total scales the batch proportionally instead.
 */
export function DraftReviewDialog({ open, localDate, onClose }: DraftReviewDialogProps) {
  const { data: drafts = [], isLoading } = useDrafts(localDate, open);
  const updateDraft = useUpdateDraft(localDate);
  const discardDraft = useDiscardDraft(localDate);
  const confirmDrafts = useConfirmDrafts(localDate);
  const timeFormat = useUIStore((s) => s.timeFormat);

  // Time already on the timesheet for this day — the total card reports the
  // whole day, not just the part being confirmed.
  const dayStart = useMemo(() => new Date(`${localDate}T00:00:00`), [localDate]);
  const dayEnd = useMemo(
    () => new Date(dayStart.getTime() + 86_400_000),
    [dayStart]
  );
  const { data: dayEntries = [] } = useEntriesRange(
    dayStart.toISOString(),
    dayEnd.toISOString(),
    { enabled: open }
  );
  const confirmedSeconds = dayEntries
    .filter((e) => e.stop)
    .reduce((sum, e) => sum + (e.duration ?? 0), 0);

  const [index, setIndex] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  // Only the user's OWN number is state. Until they type one, the field shows
  // the running total derived from the cards — so nudging a card's minutes moves
  // it, without an effect syncing two sources of truth.
  const [typedTotal, setTypedTotal] = useState<string | null>(null);

  const draftSeconds = drafts.reduce((sum, d) => sum + d.duration, 0);
  const proposedTotal = confirmedSeconds + draftSeconds;
  const totalInput = typedTotal ?? formatTimeInput(proposedTotal);

  const onTotalCard = index >= drafts.length;
  const current = drafts[index];

  const goNext = () => setIndex((i) => Math.min(i + 1, drafts.length));
  const goBack = () => setIndex((i) => Math.max(0, i - 1));

  const handleDiscard = (draft: DraftEntry) => {
    discardDraft.mutate(draft.id);
    // The list shortens under us, so staying put lands on the next card.
    setIndex((i) => Math.min(i, Math.max(0, drafts.length - 2)));
  };

  const adjustMinutes = (draft: DraftEntry, deltaMinutes: number) => {
    const nextDuration = Math.max(60, draft.duration + deltaMinutes * 60);
    updateDraft.mutate({
      id: draft.id,
      data: {
        stop: new Date(new Date(draft.start).getTime() + nextDuration * 1000).toISOString(),
      },
    });
  };

  const parsedTotal = parseTimeInput(totalInput);
  const targetDayTotal = parsedTotal ?? proposedTotal;
  // The API scales the drafts, so translate a day total into a drafts total.
  // Never below a minute per draft: scaling an entry out of existence is a
  // delete, and a delete should be an explicit act.
  const draftTarget = Math.max(drafts.length * 60, targetDayTotal - confirmedSeconds);
  const willScale = drafts.length > 0 && Math.abs(draftTarget - draftSeconds) > 30;

  const handleConfirm = () => {
    if (!drafts.length) return;
    confirmDrafts.mutate(
      {
        ids: drafts.map((d) => d.id),
        reportedTotalSeconds: willScale ? draftTarget : null,
      },
      { onSuccess: onClose }
    );
  };

  const progress = drafts.length ? (Math.min(index, drafts.length) / drafts.length) * 100 : 100;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review {formatPlainDate(localDate, "EEEE, MMM d")}</DialogTitle>
          <DialogDescription>
            {drafts.length === 0
              ? "Nothing is waiting for review on this day."
              : onTotalCard
                ? "One last look at the day's total."
                : `Entry ${index + 1} of ${drafts.length} — keep it, fix it, or throw it away.`}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" className="text-muted-foreground" />
          </div>
        ) : drafts.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Draft the day from the Timer header to see proposals here.
          </div>
        ) : (
          <>
            <Progress value={progress} className="h-1" aria-label="Review progress" />

            {onTotalCard ? (
              <div className="space-y-4 py-2">
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-sm font-medium">How much time should we report?</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {confirmedSeconds > 0 && (
                      <>
                        {formatDurationShort(confirmedSeconds)} already tracked ·{" "}
                      </>
                    )}
                    {formatDurationShort(draftSeconds)} drafted
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      value={totalInput}
                      onChange={(e) => setTypedTotal(e.target.value)}
                      aria-label="Total time to report for the day"
                      className="h-9 w-28 font-mono tabular-nums"
                    />
                    <span className="text-xs text-muted-foreground">
                      for the whole day
                    </span>
                  </div>
                  {/* Say what the number will do before it does it. Silent
                      rescaling of five entries is exactly the kind of edit
                      someone needs to see coming. */}
                  {willScale && (
                    <p className="mt-3 text-xs text-warning-ink">
                      The {drafts.length} drafted{" "}
                      {drafts.length === 1 ? "entry" : "entries"} will be scaled to fit —{" "}
                      {formatDurationShort(draftSeconds)} → {formatDurationShort(draftTarget)}.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={goBack}>
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleConfirm}
                    disabled={confirmDrafts.isPending}
                    className="gap-1.5"
                  >
                    {confirmDrafts.isPending ? (
                      <Spinner size="sm" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Add {drafts.length} to timesheet
                  </Button>
                </div>
              </div>
            ) : current ? (
              <DraftCard
                key={current.id}
                draft={current}
                timeFormat={timeFormat}
                renaming={renaming === current.id}
                onStartRename={() => setRenaming(current.id)}
                onRename={(description) => {
                  updateDraft.mutate({ id: current.id, data: { description } });
                  setRenaming(null);
                }}
                onCancelRename={() => setRenaming(null)}
                onProject={(projectId) =>
                  updateDraft.mutate({ id: current.id, data: { projectId } })
                }
                onBillable={(billable) =>
                  updateDraft.mutate({ id: current.id, data: { billable } })
                }
                onAdjust={(delta) => adjustMinutes(current, delta)}
                onDiscard={() => handleDiscard(current)}
                onKeep={goNext}
                onBack={index > 0 ? goBack : undefined}
              />
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface DraftCardProps {
  draft: DraftEntry;
  timeFormat: "24h" | "12h";
  renaming: boolean;
  onStartRename: () => void;
  onRename: (description: string) => void;
  onCancelRename: () => void;
  onProject: (projectId: string | null) => void;
  onBillable: (billable: boolean) => void;
  onAdjust: (deltaMinutes: number) => void;
  onDiscard: () => void;
  onKeep: () => void;
  onBack?: () => void;
}

function DraftCard({
  draft,
  timeFormat,
  renaming,
  onStartRename,
  onRename,
  onCancelRename,
  onProject,
  onBillable,
  onAdjust,
  onDiscard,
  onKeep,
  onBack,
}: DraftCardProps) {
  // Seeded once per card — the card is keyed by draft id, so switching cards
  // remounts it rather than syncing state through an effect.
  const [draftText, setDraftText] = useState(draft.description);

  const SourceIcon = SOURCE_ICON[draft.source];

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SourceIcon className="h-3.5 w-3.5" />
          <span>{SOURCE_LABEL[draft.source]}</span>
          {draft.confidence === "low" && (
            <Badge variant="outline" className="text-micro">
              Low confidence
            </Badge>
          )}
        </div>

        {renaming ? (
          <div className="mt-2 flex items-center gap-2">
            <Input
              autoFocus
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRename(draftText);
                if (e.key === "Escape") onCancelRename();
              }}
              placeholder="What was this?"
              aria-label="Entry description"
              className="h-9"
            />
            <Button size="sm" onClick={() => onRename(draftText)}>
              Save
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartRename}
            className="mt-2 block w-full rounded text-left text-sm font-medium transition-colors duration-fast ease-out-quart hover:text-muted-foreground"
            title="Rename this entry"
          >
            {draft.description || (
              <span className="text-muted-foreground italic">
                Click to describe this time
              </span>
            )}
          </button>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">
            {formatEntryTime(draft.start, timeFormat)}–
            {formatEntryTime(draft.stop, timeFormat)}
          </span>
          <span aria-hidden>·</span>
          <span className="font-semibold tabular-nums text-foreground">
            {formatDurationShort(draft.duration)}
          </span>
        </div>

        {/* Why this was proposed. A proposal the user can't account for is one
            they can't judge — and an unjudgeable proposal gets rubber-stamped. */}
        {draft.reason && (
          <p className="mt-2 text-xs text-muted-foreground">{draft.reason}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ProjectPicker value={draft.projectId} onChange={onProject} compact />
          <BillableToggle value={draft.billable} onChange={onBillable} />
          <div className="ml-auto flex items-center gap-1">
            {ADJUST_STEPS.map((step) => (
              <Button
                key={step}
                variant="outline"
                size="sm"
                className="h-7 px-2 font-mono text-micro tabular-nums"
                onClick={() => onAdjust(step)}
                aria-label={`${step > 0 ? "Add" : "Remove"} ${Math.abs(step)} minutes`}
              >
                {step > 0 ? `+${step}` : step}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            className="text-muted-foreground"
          >
            <Trash2 className="h-4 w-4" />
            Discard
          </Button>
        </div>
        <Button size="sm" onClick={onKeep} className="gap-1.5">
          <Check className="h-4 w-4" />
          Keep
        </Button>
      </div>
    </div>
  );
}
