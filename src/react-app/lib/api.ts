import { addPendingMutation } from "@/lib/idb";
import type { Settings } from "@shared/schemas";

const API_BASE = "/api";

const MUTABLE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? "GET").toUpperCase();
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      throw new Error(`API ${res.status}: ${msg}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  } catch (err) {
    // Queue mutating requests when the network is unavailable so they can be
    // replayed by useOfflineSync once connectivity is restored.
    if (err instanceof TypeError && MUTABLE_METHODS.has(method)) {
      const body = options?.body ? JSON.parse(options.body as string) : undefined;
      await addPendingMutation({ method: method as "POST" | "PUT" | "PATCH" | "DELETE", url: `${API_BASE}${path}`, body });
    }
    throw err;
  }
}

// Report filters: comma-joined ID lists (or undefined when no selection).
export interface ReportParams {
  since: string;
  until: string;
  projectIds?: string;
  clientIds?: string;
  taskIds?: string;
  tagIds?: string;
  billable?: string;
  search?: string;
  roundMode?: string;
  roundMinutes?: string;
  groupBy?: string;
  // Allows passing the object straight to reportQuery() (all values stringy).
  [k: string]: string | undefined;
}

// Build a query string, dropping undefined/empty values (same pattern as the
// list endpoints) so unselected filters aren't sent as empty params.
function reportQuery(params: Record<string, string | undefined>): string {
  return new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as [
      string,
      string,
    ][]
  ).toString();
}

export const api = {
  // ─── Time entries ──────────────────────────────────────────────────────────
  timeEntries: {
    list: (params: { since?: string; until?: string }) => {
      const qs = new URLSearchParams(
        Object.fromEntries(
          Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
        )
      );
      return request<unknown[]>(`/time_entries?${qs}`);
    },
    current: () => request<unknown | null>("/time_entries/current"),
    create: (body: Record<string, unknown>) =>
      request<unknown>("/time_entries", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      request<unknown>(`/time_entries/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    stop: (id: string) =>
      request<unknown>(`/time_entries/${id}/stop`, { method: "PATCH" }),
    delete: (id: string) =>
      request<unknown>(`/time_entries/${id}`, { method: "DELETE" }),
    bulkUpdate: (body: { ids: string[]; patch: Record<string, unknown> }) =>
      request<unknown>("/time_entries/bulk", { method: "PATCH", body: JSON.stringify(body) }),
    bulkDelete: (ids: string[]) =>
      request<unknown>("/time_entries/bulk", { method: "DELETE", body: JSON.stringify({ ids }) }),
  },

  // ─── Projects ─────────────────────────────────────────────────────────────
  projects: {
    list: (params?: { includeArchived?: string }) => {
      const qs = params
        ? new URLSearchParams(
            Object.fromEntries(
              Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
            )
          ).toString()
        : "";
      return request<unknown[]>(`/projects${qs ? `?${qs}` : ""}`);
    },
    create: (body: Record<string, unknown>) =>
      request<unknown>("/projects", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      request<unknown>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<unknown>(`/projects/${id}`, { method: "DELETE" }),
    recolor: () =>
      request<{ recolored: number; usedAI: boolean }>("/projects/recolor", {
        method: "POST",
      }),
  },

  // ─── Tasks ────────────────────────────────────────────────────────────────
  tasks: {
    list: (params?: { projectId?: string; includeInactive?: string }) => {
      const qs = params
        ? new URLSearchParams(
            Object.fromEntries(
              Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
            )
          ).toString()
        : "";
      return request<unknown[]>(`/tasks${qs ? `?${qs}` : ""}`);
    },
    create: (body: Record<string, unknown>) =>
      request<unknown>("/tasks", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      request<unknown>(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<unknown>(`/tasks/${id}`, { method: "DELETE" }),
  },

  // ─── Clients ──────────────────────────────────────────────────────────────
  clients: {
    list: (params?: { includeArchived?: string }) => {
      const qs = params
        ? new URLSearchParams(
            Object.fromEntries(
              Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
            )
          ).toString()
        : "";
      return request<unknown[]>(`/clients${qs ? `?${qs}` : ""}`);
    },
    get: (id: string) => request<unknown>(`/clients/${id}`),
    create: (body: Record<string, unknown>) =>
      request<unknown>("/clients", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      request<unknown>(`/clients/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<unknown>(`/clients/${id}`, { method: "DELETE" }),
  },

  // ─── Tags ─────────────────────────────────────────────────────────────────
  tags: {
    list: () => request<unknown[]>("/tags"),
    update: (id: string, body: { color: string }) =>
      request<{ ok: boolean }>(`/tags/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },

  // ─── Favorites ────────────────────────────────────────────────────────────
  favorites: {
    list: () => request<unknown[]>("/favorites"),
    create: (body: Record<string, unknown>) =>
      request<unknown>("/favorites", { method: "POST", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<unknown>(`/favorites/${id}`, { method: "DELETE" }),
  },

  // ─── Recurring entries ────────────────────────────────────────────────────
  recurring: {
    list: () => request<unknown[]>("/recurring"),
    create: (body: Record<string, unknown>) =>
      request<unknown>("/recurring", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      request<unknown>(`/recurring/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<unknown>(`/recurring/${id}`, { method: "DELETE" }),
  },

  // ─── Integrations ────────────────────────────────────────────────────────
  integrations: {
    list: () => request<unknown[]>("/integrations"),
    create: (body: Record<string, unknown>) =>
      request<unknown>("/integrations", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      request<unknown>(`/integrations/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<unknown>(`/integrations/${id}`, { method: "DELETE" }),
    test: (id: string) =>
      request<{ ok: boolean; error?: string }>(`/integrations/${id}/test`, { method: "POST" }),
    push: (body: { entryIds: string[]; comment?: string }) =>
      request<{ results: { id: string; ok: boolean; externalId?: string; error?: string }[] }>(
        "/integrations/push",
        { method: "POST", body: JSON.stringify(body) }
      ),
  },

  // ─── Calendar sync (Google) ────────────────────────────────────────────────
  calendar: {
    status: () =>
      request<{
        configured: boolean;
        connected: boolean;
        accountEmail?: string | null;
        autoTrack?: boolean;
      }>("/calendar/status"),
    setAutoTrack: (enabled: boolean) =>
      request<{ ok: boolean; autoTrack: boolean }>("/calendar/auto-track", {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    convert: (params: { since: string; until: string }) =>
      request<{ created: number }>("/calendar/convert", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    events: (params: { since: string; until: string }) => {
      const qs = new URLSearchParams();
      qs.set("since", params.since);
      qs.set("until", params.until);
      return request<
        { calendarEventId: string; title: string; start: string; stop: string }[]
      >(`/calendar/events?${qs}`);
    },
    disconnect: () => request<{ ok: boolean }>("/calendar/google", { method: "DELETE" }),
  },

  // ─── AI ───────────────────────────────────────────────────────────────────
  ai: {
    quickEntry: (body: Record<string, unknown>) =>
      request<unknown>("/ai/quick-entry", { method: "POST", body: JSON.stringify(body) }),
    summary: (body: Record<string, unknown>) =>
      request<unknown>("/ai/summary", { method: "POST", body: JSON.stringify(body) }),
  },

  // ─── Assistant (Aski) ─────────────────────────────────────────────────────
  assistant: {
    nudges: (timezoneOffsetMinutes: number) =>
      request<unknown[]>(
        `/assistant/nudges?timezoneOffsetMinutes=${timezoneOffsetMinutes}`
      ),
    chat: (body: Record<string, unknown>) =>
      request<unknown>("/assistant/chat", { method: "POST", body: JSON.stringify(body) }),
    trackEvent: (body: Record<string, unknown>) =>
      request<unknown>("/assistant/track-event", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  // ─── Admin ────────────────────────────────────────────────────────────────
  admin: {
    removeUser: (id: string) =>
      request<{ ok: boolean; purgedWorkspaces: number }>(
        `/admin/users/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      ),
  },

  // ─── Settings ─────────────────────────────────────────────────────────────
  settings: {
    get: () => request<Settings>("/settings"),
    update: (
      body: Partial<
        Pick<
          Settings,
          | "currency"
          | "timeFormat"
          | "roundMode"
          | "roundMinutes"
          | "weekStart"
          | "showWeekends"
          | "autoAssignColors"
        >
      >
    ) =>
      request<Settings>("/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },

  // ─── Reports ──────────────────────────────────────────────────────────────
  reports: {
    summary: (params: ReportParams & { groupBy?: string }) =>
      request<unknown>(`/reports/summary?${reportQuery(params)}`),
    grouped: (params: ReportParams & { group?: string; subGroup?: string }) =>
      request<unknown>(`/reports/grouped?${reportQuery(params)}`),
    detailed: (params: ReportParams) =>
      request<unknown[]>(`/reports/detailed?${reportQuery(params)}`),
    weekly: (params: ReportParams) =>
      request<unknown[]>(`/reports/weekly?${reportQuery(params)}`),
  },

  // ─── Saved reports ────────────────────────────────────────────────────────
  savedReports: {
    list: () => request<unknown[]>("/saved-reports"),
    create: (body: { name: string; config: Record<string, unknown> }) =>
      request<unknown>("/saved-reports", { method: "POST", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<unknown>(`/saved-reports/${id}`, { method: "DELETE" }),
  },
};
