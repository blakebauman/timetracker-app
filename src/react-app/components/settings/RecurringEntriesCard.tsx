import { useState } from "react";
import { Plus, Pencil, Trash2, Repeat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ProjectBadge } from "@/components/ProjectBadge";
import { RecurringEntryDialog } from "./RecurringEntryDialog";
import {
  useRecurringEntries,
  useUpdateRecurring,
  useDeleteRecurring,
} from "@/hooks/useRecurring";
import {
  utcScheduleToLocal,
  minutesToHHMM,
  formatDays,
} from "@/lib/recurrence";
import { formatDurationShort } from "@/lib/dateUtils";
import type { RecurringEntry } from "@shared/schemas";

function scheduleLabel(r: RecurringEntry): string {
  const { days, minutes } = utcScheduleToLocal(r.daysOfWeek, r.timeUtcMinutes);
  return `${formatDays(days)} · ${minutesToHHMM(minutes)} · ${formatDurationShort(r.durationSeconds)}`;
}

export function RecurringEntriesCard() {
  const { data: items = [] } = useRecurringEntries();
  const updateRecurring = useUpdateRecurring();
  const deleteRecurring = useDeleteRecurring();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringEntry | null>(null);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (r: RecurringEntry) => {
    setEditing(r);
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Repeat className="h-4 w-4" />
          Recurring entries
        </CardTitle>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm leading-normal text-muted-foreground">
            Auto-log routine time — a standup, a daily review — on a weekly schedule.
            New occurrences are created automatically at the scheduled time.
          </p>
        ) : (
          items.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {r.description || <span className="text-muted-foreground">(no description)</span>}
                  </span>
                  {r.projectName && <ProjectBadge name={r.projectName} color={r.projectColor} />}
                </div>
                <p className="truncate text-xs text-muted-foreground">{scheduleLabel(r)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Switch
                  checked={r.active}
                  onCheckedChange={(checked) =>
                    updateRecurring.mutate({ id: r.id, data: { active: checked } })
                  }
                  aria-label={r.active ? "Pause" : "Resume"}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  onClick={() => openEdit(r)}
                  aria-label="Edit recurring entry"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => deleteRecurring.mutate(r.id)}
                  aria-label="Delete recurring entry"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      {dialogOpen && (
        <RecurringEntryDialog
          key={editing?.id ?? "new"}
          open={dialogOpen}
          editing={editing}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </Card>
  );
}
