import { EntryFormSheet } from "./EntryFormSheet";
import { useUpdateEntry } from "@/hooks/useEntries";
import { useEntryDraft } from "@/hooks/useEntryDraft";

// Only the fields the form actually reads — so a full TimeEntry OR a report's
// DetailedEntry (both structurally provide these) can be edited.
export interface EditableEntry {
  id: string;
  description: string;
  projectId: string | null;
  taskId: string | null;
  tags: string[];
  billable: boolean;
  start: string;
  stop: string | null;
}

interface EntryFormProps {
  entry: EditableEntry;
  open: boolean;
  onClose: () => void;
}

/** Edit an existing entry. Fields and shell live in EntryFormSheet. */
export function EntryForm({ entry, open, onClose }: EntryFormProps) {
  const draft = useEntryDraft({
    description: entry.description,
    projectId: entry.projectId,
    taskId: entry.taskId ?? null,
    tags: entry.tags,
    billable: entry.billable,
    start: entry.start,
    stop: entry.stop,
  });
  const updateEntry = useUpdateEntry();

  const handleSave = () => {
    const { start, stop, ...rest } = draft.draft;
    updateEntry.mutate(
      { id: entry.id, data: { ...rest, start: start ?? entry.start, stop: stop ?? undefined } },
      { onSuccess: onClose }
    );
  };

  return (
    <EntryFormSheet
      open={open}
      onClose={onClose}
      title="Edit entry"
      submitLabel="Save changes"
      pending={updateEntry.isPending}
      onSubmit={handleSave}
      draft={draft}
      // A running entry legitimately has no stop yet; don't block saving it.
      requireRange={false}
    />
  );
}
