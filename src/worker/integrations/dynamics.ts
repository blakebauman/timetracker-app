import type { DynamicsCredentials } from "@shared/schemas";
import {
  IntegrationError,
  type Connection,
  type IntegrationAdapter,
  type PushContext,
} from "./types";
import { safeIntegrationOrigin } from "./url-guard";

const API_VERSION = "v9.2";

function orgOrigin(baseUrl: string): string {
  // SSRF-validate + pin to *.dynamics.com, e.g. https://org.crm.dynamics.com.
  return safeIntegrationOrigin(baseUrl, "dynamics");
}

function creds(connection: Connection): DynamicsCredentials {
  return connection.credentials as DynamicsCredentials;
}

// Cache Entra ID access tokens across pushes within an isolate to avoid a token
// round-trip per entry. Keyed by the connection row id (which is workspace-scoped)
// so a token is NEVER reused across workspaces — tenant/client ids are not secret,
// so keying on them would let one workspace ride another's warm token. Expired 60s
// early for safety.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(connection: Connection): Promise<string> {
  const { tenantId, clientId, clientSecret } = creds(connection);
  const origin = orgOrigin(connection.baseUrl);
  const cacheKey = connection.id;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: `${origin}/.default`,
      }),
    },
  );

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new IntegrationError(
      `Dynamics authentication failed: ${body.error_description ?? body.error ?? res.statusText}`,
    );
  }

  const expiresAt = Date.now() + Math.max(0, (body.expires_in ?? 3600) - 60) * 1000;
  tokenCache.set(cacheKey, { token: body.access_token, expiresAt });
  return body.access_token;
}

async function readError(res: Response): Promise<string> {
  // Cap the surfaced upstream body — it reaches the client; don't echo an
  // arbitrary/large response back as an oracle.
  const text = (await res.text().catch(() => "")).slice(0, 200);
  try {
    const json = JSON.parse(text);
    return json?.error?.message ?? text ?? res.statusText;
  } catch {
    return text || res.statusText;
  }
}

export const dynamicsAdapter: IntegrationAdapter = {
  async pushTimeEntry(ctx: PushContext): Promise<{ externalId: string }> {
    const { connection, project, entry, comment } = ctx;
    if (!project.externalProjectId) {
      throw new IntegrationError(
        `Project "${project.name}" is missing a Dynamics project ID.`,
      );
    }

    const token = await getAccessToken(connection);
    const origin = orgOrigin(connection.baseUrl);

    // Dynamics stores duration in whole minutes and the date as YYYY-MM-DD.
    const record: Record<string, unknown> = {
      msdyn_duration: Math.max(1, Math.round(entry.durationSeconds / 60)),
      msdyn_date: entry.localDate,
      msdyn_description: comment,
      "msdyn_project@odata.bind": `/msdyn_projects(${project.externalProjectId})`,
    };
    if (project.externalTaskId) {
      record["msdyn_projecttask@odata.bind"] = `/msdyn_projecttasks(${project.externalTaskId})`;
    }

    const res = await fetch(`${origin}/api/data/${API_VERSION}/msdyn_timeentries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Prefer: "return=representation",
      },
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      throw new IntegrationError(`Dynamics push failed: ${await readError(res)}`);
    }

    const body = (await res.json().catch(() => ({}))) as { msdyn_timeentryid?: string };
    const externalId =
      body.msdyn_timeentryid ??
      res.headers.get("OData-EntityId")?.match(/\(([^)]+)\)/)?.[1];
    if (!externalId) {
      throw new IntegrationError("Dynamics did not return a time entry ID.");
    }
    return { externalId };
  },

  async test(connection: Connection): Promise<void> {
    // A successful token fetch confirms tenant/client/secret and org scope.
    await getAccessToken(connection);
  },
};
