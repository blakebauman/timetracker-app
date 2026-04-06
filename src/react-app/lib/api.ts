const API_BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${msg}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
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
    create: (body: Record<string, unknown>) =>
      request<unknown>("/clients", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      request<unknown>(`/clients/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  },

  // ─── Tags ─────────────────────────────────────────────────────────────────
  tags: {
    list: () => request<unknown[]>("/tags"),
  },

  // ─── Reports ──────────────────────────────────────────────────────────────
  reports: {
    summary: (params: { since: string; until: string; groupBy?: string }) => {
      const qs = new URLSearchParams(params as Record<string, string>);
      return request<unknown>(`/reports/summary?${qs}`);
    },
    detailed: (params: { since: string; until: string }) => {
      const qs = new URLSearchParams(params);
      return request<unknown[]>(`/reports/detailed?${qs}`);
    },
    weekly: (params: { since: string; until: string }) => {
      const qs = new URLSearchParams(params);
      return request<unknown[]>(`/reports/weekly?${qs}`);
    },
  },
};
