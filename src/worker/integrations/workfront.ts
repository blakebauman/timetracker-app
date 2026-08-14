import type { WorkfrontCredentials } from "@shared/schemas";
import {
  IntegrationError,
  type Connection,
  type IntegrationAdapter,
  type PushContext,
} from "./types";
import { safeIntegrationOrigin } from "./url-guard";

const API_VERSION = "v15.0";

// Normalise a stored base_url (domain or full URL) into the REST API root, after
// SSRF-validating the host, e.g.
// "acme.my.workfront.com" -> "https://acme.my.workfront.com/attask/api/v15.0".
function apiRoot(baseUrl: string): string {
  return `${safeIntegrationOrigin(baseUrl, "workfront")}/attask/api/${API_VERSION}`;
}

function creds(connection: Connection): WorkfrontCredentials {
  return connection.credentials as WorkfrontCredentials;
}

// Cap the surfaced upstream body: it reaches the client, so don't let it echo an
// arbitrary/large response back as an oracle.
async function readError(res: Response): Promise<string> {
  const text = (await res.text().catch(() => "")).slice(0, 200);
  try {
    const json = JSON.parse(text);
    return json?.error?.message ?? json?.message ?? text ?? res.statusText;
  } catch {
    return text || res.statusText;
  }
}

export const workfrontAdapter: IntegrationAdapter = {
  async pushTimeEntry(ctx: PushContext): Promise<{ externalId: string }> {
    const { connection, project, entry, comment } = ctx;
    const { apiKey } = creds(connection);

    // Workfront logs time as an HOUR object. hours is a decimal value and
    // entryDate is the calendar day (YYYY-MM-DD) the work was performed.
    const hours = Math.round((entry.durationSeconds / 3600) * 100) / 100;

    const fields = new URLSearchParams({ hours: String(hours), entryDate: entry.localDate });
    if (comment) fields.set("description", comment);
    if (project.externalTaskId) fields.set("taskID", project.externalTaskId);
    else if (project.externalProjectId) fields.set("projectID", project.externalProjectId);
    else {
      throw new IntegrationError(
        `Project "${project.name}" is missing a Workfront task or project ID.`,
      );
    }

    // Workfront routes writes via the `method` parameter (POST alone yields
    // "Method Not Allowed"). apiKey + method go on the query, object fields in
    // the form-encoded body.
    const auth = new URLSearchParams({ apiKey, method: "POST" });
    const res = await fetch(`${apiRoot(connection.baseUrl)}/hour?${auth}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: fields.toString(),
    });
    if (!res.ok) {
      throw new IntegrationError(`Workfront push failed: ${await readError(res)}`);
    }

    const body = (await res.json()) as { data?: { ID?: string } };
    const externalId = body?.data?.ID;
    if (!externalId) {
      throw new IntegrationError("Workfront did not return an hour ID.");
    }
    return { externalId };
  },

  async test(connection: Connection): Promise<void> {
    const { apiKey } = creds(connection);
    // A minimal authenticated read: valid keys return data, invalid keys error.
    const params = new URLSearchParams({ apiKey, $$LIMIT: "1" });
    const res = await fetch(
      `${apiRoot(connection.baseUrl)}/user/search?${params}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) {
      throw new IntegrationError(`Workfront connection failed: ${await readError(res)}`);
    }
  },
};
