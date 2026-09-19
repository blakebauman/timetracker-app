import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Names the group for screen readers, e.g. "Time display format". */
  label: string;
  className?: string;
}

/**
 * The segment track. One shape for every "pick one of these" control in the
 * app: a `--muted` track, and the active segment is a recessed `--background`
 * pill with a hairline edge, recessed into the track rather than lifted off it.
 * Ink-on-track (not the brand red): the one accent is spent on the primary
 * action and the running timer, and a settings row is neither.
 *
 * `Tabs` (default variant), `TaskViewTabs`, `TimerViewSwitcher` and the
 * calendar-view radiogroup inside `CalendarViewOptions` render the same pill;
 * `tt-segment` / `tt-segment-active` below are the shared class strings so
 * the five cannot drift.
 */
// `max-w-full overflow-x-auto` + `whitespace-nowrap`: on a phone a four-option
// period track is wider than the header row, and without these the labels
// broke mid-word ("This / month") rather than the track scrolling.
export const SEGMENT_TRACK =
  "inline-flex h-8 w-fit max-w-full shrink-0 items-center overflow-x-auto rounded-full border bg-muted p-[3px]";
export const SEGMENT =
  "flex h-full shrink-0 items-center whitespace-nowrap rounded-full border border-transparent px-3 text-sm font-medium transition-colors duration-fast ease-out-quart focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
export const SEGMENT_ACTIVE = "border-border bg-background text-foreground shadow-sm";
export const SEGMENT_INACTIVE = "text-muted-foreground hover:text-foreground";

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn(SEGMENT_TRACK, className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(SEGMENT, active ? SEGMENT_ACTIVE : SEGMENT_INACTIVE)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
