import { z } from "zod";

// ─── Workspace ───────────────────────────────────────────────────────────────

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

// ─── Settings ────────────────────────────────────────────────────────────────

export const TimeFormatSchema = z.enum(["24h", "12h"]);

// Per-user display settings persisted to D1 (survive a localStorage wipe).
export const SettingsSchema = z.object({
  currency: z.string(), // ISO 4217 code, e.g. "USD"
  timeFormat: TimeFormatSchema,
});

export const UpdateSettingsSchema = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/, "Must be a 3-letter currency code"),
    timeFormat: TimeFormatSchema,
  })
  .partial();

export type Settings = z.infer<typeof SettingsSchema>;
export type UpdateSettings = z.infer<typeof UpdateSettingsSchema>;

// ─── Client ──────────────────────────────────────────────────────────────────

export const ClientSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  archived: z.boolean(),
  createdAt: z.string(),
});

export const CreateClientSchema = z.object({
  name: z.string().min(1).max(255),
  notes: z.string().max(2000).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
});

export const UpdateClientSchema = CreateClientSchema.partial().extend({
  archived: z.boolean().optional(),
});

// ─── Project ─────────────────────────────────────────────────────────────────

export const ProjectSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  name: z.string(),
  color: z.string(),
  billable: z.boolean(),
  rate: z.number().nullable(),
  active: z.boolean(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  estimatedHours: z.number().nullable(),
  integrationId: z.string().nullable(),
  externalProjectId: z.string().nullable(),
  externalTaskId: z.string().nullable(),
  trackedSeconds: z.number().default(0),
  createdAt: z.string(),
});

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#0ea5e9"),
  clientId: z.string().nullable().optional(),
  billable: z.boolean().default(false),
  rate: z.number().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  integrationId: z.string().nullable().optional(),
  externalProjectId: z.string().max(255).nullable().optional(),
  externalTaskId: z.string().max(255).nullable().optional(),
});

export const UpdateProjectSchema = CreateProjectSchema.partial().extend({
  active: z.boolean().optional(),
});

// ─── Task ─────────────────────────────────────────────────────────────────────

export const TaskSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  projectId: z.string(),
  projectName: z.string().nullable(),
  projectColor: z.string().nullable(),
  name: z.string(),
  active: z.boolean(),
  estimatedSeconds: z.number().nullable(),
  trackedSeconds: z.number(),
  createdAt: z.string(),
});

export const CreateTaskSchema = z.object({
  name: z.string().min(1).max(255),
  projectId: z.string(),
  estimatedSeconds: z.number().nullable().optional(),
});

export const UpdateTaskSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  active: z.boolean().optional(),
  estimatedSeconds: z.number().nullable().optional(),
});

// ─── Tag ─────────────────────────────────────────────────────────────────────

export const TagSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
});

// ─── Time Entry ──────────────────────────────────────────────────────────────

export const TimeEntrySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  projectColor: z.string().nullable(),
  taskId: z.string().nullable(),
  taskName: z.string().nullable(),
  description: z.string(),
  start: z.string(),
  stop: z.string().nullable(),
  duration: z.number().nullable(),
  billable: z.boolean(),
  tags: z.array(z.string()),
  syncStatus: z.enum(["synced", "error"]).nullable(),
  externalId: z.string().nullable(),
  syncedAt: z.string().nullable(),
  syncError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateTimeEntrySchema = z
  .object({
    description: z.string().max(2000).default(""),
    projectId: z.string().nullable().optional(),
    taskId: z.string().nullable().optional(),
    start: z.string(),
    stop: z.string().nullable().optional(),
    billable: z.boolean().default(false),
    tags: z.array(z.string().max(100)).max(50).default([]),
  })
  .refine((data) => !data.stop || new Date(data.stop) > new Date(data.start), {
    message: "Stop time must be after start time",
    path: ["stop"],
  });

export const UpdateTimeEntrySchema = z
  .object({
    description: z.string().max(2000).optional(),
    projectId: z.string().nullable().optional(),
    taskId: z.string().nullable().optional(),
    start: z.string().optional(),
    stop: z.string().nullable().optional(),
    billable: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
  })
  .refine(
    (data) => !data.start || !data.stop || new Date(data.stop) > new Date(data.start),
    { message: "Stop time must be after start time", path: ["stop"] }
  );

export const BulkUpdateTimeEntriesSchema = z.object({
  ids: z.array(z.string()).min(1),
  patch: z.object({
    projectId: z.string().nullable().optional(),
    taskId: z.string().nullable().optional(),
    billable: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
  }),
});

export const BulkDeleteTimeEntriesSchema = z.object({
  ids: z.array(z.string()).min(1),
});

// ─── Reports ─────────────────────────────────────────────────────────────────

// Optional comma-separated list of IDs → string[] (e.g. "a,b,c"). Undefined when absent.
const csvIds = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(",").filter(Boolean) : undefined));

export const RoundingModeSchema = z.enum(["off", "nearest", "up", "down"]);

export const ReportQuerySchema = z.object({
  since: z.string(),
  until: z.string(),
  groupBy: z.enum(["day", "week", "month"]).default("day"),
  projectIds: csvIds,
  clientIds: csvIds,
  taskIds: csvIds,
  tagIds: csvIds,
  // billable = only billable entries, nonbillable = only non-billable
  billable: z.enum(["billable", "nonbillable"]).optional(),
  // free-text search over the entry description
  search: z.string().optional(),
  // per-entry duration rounding applied before aggregation
  roundMode: RoundingModeSchema.optional(),
  roundMinutes: z.coerce.number().int().min(0).max(1440).optional(),
});

// Group/sub-group dimensions for the grouped summary tree.
export const GroupDimensionSchema = z.enum(["project", "client", "task", "tag"]);
export const SubGroupDimensionSchema = z.enum([
  "none",
  "project",
  "client",
  "task",
  "tag",
]);

export const GroupedReportQuerySchema = ReportQuerySchema.extend({
  group: GroupDimensionSchema.default("project"),
  subGroup: SubGroupDimensionSchema.default("none"),
});

// ─── Saved reports ───────────────────────────────────────────────────────────

// Config is a serialized report view; validated loosely (client owns the shape).
export const SavedReportSchema = z.object({
  id: z.string(),
  name: z.string(),
  config: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateSavedReportSchema = z.object({
  name: z.string().min(1).max(120),
  config: z.record(z.string(), z.unknown()),
});

export type SavedReport = z.infer<typeof SavedReportSchema>;
export type CreateSavedReport = z.infer<typeof CreateSavedReportSchema>;

// ─── Integrations ──────────────────────────────────────────────────────────────

export const IntegrationTypeSchema = z.enum(["workfront", "dynamics"]);

// Per-type credential shapes (only ever sent to the server, never returned).
export const WorkfrontCredentialsSchema = z.object({
  apiKey: z.string().min(1),
});
export const DynamicsCredentialsSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});
export const IntegrationCredentialsSchema = z.union([
  WorkfrontCredentialsSchema,
  DynamicsCredentialsSchema,
]);

// API response shape — no secrets, only whether credentials are set.
export const IntegrationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  type: IntegrationTypeSchema,
  name: z.string(),
  baseUrl: z.string(),
  hasCredentials: z.boolean(),
  createdAt: z.string(),
});

export const CreateIntegrationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("workfront"),
    name: z.string().min(1).max(255),
    baseUrl: z.string().min(1).max(500),
    credentials: WorkfrontCredentialsSchema,
  }),
  z.object({
    type: z.literal("dynamics"),
    name: z.string().min(1).max(255),
    baseUrl: z.string().min(1).max(500),
    credentials: DynamicsCredentialsSchema,
  }),
]);

// Type is immutable on update so the stored credential shape stays aligned.
export const UpdateIntegrationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  baseUrl: z.string().min(1).max(500).optional(),
  credentials: IntegrationCredentialsSchema.optional(),
});

export const PushTimeEntriesSchema = z.object({
  entryIds: z.array(z.string()).min(1).max(200),
  comment: z.string().max(2000).optional(),
});

export const PushResultSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  externalId: z.string().optional(),
  error: z.string().optional(),
});

// ─── AI ──────────────────────────────────────────────────────────────────────

export const AiQuickEntryRequestSchema = z.object({
  text: z.string().min(1).max(1000),
  // Client's local "now" and timezone offset, so relative phrases like
  // "yesterday afternoon" resolve against the user's clock, not the server's.
  referenceDate: z.string(),
  timezoneOffsetMinutes: z.number(),
});

// Shape the model must return.
export const AiQuickEntryRawSchema = z.object({
  projectName: z.string().nullable(),
  taskName: z.string().nullable(),
  description: z.string(),
  start: z.string(),
  stop: z.string().nullable(),
  billable: z.boolean(),
  tags: z.array(z.string()).max(10).default([]),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
});

// What the API returns to the frontend: the raw guess plus grounding
// resolution, so the preview can show real picker values instead of free text.
export const AiQuickEntryResultSchema = z.object({
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  projectMatched: z.boolean(),
  taskId: z.string().nullable(),
  taskName: z.string().nullable(),
  taskMatched: z.boolean(),
  description: z.string(),
  start: z.string(),
  stop: z.string().nullable(),
  billable: z.boolean(),
  tags: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
  warnings: z.array(z.string()).default([]),
});

export const AiSummaryRequestSchema = z.object({
  since: z.string(),
  until: z.string(),
  projectId: z.string().optional(),
  clientId: z.string().optional(),
  style: z.enum(["narrative", "bullets"]).default("bullets"),
});

export const AiSummaryResultSchema = z.object({
  summary: z.string(),
  entryCount: z.number(),
  totalSeconds: z.number(),
});

// ─── Inferred types ──────────────────────────────────────────────────────────

export type Workspace = z.infer<typeof WorkspaceSchema>;
export type Client = z.infer<typeof ClientSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Tag = z.infer<typeof TagSchema>;
export type TimeEntry = z.infer<typeof TimeEntrySchema>;
export type CreateTimeEntry = z.infer<typeof CreateTimeEntrySchema>;
export type UpdateTimeEntry = z.infer<typeof UpdateTimeEntrySchema>;
export type CreateProject = z.infer<typeof CreateProjectSchema>;
export type CreateClient = z.infer<typeof CreateClientSchema>;
export type UpdateClient = z.infer<typeof UpdateClientSchema>;
export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;
export type IntegrationType = z.infer<typeof IntegrationTypeSchema>;
export type Integration = z.infer<typeof IntegrationSchema>;
export type CreateIntegration = z.infer<typeof CreateIntegrationSchema>;
export type UpdateIntegration = z.infer<typeof UpdateIntegrationSchema>;
export type WorkfrontCredentials = z.infer<typeof WorkfrontCredentialsSchema>;
export type DynamicsCredentials = z.infer<typeof DynamicsCredentialsSchema>;
export type IntegrationCredentials = z.infer<typeof IntegrationCredentialsSchema>;
export type PushTimeEntries = z.infer<typeof PushTimeEntriesSchema>;
export type PushResult = z.infer<typeof PushResultSchema>;
export type AiQuickEntryRequest = z.infer<typeof AiQuickEntryRequestSchema>;
export type AiQuickEntryRaw = z.infer<typeof AiQuickEntryRawSchema>;
export type AiQuickEntryResult = z.infer<typeof AiQuickEntryResultSchema>;
export type AiSummaryRequest = z.infer<typeof AiSummaryRequestSchema>;
export type AiSummaryResult = z.infer<typeof AiSummaryResultSchema>;
