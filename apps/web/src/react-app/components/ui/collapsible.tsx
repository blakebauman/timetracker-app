"use client"

import { Collapsible as CollapsiblePrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

function CollapsibleContent({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      // Every disclosure in the app — day groups, description groups, a
      // project's task list — used to snap open with no animation at all,
      // while its own chevron rotated smoothly next to it. The keyframes
      // interpolate against `--radix-collapsible-content-height`, which Radix
      // measures onto this element; `overflow-hidden` is what keeps the
      // content clipped to that height instead of spilling as it moves.
      className={cn(
        "overflow-hidden duration-base ease-out-quart data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
        className
      )}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
