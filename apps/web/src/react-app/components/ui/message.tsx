import * as React from "react"
import { cn } from "@/lib/utils"

// AI Elements' Message (shadcn registry), trimmed to the parts the Assistant
// uses: a turn, its content column, and the footer for its actions.

function Message({
  className,
  align = "start",
  ...props
}: React.ComponentProps<"div"> & { align?: "start" | "end" }) {
  return (
    <div
      data-slot="message"
      data-align={align}
      className={cn(
        "group/message relative flex w-full min-w-0 gap-2 text-sm data-[align=end]:flex-row-reverse",
        className
      )}
      {...props}
    />
  )
}

function MessageContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-content"
      className={cn("flex w-full min-w-0 flex-col gap-2.5 wrap-break-word", className)}
      {...props}
    />
  )
}

function MessageFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-footer"
      className={cn(
        "flex max-w-full min-w-0 items-center text-xs font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Message, MessageContent, MessageFooter }
