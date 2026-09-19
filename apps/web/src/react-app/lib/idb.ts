import { openDB, type IDBPDatabase } from "idb";

interface TimerState {
  entryId: string;
  startedAt: number; // Unix ms
  description: string;
  projectId: string | null;
  projectColor: string | null;
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
  const db = await getDB();
  await db.put("timer_state", state, "current");
}

export async function loadTimerState(): Promise<TimerState | undefined> {
  const db = await getDB();
  return db.get("timer_state", "current");
}

export async function clearTimerState(): Promise<void> {
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

export type { TimerState, PendingMutation };
