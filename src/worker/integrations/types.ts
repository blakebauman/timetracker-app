import type {
  IntegrationType,
  IntegrationCredentials,
} from "@shared/schemas";

// A decrypted connection ready to talk to an external system.
export interface Connection {
  id: string;
  type: IntegrationType;
  name: string;
  baseUrl: string;
  credentials: IntegrationCredentials;
}

// The subset of a project an adapter needs to map to external identifiers.
export interface ProjectRef {
  id: string;
  name: string;
  externalProjectId: string | null;
  externalTaskId: string | null;
}

// The subset of a time entry an adapter pushes.
export interface EntryRef {
  id: string;
  description: string;
  start: string; // ISO 8601
  stop: string | null; // ISO 8601
  durationSeconds: number; // > 0 for a completed entry
}

export interface PushContext {
  connection: Connection;
  project: ProjectRef;
  entry: EntryRef;
  comment: string; // resolved comment (entry description or an override)
}

export interface IntegrationAdapter {
  /** Push one completed time entry; resolves to the external record id. */
  pushTimeEntry(ctx: PushContext): Promise<{ externalId: string }>;
  /** Lightweight credential/connectivity check. Throws on failure. */
  test(connection: Connection): Promise<void>;
}

// Raised by adapters with a user-presentable message.
export class IntegrationError extends Error {}
