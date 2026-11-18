import * as React from "react"
import { cn } from "@/lib/utils"

// AI Elements' Bubble (shadcn registry), trimmed to the one bubble the
// Assistant draws: the user's turn, recessed on --muted with a hairline and
// a 12px container corner. The registry's other variants (tinted, outline,
// destructive…) and reactions were first-load CSS for nothing.

function Bubble({
  align = "start",
  className,
  ...props
}: React.ComponentProps<"div"> & { align?: "start" | "end" }) {
  return (
    <div
      data-slot="bubble"
      data-align={align}
      className={cn(
        "group/bubble relative flex w-fit max-w-[80%] min-w-0 flex-col gap-1 data-[align=end]:self-end",
        className
      )}
      {...props}
    />
  )
}

function BubbleContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bubble-content"
      className={cn(
        "w-fit max-w-full min-w-0 overflow-hidden rounded-container border border-border bg-muted px-3.5 py-2.5 text-sm leading-relaxed wrap-break-word group-data-[align=end]/bubble:self-end",
        className
      )}
      {...props}
    />
  )
}

export { Bubble, BubbleContent }
