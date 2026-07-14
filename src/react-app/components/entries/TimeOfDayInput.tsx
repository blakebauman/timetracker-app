import { useState } from "react";
import { Input } from "@/components/ui/input";
import { formatEntryTime, parseTimeOfDayInput, applyTimeOfDay } from "@/lib/dateUtils";
import { useUIStore } from "@/stores/uiStore";

interface TimeOfDayInputProps {
  value: string | null;
  fallbackIso: string;
  onChange: (iso: string | null) => void;
  allowClear?: boolean;
  className?: string;
}

// Editable time-of-day field. Displays/parses per the app's 24h/12h preference,
// matching the read-only formatting used by EntryRow/DetailedTable instead of
// deferring to the browser's locale-driven <input type="time">.
export function TimeOfDayInput({
  value,
  fallbackIso,
  onChange,
  allowClear = false,
  className,
}: TimeOfDayInputProps) {
  const timeFormat = useUIStore((s) => s.timeFormat);
  const display = (iso: string | null) => (iso ? formatEntryTime(iso, timeFormat) : "");
  const [text, setText] = useState(() => display(value));

  // Resync the editable text when the value or format preference changes from
  // outside. Adjusting during render (rather than in an effect) avoids a frame
  // of stale text and keeps the field a pure function of its inputs.
  const [synced, setSynced] = useState({ value, timeFormat });
  if (synced.value !== value || synced.timeFormat !== timeFormat) {
    setSynced({ value, timeFormat });
    setText(display(value));
  }

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === "") {
      if (allowClear) {
        onChange(null);
      } else {
        setText(display(value));
      }
      return;
    }
    const parsed = parseTimeOfDayInput(trimmed);
    if (parsed) {
      onChange(applyTimeOfDay(value ?? fallbackIso, parsed.hours, parsed.minutes));
    } else {
      setText(display(value));
    }
  };

  return (
    <Input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          e.currentTarget.blur();
        }
      }}
      placeholder={timeFormat === "12h" ? "2:30 PM" : "14:30"}
      className={className}
    />
  );
}
