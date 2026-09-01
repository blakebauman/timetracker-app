import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        // Neutral track, not `bg-primary/20`.
        //
        // A tinted track is the same colour as the fill, so an *empty* bar reads
        // as a full one: a task at `0m / 1h` rendered a full-width red channel,
        // indistinguishable in shape from one that had burnt its whole estimate,
        // and in dark mode — where --primary is the brighter red over a charcoal
        // ground — the two were separated only by saturation. On a plan-vs-actual
        // surface that is the one thing the bar exists to tell you apart.
        //
        // It also spent the accent on work that hadn't started, against the One
        // Accent Rule (DESIGN.md §8): red marks the running timer and the primary
        // action, not every unbegun estimate.
        //
        // Callers that mean something by their track still win — SummaryCards'
        // `bg-success/15`, ProjectList's `bg-warning/20` past 80% of budget —
        // because those come through `className` and merge over this.
        "relative h-2 w-full overflow-hidden rounded-full bg-border",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-all duration-base ease-out-quart"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
