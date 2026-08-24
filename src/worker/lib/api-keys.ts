// Workspace API keys — the credential a program presents when it has no browser
// session to borrow. Used by the MCP endpoint (worker/mcp/).
//
// Only a SHA-256 digest is ever stored. The plaintext is returned once, at
// creation, and cannot be recovered: a key list that can reveal its own secrets
// is one database read away from being a breach.

export type ApiKeyScope = "read" | "read_write";

/** Recognisable, greppable, and clearly ours if it leaks into a log or a repo. */
const KEY_PREFIX = "tt_live_";
/** Shown in the UI to tell two keys apart. Enough to be distinctive, far too little to guess from. */
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 6;

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  scope: ApiKeyScope;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface ResolvedApiKey {
  id: string;
  workspaceId: string;
  userId: string;
  scope: ApiKeyScope;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashKey(plaintext: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(plaintext)
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 256 bits from the CSPRNG. */
export function generateKey(): string {
  return KEY_PREFIX + toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createApiKey(
  db: D1Database,
  workspaceId: string,
  userId: string,
  name: string,
  scope: ApiKeyScope
): Promise<{ record: ApiKeyRecord; plaintext: string }> {
  const plaintext = generateKey();
  const id = crypto.randomUUID();
  const prefix = plaintext.slice(0, DISPLAY_PREFIX_LENGTH);
  const createdAt = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO api_keys (id, workspace_id, user_id, name, prefix, key_hash, scope, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, workspaceId, userId, name, prefix, await hashKey(plaintext), scope, createdAt)
    .run();

  return {
    record: { id, name, prefix, scope, lastUsedAt: null, createdAt },
    plaintext,
  };
}

export async function listApiKeys(
  db: D1Database,
  workspaceId: string
): Promise<ApiKeyRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, prefix, scope, last_used_at, created_at
       FROM api_keys WHERE workspace_id = ? ORDER BY created_at DESC`
    )
    .bind(workspaceId)
    .all<Record<string, unknown>>();
  return results.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    prefix: r.prefix as string,
    scope: r.scope as ApiKeyScope,
    lastUsedAt: (r.last_used_at as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function revokeApiKey(
  db: D1Database,
  workspaceId: string,
  id: string
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM api_keys WHERE id = ? AND workspace_id = ?`)
    .bind(id, workspaceId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/**
 * Resolve an `Authorization: Bearer tt_live_…` header to its workspace.
 *
 * Returns null for anything that isn't one of our keys — including a Better
 * Auth session bearer token, which must NOT be silently accepted here: the two
 * credential kinds have different revocation stories, and a caller who thinks
 * they are presenting an API key should be told when they aren't.
 *
 * Membership is re-verified against `member` on every call, exactly as the
 * session path does (middleware/workspace.ts). A key outlives the browser
 * session that made it, so "the person who minted this was removed from the
 * workspace six months ago" is the case that matters most.
 */
export async function resolveApiKey(
  db: D1Database,
  authorization: string | undefined | null
): Promise<ResolvedApiKey | null> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || !token.startsWith(KEY_PREFIX)) return null;

  const row = await db
    .prepare(
      `SELECT k.id, k.workspace_id, k.user_id, k.scope
       FROM api_keys k
       JOIN "member" m ON m.userId = k.user_id AND m.organizationId = k.workspace_id
       WHERE k.key_hash = ?`
    )
    .bind(await hashKey(token))
    .first<{ id: string; workspace_id: string; user_id: string; scope: string }>();
  if (!row) return null;

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    scope: row.scope as ApiKeyScope,
  };
}

/**
 * Stamp last-used. Deliberately fire-and-forget from the caller's perspective
 * (pass it to waitUntil): it's an audit convenience, and a write failure must
 * never turn a working request into a failed one.
 */
export async function touchApiKey(db: D1Database, id: string): Promise<void> {
  try {
    await db
      .prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), id)
      .run();
  } catch (e) {
    console.warn("api key: last-used stamp failed", { id, error: String(e) });
  }
}
