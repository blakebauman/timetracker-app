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
 * A small set of mutually exclusive values, shown all at once.
 *
 * Settings had two of these hand-rolled and diverging: time format was a
 * bordered pill group with a brand-red active segment, and theme was a single
 * unlabelled sun icon opening a menu — which meant the one three-state setting
 * on the page never showed which of its three states was active. They sat two
 * rows apart.
 *
 * The active segment is a solid --foreground pill on a --muted track. It is
 * deliberately NOT the brand red: the one accent is spent on primary actions
 * and the running timer, and a settings row is neither. Ink-on-track is the
 * highest-contrast way to say "this one" without reaching for hue at all,
 * which also means it survives a colour-blind reader unchanged.
 *
 * It replaced a lift-to-`bg-background`-with-a-shadow treatment, which stopped
 * working once cards went borderless and recessed: the "lifted" segment and
 * the page behind it were then the same value, so the control read as flat.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex w-fit items-center rounded-full bg-muted p-[3px]",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors duration-fast ease-out-quart",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
