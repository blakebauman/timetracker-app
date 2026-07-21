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
  roundMode: z.enum(["off", "nearest", "up", "down"]),
  roundMinutes: z.number().int(),
  // Calendar preferences: first day of the week (0=Sun … 6=Sat) and whether
  // Sat/Sun columns are shown on the calendar grid.
  weekStart: z.number().int().min(0).max(6),
  showWeekends: z.boolean(),
  // When on, new projects get a distinct palette color instead of the default.
  autoAssignColors: z.boolean(),
});

export const UpdateSettingsSchema = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/, "Must be a 3-letter currency code"),
    timeFormat: TimeFormatSchema,
    roundMode: z.enum(["off", "nearest", "up", "down"]),
    roundMinutes: z.coerce.number().int().min(0).max(1440),
    weekStart: z.coerce.number().int().min(0).max(6),
    showWeekends: z.boolean(),
    autoAssignColors: z.boolean(),
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
  color: z.string(),
});

export const UpdateTagSchema = z.object({
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});

// ─── Favorites ───────────────────────────────────────────────────────────────

// A saved timer preset started in one click (Toggl-style favorites). Project and
// task names/colors are joined in for display; tags ride along as a JSON array.
export const FavoriteSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  description: z.string(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  projectColor: z.string().nullable(),
  taskId: z.string().nullable(),
  taskName: z.string().nullable(),
  tags: z.array(z.string()),
  billable: z.boolean(),
  createdAt: z.string(),
});

export const CreateFavoriteSchema = z.object({
  description: z.string().max(2000).default(""),
  projectId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  tags: z.array(z.string().max(100)).max(50).default([]),
  billable: z.boolean().default(false),
});

// ─── Recurring entries ───────────────────────────────────────────────────────

// A template that auto-materializes a completed entry on a weekly schedule.
// Schedule is stored in UTC (daysOfWeek = UTC weekdays, timeUtcMinutes = minutes
// since UTC midnight); the client converts to/from the user's local tz.
export const RecurringEntrySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  description: z.string(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  projectColor: z.string().nullable(),
  taskId: z.string().nullable(),
  taskName: z.string().nullable(),
  tags: z.array(z.string()),
  billable: z.boolean(),
  durationSeconds: z.number(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  timeUtcMinutes: z.number().int().min(0).max(1439),
  active: z.boolean(),
  lastMaterialized: z.string().nullable(),
  createdAt: z.string(),
});

export const CreateRecurringEntrySchema = z.object({
  description: z.string().max(2000).default(""),
  projectId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  tags: z.array(z.string().max(100)).max(50).default([]),
  billable: z.boolean().default(false),
  durationSeconds: z.number().int().min(60).max(86_400),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  timeUtcMinutes: z.number().int().min(0).max(1439),
});

export const UpdateRecurringEntrySchema = CreateRecurringEntrySchema.partial().extend({
  active: z.boolean().optional(),
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
  calendarEventId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Max rows `GET /time_entries` returns (newest first). Shared so the list view
// can tell the user when a wide range like "All dates" has been truncated
// rather than silently dropping the oldest entries.
export const ENTRY_LIST_LIMIT = 500;

// ─── Description autocomplete ────────────────────────────────────────────────
// One suggestion per distinct past description, carrying the project/task combo
// it was most often logged against so picking it refills the whole timer bar.
export const EntrySuggestionSchema = z.object({
  description: z.string(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  projectColor: z.string().nullable(),
  taskId: z.string().nullable(),
  taskName: z.string().nullable(),
  billable: z.boolean(),
  // Tag names from the *most recent* entry with this description (not the
  // dominant combo) — carried over when the suggestion is picked.
  tags: z.array(z.string()),
  // Total times this description was logged in the lookback window, and when it
  // was last used — the client ranks on both.
  uses: z.number(),
  lastUsed: z.string(),
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
    calendarEventId: z.string().nullable().optional(),
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

// ─── Assistant (Aski) ────────────────────────────────────────────────────────

// A proactive prompt computed server-side from calendar events, today's
// entries, and the running timer. `id` is stable per underlying fact (same
// event → same id) so the client can persist dismissals across polls.
export const AssistantNudgeSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "untracked_meeting", // a calendar event ended and isn't on the timesheet
    "meeting_now", // an event is happening now but no timer is running
    "meeting_soon", // an event starts within the lookahead window
    "long_timer", // the running timer has been going suspiciously long
    "nothing_tracked", // late morning on a weekday with an empty timesheet
  ]),
  title: z.string(),
  body: z.string(),
  // Present when the nudge maps to a one-click action on a calendar event.
  event: z
    .object({
      calendarEventId: z.string(),
      title: z.string(),
      start: z.string(),
      stop: z.string(),
    })
    .nullable()
    .default(null),
});

// Aski's chat itself now streams through the ChatAgent Durable Object
// (useAgentChat over WebSocket), so there's no request/response schema for it
// here. What remains are the deterministic nudge action + the memory the
// assistant accumulates about the user.

// A durable fact Aski has remembered, surfaced in Settings for review/removal.
export const AssistantMemorySchema = z.object({
  key: z.string(),
  content: z.string(),
  updatedAt: z.string(),
});

// One-click "Add to timesheet" on an untracked-meeting nudge. Server-side so
// the entry gets AI project inference (grounded, best-effort) before insert.
export const AssistantTrackEventRequestSchema = z
  .object({
    calendarEventId: z.string().min(1).max(500),
    title: z.string().max(500),
    start: z.string(),
    stop: z.string(),
  })
  .refine((d) => new Date(d.stop) > new Date(d.start), {
    message: "Stop time must be after start time",
    path: ["stop"],
  });

export const AssistantTrackEventResultSchema = z.object({
  created: z.boolean(), // false when the event was already tracked (idempotent)
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  billable: z.boolean(),
});

// ─── Inferred types ──────────────────────────────────────────────────────────

export type Workspace = z.infer<typeof WorkspaceSchema>;
export type Client = z.infer<typeof ClientSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Tag = z.infer<typeof TagSchema>;
export type UpdateTag = z.infer<typeof UpdateTagSchema>;
export type Favorite = z.infer<typeof FavoriteSchema>;
export type CreateFavorite = z.infer<typeof CreateFavoriteSchema>;
export type RecurringEntry = z.infer<typeof RecurringEntrySchema>;
export type CreateRecurringEntry = z.infer<typeof CreateRecurringEntrySchema>;
export type UpdateRecurringEntry = z.infer<typeof UpdateRecurringEntrySchema>;
export type TimeEntry = z.infer<typeof TimeEntrySchema>;
export type EntrySuggestion = z.infer<typeof EntrySuggestionSchema>;
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
export type AssistantNudge = z.infer<typeof AssistantNudgeSchema>;
export type AssistantMemory = z.infer<typeof AssistantMemorySchema>;
export type AssistantTrackEventRequest = z.infer<typeof AssistantTrackEventRequestSchema>;
export type AssistantTrackEventResult = z.infer<typeof AssistantTrackEventResultSchema>;
