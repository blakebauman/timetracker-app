import { useState } from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  value: Date
  onSelect: (date: Date) => void
  className?: string
}

// A Popover + Calendar date picker, matching shadcn's canonical pattern —
// replaces the browser's native <input type="date"> (inconsistent styling
// across OSes/browsers) wherever a form needs to pick a single date.
export function DatePicker({ value, onSelect, className }: DatePickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          // The visible text is the value, not the field's purpose. Without this
          // a screen reader announces only "July 20th" with no hint it's a date
          // control, and tests have to locate it by "the button with a year".
          aria-label={`Date: ${format(value, "EEE, MMM d, yyyy")}`}
          className={cn("w-full justify-start gap-2 font-normal", className)}
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          {/* One date vocabulary app-wide — "PPP" ("July 20th, 2026") was a third
              style alongside the header's "Jul 14 – 20" and the day groups'
              "Saturday, Jul 18". */}
          {format(value, "EEE, MMM d, yyyy")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
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
