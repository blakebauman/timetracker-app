import { z } from "zod";

// ─── Workspace ───────────────────────────────────────────────────────────────

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

// ─── Client ──────────────────────────────────────────────────────────────────

export const ClientSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  archived: z.boolean(),
  createdAt: z.string(),
});

export const CreateClientSchema = z.object({
  name: z.string().min(1).max(255),
  notes: z.string().max(2000).nullable().optional(),
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
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateTimeEntrySchema = z.object({
  description: z.string().max(2000).default(""),
  projectId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  start: z.string(),
  stop: z.string().nullable().optional(),
  billable: z.boolean().default(false),
  tags: z.array(z.string().max(100)).max(50).default([]),
});

export const UpdateTimeEntrySchema = z.object({
  description: z.string().max(2000).optional(),
  projectId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  start: z.string().optional(),
  stop: z.string().nullable().optional(),
  billable: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

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

export const ReportQuerySchema = z.object({
  since: z.string(),
  until: z.string(),
  groupBy: z.enum(["day", "week", "month"]).default("day"),
  projectId: z.string().optional(),
  clientId: z.string().optional(),
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
export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;
export type AiQuickEntryRequest = z.infer<typeof AiQuickEntryRequestSchema>;
export type AiQuickEntryRaw = z.infer<typeof AiQuickEntryRawSchema>;
export type AiQuickEntryResult = z.infer<typeof AiQuickEntryResultSchema>;
export type AiSummaryRequest = z.infer<typeof AiSummaryRequestSchema>;
export type AiSummaryResult = z.infer<typeof AiSummaryResultSchema>;
