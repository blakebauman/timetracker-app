import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { EntryFormSheet } from "@/components/entries/EntryFormSheet";
import { useCreateEntry } from "@/hooks/useEntries";
import { useEntryDraft } from "@/hooks/useEntryDraft";

interface CalendarCreateDialogProps {
  open: boolean;
  // Prefilled from the clicked/dragged grid selection (ISO strings).
  startIso: string;
  stopIso: string;
  // When confirming a Google Calendar "ghost": seed the description and stamp the
  // entry with the external event id so the ghost stops reappearing.
  description?: string;
  calendarEventId?: string;
  onClose: () => void;
}

/** Create an entry from a calendar selection. Fields and shell live in EntryFormSheet. */
export function CalendarCreateDialog({
  open,
  startIso,
  stopIso,
  description: prefillDescription,
  calendarEventId,
  onClose,
}: CalendarCreateDialogProps) {
  const draft = useEntryDraft({
    start: startIso,
    stop: stopIso,
    description: prefillDescription ?? "",
  });
  const createEntry = useCreateEntry();
  const fromCalendar = Boolean(calendarEventId);

  // Reset to the (possibly new) selection each time the dialog opens on a
  // different slot — the component stays mounted between openings.
  const openKey = `${startIso}|${stopIso}|${calendarEventId ?? ""}`;
  const [syncedKey, setSyncedKey] = useState(openKey);
  if (open && syncedKey !== openKey) {
    setSyncedKey(openKey);
    draft.reset({
      start: startIso,
      stop: stopIso,
      description: prefillDescription ?? "",
    });
  }

  const handleSave = () => {
    const { start, stop } = draft.draft;
    if (!start || !stop || !draft.hasValidRange) return;
    createEntry.mutate(
      { ...draft.draft, start, stop, calendarEventId },
      { onSuccess: onClose }
    );
  };

  return (
    <EntryFormSheet
      open={open}
      onClose={onClose}
      title={fromCalendar ? "Track calendar event" : "New entry"}
      submitLabel="Add entry"
      pending={createEntry.isPending}
      onSubmit={handleSave}
      draft={draft}
    >
      {fromCalendar && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
          Tracking a calendar event — it won't be suggested again once saved.
        </p>
      )}
    </EntryFormSheet>
  );
}
