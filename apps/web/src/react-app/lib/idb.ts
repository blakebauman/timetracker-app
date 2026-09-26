import { openDB, type IDBPDatabase } from "idb";

interface TimerState {
  entryId: string;
  startedAt: number; // Unix ms
  description: string;
  projectId: string | null;
  projectColor: string | null;
  // Optional: snapshots written before these were persisted don't have them.
  taskId?: string | null;
  tags?: string[];
  billable?: boolean;
}

/**
 * A synchronous copy of the timer snapshot, in localStorage.
 *
 * IndexedDB can only be read asynchronously, and the server's `/current` is a
 * round-trip, so on every page load the bar used to render *idle* — "Nothing
 * tracked today", a live Start — for the 100ms to seconds before either
 * answered. Pressing Enter in that window started a new timer, which the
 * server treats as "stop the running one": opening the app could end the
 * timer it was about to show. The timer store seeds itself from this mirror
 * at module load, so a running timer is on screen in the first frame and the
 * server only reconciles it. Written and cleared alongside the IndexedDB copy.
 */
const TIMER_MIRROR_KEY = "tt-running-timer";

export function readTimerMirror(): TimerState | null {
  try {
    const raw = localStorage.getItem(TIMER_MIRROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TimerState;
    return typeof parsed?.entryId === "string" && typeof parsed.startedAt === "number"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function writeTimerMirror(state: TimerState | null): void {
  try {
    if (state) localStorage.setItem(TIMER_MIRROR_KEY, JSON.stringify(state));
    else localStorage.removeItem(TIMER_MIRROR_KEY);
  } catch {
    // Storage blocked (private window, quota) — the async restore still runs.
  }
}

interface PendingMutation {
  id?: number;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  body?: unknown;
  createdAt: number;
}

interface TimeTrackerDB {
  timer_state: {
    key: "current";
    value: TimerState;
  };
  pending_mutations: {
    key: number;
    value: PendingMutation;
    indexes: { by_created: number };
  };
}

let _db: IDBPDatabase<TimeTrackerDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<TimeTrackerDB>> {
  if (_db) return _db;
  _db = await openDB<TimeTrackerDB>("time-tracker", 1, {
    upgrade(db) {
      db.createObjectStore("timer_state");
      const mutations = db.createObjectStore("pending_mutations", {
        keyPath: "id",
        autoIncrement: true,
      });
      mutations.createIndex("by_created", "createdAt");
    },
  });
  return _db;
}

export async function saveTimerState(state: TimerState): Promise<void> {
  writeTimerMirror(state);
  const db = await getDB();
  await db.put("timer_state", state, "current");
}

export async function loadTimerState(): Promise<TimerState | undefined> {
  const db = await getDB();
  return db.get("timer_state", "current");
}

export async function clearTimerState(): Promise<void> {
  writeTimerMirror(null);
  const db = await getDB();
  await db.delete("timer_state", "current");
}

/**
 * Who wants to know when the queue grows or shrinks — the offline banner's
 * "N changes will sync" count. IndexedDB has no change events of its own, so
 * the two writers below notify by hand; a listener re-counts on each call.
 */
const pendingListeners = new Set<() => void>();

export function onPendingMutationsChange(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

function notifyPendingMutationsChange(): void {
  for (const listener of pendingListeners) listener();
}

export async function addPendingMutation(
  mutation: Omit<PendingMutation, "id" | "createdAt">
): Promise<void> {
  const db = await getDB();
  await db.add("pending_mutations", {
    ...mutation,
    createdAt: Date.now(),
  } as PendingMutation);
  notifyPendingMutationsChange();
}

/** Rewrite a queued write in place (same id, same position in the replay order). */
export async function putPendingMutation(mutation: PendingMutation): Promise<void> {
  const db = await getDB();
  await db.put("pending_mutations", mutation);
  notifyPendingMutationsChange();
}

export async function countPendingMutations(): Promise<number> {
  const db = await getDB();
  return db.count("pending_mutations");
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  const db = await getDB();
  return db.getAllFromIndex("pending_mutations", "by_created");
}

export async function deletePendingMutation(id: number): Promise<void> {
  const db = await getDB();
  await db.delete("pending_mutations", id);
  notifyPendingMutationsChange();
}

export async function clearPendingMutations(): Promise<void> {
  const db = await getDB();
  await db.clear("pending_mutations");
  notifyPendingMutationsChange();
}

/**
 * Everything this browser remembers about the account, for sign-out. No
 * credential lives here — the session is a cookie — but the timer snapshot
 * and the un-replayed offline queue hold entry descriptions, project ids and
 * whatever else a queued write carried, which is PII on a shared machine.
 * Each store is cleared independently so one failure can't keep the other.
 */
export async function clearOfflineState(): Promise<void> {
  await Promise.allSettled([clearTimerState(), clearPendingMutations()]);
}

export type { TimerState, PendingMutation };
