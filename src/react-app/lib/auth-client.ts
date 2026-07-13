import { useSyncExternalStore } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuthUser = { id: string; name: string; email: string };
export type AuthSessionData = {
  user: AuthUser;
  session: { id: string; expiresAt: string };
} | null;

type SessionState = { data: AuthSessionData; isPending: boolean };

// ── Module-level state ────────────────────────────────────────────────────────
// A single shared store — no nanostores, no atoms, no setTimeout delays.
// updateSession() is synchronous so callers see the new state immediately
// on the next React render, with no race between sign-in and navigation.

let state: SessionState = { data: null, isPending: true };
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

function updateSession(data: AuthSessionData) {
  state = { data, isPending: false };
  notify();
}

// ── Initial fetch ─────────────────────────────────────────────────────────────

let fetchStarted = false;

async function initSession() {
  if (fetchStarted) return;
  fetchStarted = true;
  try {
    const res = await fetch("/api/auth/get-session", { credentials: "include" });
    const json = res.ok
      ? ((await res.json()) as { user?: AuthUser; session?: { id: string; expiresAt: string } })
      : null;
    updateSession(json?.user ? (json as AuthSessionData) : null);
  } catch {
    updateSession(null);
  }
}

// ── useSyncExternalStore hook ─────────────────────────────────────────────────

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): SessionState {
  return state;
}

export function useSession(): SessionState {
  if (!fetchStarted) initSession();
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── Auth client ───────────────────────────────────────────────────────────────

type SignInResult =
  | { data: AuthSessionData; error: null }
  | { data: null; error: { message: string } };

export const authClient = {
  useSession,

  signIn: {
    email: async ({
      email,
      password,
    }: {
      email: string;
      password: string;
    }): Promise<SignInResult> => {
      const res = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = (await res.json()) as {
        user?: AuthUser;
        session?: { id: string; expiresAt: string };
        message?: string;
      };
      if (!res.ok) {
        return { data: null, error: { message: json.message ?? "Invalid email or password" } };
      }
      const data = json as AuthSessionData;
      updateSession(data);
      return { data, error: null };
    },
  },

  signUp: {
    email: async ({
      name,
      email,
      password,
    }: {
      name: string;
      email: string;
      password: string;
    }): Promise<SignInResult> => {
      const res = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const json = (await res.json()) as {
        user?: AuthUser;
        session?: { id: string; expiresAt: string };
        message?: string;
      };
      if (!res.ok) {
        return { data: null, error: { message: json.message ?? "Failed to create account" } };
      }
      const data = json as AuthSessionData;
      updateSession(data);
      return { data, error: null };
    },
  },

  signOut: async () => {
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
    updateSession(null);
  },

  updateUser: async ({ name }: { name: string }) => {
    const res = await fetch("/api/auth/update-user", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = (await res.json()) as { success?: boolean; message?: string };
    if (!res.ok) {
      return { data: null, error: { message: json.message ?? "Failed to update name" } };
    }
    // Reflect the name change in the local session state immediately
    if (state.data) {
      updateSession({ ...state.data, user: { ...state.data.user, name } });
    }
    return { data: { success: true }, error: null };
  },

  changePassword: async ({
    currentPassword,
    newPassword,
  }: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions?: boolean;
  }) => {
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const json = (await res.json()) as { success?: boolean; message?: string };
    if (!res.ok) {
      return { data: null, error: { message: json.message ?? "Failed to change password" } };
    }
    return { data: { success: true }, error: null };
  },
};
