"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

// AI Elements' Input Group (shadcn registry), trimmed to the Assistant's
// composer: a recessed well holding a textarea, with an inline-end addon for
// its one button. The registry's block/inline-start alignments, InputGroupInput
// and InputGroupText, and its combobox/kbd hooks were first-load CSS for
// nothing — add one back when something renders it.

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        "group/input-group relative flex w-full min-w-0 items-end rounded-container border border-input bg-background transition-[color,box-shadow] duration-fast ease-out-quart outline-none has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-[3px] has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50",
        className
      )}
      {...props}
    />
  )
}

/** Sits at the inline end, bottom-aligned as the field grows. */
function InputGroupAddon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      className={cn("order-last flex shrink-0 items-center gap-2 py-2 pr-2", className)}
      {...props}
    />
  )
}

/**
 * An icon button in the addon: 32px, with the coarse-pointer hit area every
 * icon Button carries (ui/button.tsx), since this replaces Button's sizes.
 */
function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size">) {
  return (
    <Button
      type={type}
      variant={variant}
      className={cn(
        "relative size-8 rounded-full p-0 shadow-none has-[>svg]:p-0 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']",
        className
      )}
      {...props}
    />
  )
}

function InputGroupTextarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        "flex-1 resize-none rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 dark:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea }
