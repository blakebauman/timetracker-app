import { toast } from "sonner";
import { format } from "date-fns";
import { EntryFormSheet } from "./EntryFormSheet";
import { useCreateEntry } from "@/hooks/useEntries";
import { useEntryDraft } from "@/hooks/useEntryDraft";

interface AddEntryDialogProps {
  open: boolean;
  onClose: () => void;
  /** The period currently on screen, so a save that lands outside it can say so. */
  visibleRange?: { since: Date; until: Date };
  /** Move the workspace to show the day an out-of-range entry landed on. */
  onRevealDate?: (date: Date) => void;
}

/** Create an entry from the workspace header. Fields and shell live in EntryFormSheet. */
export function AddEntryDialog({
  open,
  onClose,
  visibleRange,
  onRevealDate,
}: AddEntryDialogProps) {
  const draft = useEntryDraft({});
  const createEntry = useCreateEntry();

  const handleClose = () => {
    draft.reset({});
    onClose();
  };

  const handleSave = () => {
    const { start, stop } = draft.draft;
    if (!start || !stop || !draft.hasValidRange) return;
    const startedAt = new Date(start);
    createEntry.mutate(
      { ...draft.draft, start, stop },
      {
        onSuccess: () => {
          // An entry dated outside the period on screen would otherwise just not
          // appear — indistinguishable from a save that failed. Say where it went
          // and offer to go there.
          const outside =
            visibleRange &&
            (startedAt < visibleRange.since || startedAt > visibleRange.until);
          if (outside) {
            toast.success(`Entry added on ${format(startedAt, "EEE, MMM d")}`, {
              description: "That date is outside the period you're viewing.",
              action: onRevealDate
                ? { label: "Show it", onClick: () => onRevealDate(startedAt) }
                : undefined,
            });
          }
          handleClose();
        },
      }
    );
  };

  return (
    <EntryFormSheet
      open={open}
      onClose={handleClose}
      title="New entry"
      submitLabel="Add entry"
      pending={createEntry.isPending}
      onSubmit={handleSave}
      draft={draft}
    />
  );
}
