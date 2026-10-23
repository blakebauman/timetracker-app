import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHydrateSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useUIStore } from "@/stores/uiStore";
import { DEFAULT_WORKDAY, workdayLabel } from "@/lib/taskUtils";

/** Same quarter-hour-friendly grid as the plan: half hours are enough for a day's edges. */
const STEP = 30;
const MINUTES = Array.from({ length: 1440 / STEP + 1 }, (_, i) => i * STEP);

/**
 * Working hours: the window "Plan my day" (and the Assistant's planDay) fits
 * tasks into. Two selects rather than a range slider — the edges of a day are
 * two separate facts, and each wants to be read exactly.
 *
 * The end list only offers times after the start, and moving the start past
 * the end carries the end along, so the pair can't be set backwards (the
 * server refuses that too).
 */
export function WorkingHoursRow() {
  const { data: settings } = useHydrateSettings();
  const updateSettings = useUpdateSettings();
  const timeFormat = useUIStore((s) => s.timeFormat);
  const start = settings?.workdayStartMinute ?? DEFAULT_WORKDAY.start;
  const end = settings?.workdayEndMinute ?? DEFAULT_WORKDAY.end;

  const setStart = (next: number) =>
    updateSettings.mutate({
      workdayStartMinute: next,
      workdayEndMinute: end > next ? end : Math.min(1440, next + (end - start)),
    });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Label htmlFor="pref-workday-start">Working hours</Label>
        <p className="mt-1 text-xs leading-normal text-muted-foreground">
          Plan my day fits your tasks between these times
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Select value={String(start)} onValueChange={(v) => setStart(Number(v))}>
          <SelectTrigger
            id="pref-workday-start"
            aria-label="Working hours start"
            className="w-28 text-sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MINUTES.filter((m) => m < 1440).map((m) => (
              <SelectItem key={m} value={String(m)}>
                {workdayLabel(m, timeFormat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground" aria-hidden>
          to
        </span>
        <Select
          value={String(end)}
          onValueChange={(v) => updateSettings.mutate({ workdayEndMinute: Number(v) })}
        >
          <SelectTrigger aria-label="Working hours end" className="w-28 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MINUTES.filter((m) => m > start).map((m) => (
              <SelectItem key={m} value={String(m)}>
                {workdayLabel(m, timeFormat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
