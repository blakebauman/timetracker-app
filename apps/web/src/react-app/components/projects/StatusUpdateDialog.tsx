import { useMemo, useState } from "react";
import { addWeeks, format, isSameMonth, isSameYear, startOfWeek, subDays } from "date-fns";
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useStatusUpdate } from "@/hooks/useAi";
import { mutationErrorMessage } from "@/lib/api";
import { useUIStore } from "@/stores/uiStore";
import type { Project } from "@timetracker/core/schemas";

type Style = "highlights" | "itemised";

const STYLES = [
  { value: "highlights" as const, label: "Highlights" },
  { value: "itemised" as const, label: "Itemised" },
];

function weekLabel(first: Date, last: Date): string {
  if (!isSameYear(first, last)) return `${format(first, "d MMM yyyy")} – ${format(last, "d MMM yyyy")}`;
  if (!isSameMonth(first, last)) return `${format(first, "d MMM")} – ${format(last, "d MMM yyyy")}`;
  return `${format(first, "d")}–${format(last, "d MMM yyyy")}`;
}

interface StatusUpdateDialogProps {
  project: Pick<Project, "id" | "name">;
  onClose: () => void;
}

/**
 * A week's status update for one project, ready to paste to an engagement
 * lead. The worker builds it from the week's entries and tasks; in the
 * Highlights style the model writes only the opening bullets, and the dialog
 * says so when it fell back to the itemised list instead.
 */
export function StatusUpdateDialog({ project, onClose }: StatusUpdateDialogProps) {
  const weekStart = useUIStore((s) => s.weekStart) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  // Weeks back from the current one; a status update is never about next week.
  const [weeksBack, setWeeksBack] = useState(0);
  const [style, setStyle] = useState<Style>("highlights");

  const { since, until, label } = useMemo(() => {
    const first = startOfWeek(addWeeks(new Date(), -weeksBack), { weekStartsOn: weekStart });
    const next = addWeeks(first, 1);
    return { since: first, until: next, label: weekLabel(first, subDays(next, 1)) };
  }, [weeksBack, weekStart]);

  const request = useMemo(
    () => ({
      projectId: project.id,
      since: since.toISOString(),
      until: until.toISOString(),
      timezoneOffsetMinutes: since.getTimezoneOffset(),
      style,
    }),
    [project.id, since, until, style]
  );
  const draft = useStatusUpdate(request);

  // Edits belong to the draft they were made on: a new week, style or
  // regeneration starts from the new text rather than carrying stale edits.
  const [edit, setEdit] = useState<{ at: number; text: string } | null>(null);
  const text = edit && edit.at === draft.dataUpdatedAt ? edit.text : (draft.data?.text ?? "");
  const busy = draft.isFetching;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Status update copied");
    } catch {
      toast.error("Couldn't copy — select the text and copy it instead.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Status update</DialogTitle>
          <DialogDescription>
            {project.name}, built from the week's entries, tasks and meetings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Previous week"
                title="Previous week"
                onClick={() => setWeeksBack((w) => w + 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-36 text-center text-sm font-medium tabular-nums" aria-live="polite">
                {weeksBack === 0 ? "This week" : weeksBack === 1 ? "Last week" : label}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next week"
                title="Next week"
                disabled={weeksBack === 0}
                onClick={() => setWeeksBack((w) => Math.max(0, w - 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <SegmentedControl label="Update style" options={STYLES} value={style} onChange={setStyle} />
          </div>

          {draft.isError ? (
            <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                {mutationErrorMessage(draft.error, "Couldn't build the status update.")}
              </span>
              <Button variant="outline" size="sm" onClick={() => draft.refetch()}>
                Retry
              </Button>
            </div>
          ) : draft.data?.source === "fallback" ? (
            <p className="text-xs text-muted-foreground">
              Highlights couldn't be drafted just now, so this lists the work itemised.
            </p>
          ) : draft.data?.source === "ai" ? (
            <p className="text-xs text-muted-foreground">
              Highlights are drafted for you. Times and tasks come from your entries.
            </p>
          ) : null}

          {draft.isPending ? (
            <Skeleton className="h-72 w-full rounded-container" aria-label="Drafting status update" />
          ) : (
            <Textarea
              aria-label="Status update text"
              value={text}
              onChange={(e) => setEdit({ at: draft.dataUpdatedAt, text: e.target.value })}
              className="min-h-72 resize-none font-mono text-sm"
              placeholder={draft.isError ? "Nothing drafted yet. Retry, or write your own." : undefined}
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            className="gap-1.5 sm:mr-auto"
            onClick={() => draft.refetch()}
            disabled={busy}
          >
            {busy ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {busy ? "Drafting…" : "Regenerate"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleCopy} disabled={!text || busy} className="gap-1.5">
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
