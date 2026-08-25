import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  CreateIntegrationSchema,
  UpdateIntegrationSchema,
  PushTimeEntriesSchema,
  type IntegrationCredentials,
  type IntegrationType,
  type PushResult,
} from "@shared/schemas";
import { encryptJSON, decryptJSON } from "../lib/crypto";
import { localDateInZone } from "../lib/local-date";
import { broadcast } from "../db/queries";
import { getAdapter, IntegrationError, type Connection } from "../integrations";
import { safeIntegrationOrigin } from "../integrations/url-guard";

function formatIntegration(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    type: row.type as IntegrationType,
    name: row.name as string,
    baseUrl: row.base_url as string,
    hasCredentials: Boolean(row.credentials),
    createdAt: row.created_at as string,
  };
}

interface IntegrationRow {
  id: string;
  type: IntegrationType;
  name: string;
  base_url: string;
  credentials: string;
}

async function toConnection(secret: string, row: IntegrationRow): Promise<Connection> {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    baseUrl: row.base_url,
    credentials: await decryptJSON<IntegrationCredentials>(secret, row.credentials),
  };
}

export const integrationsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  .get("/", async (c) => {
    // Calendar sync stores its OAuth tokens as calendar integration rows
    // but is managed via /api/calendar — keep it out of the push-integration UI.
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM integrations WHERE workspace_id = ?
         AND type NOT IN ('google_calendar', 'microsoft_calendar')
       ORDER BY name ASC`
    ).bind(c.get("workspaceId")).all<Record<string, unknown>>();
    return c.json(results.map(formatIntegration));
  })
  .post("/", zValidator("json", CreateIntegrationSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const data = c.req.valid("json");

    // Reject an SSRF-unsafe base URL up front (also enforced at fetch time).
    try {
      safeIntegrationOrigin(data.baseUrl, data.type);
    } catch (err) {
      return c.json({ error: err instanceof IntegrationError ? err.message : "Invalid base URL" }, 400);
    }

    const id = crypto.randomUUID();
    const credentials = await encryptJSON(c.env.AUTH_SECRET, data.credentials);

    await c.env.DB.prepare(
      `INSERT INTO integrations (id, workspace_id, type, name, base_url, credentials)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, workspaceId, data.type, data.name, data.baseUrl, credentials).run();

    const { results } = await c.env.DB.prepare(
      `SELECT * FROM integrations WHERE id = ?`
    ).bind(id).all<Record<string, unknown>>();
    return c.json(formatIntegration(results[0]), 201);
  })
  .put("/:id", zValidator("json", UpdateIntegrationSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
    if (data.baseUrl !== undefined) {
      // Generic SSRF validation here (type is immutable on update, and the
      // adapter re-validates the provider-specific host at fetch time).
      try {
        safeIntegrationOrigin(data.baseUrl);
      } catch (err) {
        return c.json({ error: err instanceof IntegrationError ? err.message : "Invalid base URL" }, 400);
      }
      fields.push("base_url = ?"); values.push(data.baseUrl);
    }
    if (data.credentials !== undefined) {
      fields.push("credentials = ?");
      values.push(await encryptJSON(c.env.AUTH_SECRET, data.credentials));
    }

    if (fields.length) {
      await c.env.DB.prepare(
        `UPDATE integrations SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
      ).bind(...values, id, workspaceId).run();
    }

    const { results } = await c.env.DB.prepare(
      `SELECT * FROM integrations WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).all<Record<string, unknown>>();
    if (!results.length) return c.json({ error: "Not found" }, 404);
    return c.json(formatIntegration(results[0]));
  })
  .delete("/:id", async (c) => {
    await c.env.DB.prepare(
      `DELETE FROM integrations WHERE id = ? AND workspace_id = ?`
    ).bind(c.req.param("id"), c.get("workspaceId")).run();
    return c.json({ ok: true });
  })
  .post("/:id/test", async (c) => {
    const row = await c.env.DB.prepare(
      `SELECT * FROM integrations WHERE id = ? AND workspace_id = ?`
    ).bind(c.req.param("id"), c.get("workspaceId")).first<IntegrationRow>();
    if (!row) return c.json({ error: "Not found" }, 404);

    try {
      const conn = await toConnection(c.env.AUTH_SECRET, row);
      await getAdapter(conn.type).test(conn);
      return c.json({ ok: true });
    } catch (err) {
      const msg = err instanceof IntegrationError ? err.message : "Connection test failed";
      return c.json({ ok: false, error: msg });
    }
  })
  .post("/push", zValidator("json", PushTimeEntriesSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { entryIds, comment, timezone } = c.req.valid("json");

    // Decrypt each integration at most once per request.
    const connCache = new Map<string, Connection>();
    const results: PushResult[] = [];
    let anyChanged = false;

    for (const entryId of entryIds) {
      const row = await c.env.DB.prepare(
        `SELECT te.id, te.description, te.start, te.stop, te.duration,
                p.id AS p_id, p.name AS p_name, p.integration_id,
                p.external_project_id, p.external_task_id,
                i.id AS i_id, i.type AS i_type, i.name AS i_name,
                i.base_url AS i_base_url, i.credentials AS i_credentials
         FROM time_entries te
         LEFT JOIN projects p ON p.id = te.project_id
         LEFT JOIN integrations i ON i.id = p.integration_id AND i.workspace_id = te.workspace_id
         WHERE te.id = ? AND te.workspace_id = ?`
      ).bind(entryId, workspaceId).first<Record<string, unknown>>();

      if (!row) {
        results.push({ id: entryId, ok: false, error: "Entry not found" });
        continue;
      }
      if (!row.p_id) {
        results.push({ id: entryId, ok: false, error: "Entry has no project" });
        continue;
      }
      if (!row.i_id) {
        results.push({ id: entryId, ok: false, error: "Project has no integration assigned" });
        continue;
      }
      const duration = (row.duration as number | null) ?? 0;
      if (!row.stop || duration <= 0) {
        results.push({ id: entryId, ok: false, error: "Entry is not completed" });
        continue;
      }

      try {
        const integrationId = row.i_id as string;
        let conn = connCache.get(integrationId);
        if (!conn) {
          conn = await toConnection(c.env.AUTH_SECRET, {
            id: integrationId,
            type: row.i_type as IntegrationType,
            name: row.i_name as string,
            base_url: row.i_base_url as string,
            credentials: row.i_credentials as string,
          });
          connCache.set(integrationId, conn);
        }

        const { externalId } = await getAdapter(conn.type).pushTimeEntry({
          connection: conn,
          project: {
            id: row.p_id as string,
            name: row.p_name as string,
            externalProjectId: (row.external_project_id as string | null) ?? null,
            externalTaskId: (row.external_task_id as string | null) ?? null,
          },
          entry: {
            id: entryId,
            description: (row.description as string) ?? "",
            start: row.start as string,
            stop: row.stop as string,
            durationSeconds: duration,
            localDate: localDateInZone(row.start as string, timezone),
          },
          comment: comment ?? ((row.description as string) || ""),
        });

        await c.env.DB.prepare(
          `UPDATE time_entries
           SET sync_status = 'synced', external_id = ?, synced_at = ?, sync_error = NULL, updated_at = ?
           WHERE id = ? AND workspace_id = ?`
        ).bind(externalId, new Date().toISOString(), new Date().toISOString(), entryId, workspaceId).run();

        anyChanged = true;
        results.push({ id: entryId, ok: true, externalId });
      } catch (err) {
        const msg = err instanceof IntegrationError ? err.message : "Push failed";
        await c.env.DB.prepare(
          `UPDATE time_entries
           SET sync_status = 'error', sync_error = ?, updated_at = ?
           WHERE id = ? AND workspace_id = ?`
        ).bind(msg, new Date().toISOString(), entryId, workspaceId).run();
        anyChanged = true;
        results.push({ id: entryId, ok: false, error: msg });
      }
    }

    if (anyChanged) c.executionCtx.waitUntil(broadcast(c.env, workspaceId, "entries:changed", null));
    return c.json({ results });
  });
