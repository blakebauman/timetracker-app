import { cn } from "@/lib/utils"

/**
 * A keyboard chip.
 *
 * There were five of these hand-rolled across four files in four different
 * shapes — three heights (h-5, h-6, none), three paddings (px-1, px-1.5, px-2)
 * and two font sizes — for what is one element with one job. DESIGN.md §3
 * already names `kbd` shortcut chips as a Micro-tier element; this is that
 * decision made once.
 *
 * Structure follows the registry's `kbd` (data-slot, a group wrapper, the
 * tooltip-content context override); the size and weight stay the app's own,
 * since Micro is the documented tier and the registry's `text-xs` would make
 * every chip a step larger than the ramp allows for chrome.
 */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 select-none items-center justify-center gap-1 rounded border bg-muted px-1.5 font-mono text-micro font-medium text-foreground",
        "[&_svg:not([class*='size-'])]:size-3",
        // On a tooltip's inverted surface the muted fill and foreground ink both
        // vanish; the registry solves it the same way.
        "[[data-slot=tooltip-content]_&]:border-background/20 [[data-slot=tooltip-content]_&]:bg-background/20 [[data-slot=tooltip-content]_&]:text-background",
        className
      )}
      {...props}
    />
  )
}

/** Wraps a multi-key sequence so the gap between chips is set once. */
function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
