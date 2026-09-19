import type { TimeEntry } from "@timetracker/core/schemas";

/**
 * The start request in flight, if any.
 *
 * Starting a timer is optimistic: the running entry in the store carries a
 * placeholder `optimistic-…` id, and the Stop control, the tag chips and the
 * description field are all live before the POST that creates the entry has
 * returned. Any write against the running entry in that window would hit the
 * placeholder id, 404, and leave the server's entry running behind an error
 * toast. Every such write resolves the id through `settleEntryId` first.
 *
 * Module state rather than a hook ref: `useTimer()` is re-instantiated per
 * component and `useUpdateEntry()` is a different hook again — the row that
 * stops a timer, or the chip that edits it, is rarely where it was started.
 */
let pendingStart: Promise<TimeEntry> | null = null;

const OPTIMISTIC_ENTRY_PREFIX = "optimistic-";

export function isOptimisticEntryId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ENTRY_PREFIX);
}

/** Register the start request so writes against the placeholder can wait for it. */
export function trackPendingStart(request: Promise<TimeEntry>): void {
  pendingStart = request;
  request
    .catch(() => undefined)
    .finally(() => {
      if (pendingStart === request) pendingStart = null;
    });
}

/**
 * Resolve a possibly-optimistic entry id to the server's id, waiting for an
 * in-flight start to settle if needed. Resolves to null when the start failed
 * (its own onError has already cleared the timer and said so) — the caller
 * then has nothing to act on.
 */
export async function settleEntryId(id: string): Promise<string | null> {
  if (!isOptimisticEntryId(id)) return id;
  if (!pendingStart) return null;
  try {
    return (await pendingStart).id;
  } catch {
    return null;
  }
}
