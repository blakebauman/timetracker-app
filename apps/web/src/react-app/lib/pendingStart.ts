import type { TimeEntry } from "@timetracker/core/schemas";
import {
  deletePendingMutation,
  getPendingMutations,
  putPendingMutation,
  type PendingMutation,
} from "@/lib/idb";

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

// ─── Timers started offline ──────────────────────────────────────────────────
//
// A start made without a connection never gets a server id: its POST sits in
// the offline queue (lib/api.ts) and the running entry keeps its placeholder
// id until the queue drains. Writes against it can't be sent anywhere, and
// queuing them against the placeholder would 404 on replay and be dropped —
// which for a Stop means the entry replays as *running* and bills until
// someone notices. Instead, edit the queued create itself: a stop becomes the
// create's `stop` (the server then inserts a finished entry), a discard
// removes the create, and a description or project change is merged into it.

type QueuedStartOutcome = "amended" | "removed" | "none";

/**
 * The queued create of the running timer: the latest queued
 * `POST /time_entries` with no `stop`. There is only ever one running timer,
 * and a create that already carries a stop is a finished entry, not a timer.
 */
async function findQueuedRunningCreate(): Promise<PendingMutation | undefined> {
  const all = await getPendingMutations();
  for (let i = all.length - 1; i >= 0; i--) {
    const m = all[i];
    const body = m.body as Record<string, unknown> | undefined;
    if (m.method === "POST" && m.url.endsWith("/time_entries") && body && !body.stop) {
      return m;
    }
  }
  return undefined;
}

/** Is there a timer start waiting in the offline queue? */
export async function hasQueuedRunningCreate(): Promise<boolean> {
  return Boolean(await findQueuedRunningCreate().catch(() => undefined));
}

/**
 * Apply `patch` to the queued create of an offline-started timer, or remove the
 * create when `patch` is null (discard). A `stop` at or before the create's
 * start would fail the server's "stop after start" check on replay and be
 * dropped as a 4xx anyway, so a zero-length timer is removed outright.
 */
export async function amendQueuedStart(
  patch: Record<string, unknown> | null
): Promise<QueuedStartOutcome> {
  let queued: PendingMutation | undefined;
  try {
    queued = await findQueuedRunningCreate();
  } catch {
    return "none";
  }
  if (!queued || queued.id === undefined) return "none";
  const body = queued.body as Record<string, unknown>;
  const zeroLength =
    patch !== null &&
    typeof patch.stop === "string" &&
    Date.parse(patch.stop) <= Date.parse(String(patch.start ?? body.start));
  if (patch === null || zeroLength) {
    await deletePendingMutation(queued.id);
    return "removed";
  }
  await putPendingMutation({ ...queued, body: { ...body, ...patch } });
  return "amended";
}

/**
 * "Keep running" on a timer that was started *and* stopped offline: its
 * queued create carries the stop; take it off again so the replay creates a
 * running entry. Matched by start, since the entry never had a server id.
 */
export async function reopenQueuedCreate(startIso: string): Promise<boolean> {
  let all: PendingMutation[];
  try {
    all = await getPendingMutations();
  } catch {
    return false;
  }
  for (let i = all.length - 1; i >= 0; i--) {
    const m = all[i];
    const body = m.body as Record<string, unknown> | undefined;
    if (
      m.id !== undefined &&
      m.method === "POST" &&
      m.url.endsWith("/time_entries") &&
      body?.start === startIso &&
      body.stop
    ) {
      const { stop: _stop, ...rest } = body;
      void _stop;
      await putPendingMutation({ ...m, body: rest });
      return true;
    }
  }
  return false;
}
