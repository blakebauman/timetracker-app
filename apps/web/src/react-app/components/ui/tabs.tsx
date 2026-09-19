import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

/**
 * Two variants, two jobs.
 *
 * `default` is the segment track (see `SegmentedControl`): a recessed pill on
 * a muted track, for swapping panels inside a pane (Reports' Summary / Weekly
 * / Detailed).
 *
 * `line` is the Settings navigation: a hairline under the whole
 * strip, and the active tab carries a 1px brand-red underline sitting on it.
 * It is the only place the accent appears as a line, and it is spent on the
 * one navigation that is itself a page (Settings).
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        default:
          "h-8 rounded-full border bg-muted p-[3px] group-data-[orientation=horizontal]/tabs:h-8",
        line: "h-auto w-full justify-start gap-1 rounded-none border-b bg-transparent p-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-sm font-medium text-muted-foreground transition-colors duration-fast ease-out-quart group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start data-[state=inactive]:hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Segment pill.
        "group-data-[variant=default]/tabs-list:h-full group-data-[variant=default]/tabs-list:flex-1 group-data-[variant=default]/tabs-list:rounded-full group-data-[variant=default]/tabs-list:border group-data-[variant=default]/tabs-list:border-transparent group-data-[variant=default]/tabs-list:px-3",
        "group-data-[variant=default]/tabs-list:data-[state=active]:border-border group-data-[variant=default]/tabs-list:data-[state=active]:bg-background group-data-[variant=default]/tabs-list:data-[state=active]:text-foreground group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm",
        // Underline tab. `-mb-px` sits the accent line ON the strip's hairline.
        "group-data-[variant=line]/tabs-list:-mb-px group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:border-b group-data-[variant=line]/tabs-list:border-transparent group-data-[variant=line]/tabs-list:px-4 group-data-[variant=line]/tabs-list:py-2",
        "group-data-[variant=line]/tabs-list:data-[state=active]:border-primary group-data-[variant=line]/tabs-list:data-[state=active]:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      // Radix gives the panel `tabindex="0"` so keyboard users land on the
      // content after the tablist; the house ring marks that stop.
      className={cn(
        "flex-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
