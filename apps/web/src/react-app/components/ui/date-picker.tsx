import { useState } from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  /**
   * `null` is a real state — "no date chosen" — and renders the placeholder.
   * It used to be impossible to express, so an optional date (a task's due
   * date) had to be drawn as *today* in muted ink, which reads as "due today,
   * greyed out for some reason" rather than "not set".
   */
  value: Date | null
  onSelect: (date: Date) => void
  /** Shown when `value` is null. */
  placeholder?: string
  className?: string
}

// A Popover + Calendar date picker, matching shadcn's canonical pattern —
// replaces the browser's native <input type="date"> (inconsistent styling
// across OSes/browsers) wherever a form needs to pick a single date.
export function DatePicker({
  value,
  onSelect,
  placeholder = "Pick a date",
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const label = value ? format(value, "EEE, MMM d, yyyy") : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          // The visible text is the value, not the field's purpose. Without this
          // a screen reader announces only "July 20th" with no hint it's a date
          // control, and tests have to locate it by "the button with a year".
          aria-label={label ? `Date: ${label}` : `Date: not set`}
          className={cn(
            "w-full justify-start gap-2 font-normal",
            !label && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          {/* One date vocabulary app-wide — "PPP" ("July 20th, 2026") was a third
              style alongside the header's "Jul 14 – 20" and the day groups'
              "Saturday, Jul 18". */}
          {label ?? placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          defaultMonth={value ?? undefined}
          onSelect={(date) => {
            if (date) {
              onSelect(date)
              setOpen(false)
            }
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
