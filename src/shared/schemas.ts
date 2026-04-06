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
  archived: z.boolean(),
  createdAt: z.string(),
});

export const CreateClientSchema = z.object({
  name: z.string().min(1),
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
  createdAt: z.string(),
});

export const CreateProjectSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#0ea5e9"),
  clientId: z.string().nullable().optional(),
  billable: z.boolean().default(false),
  rate: z.number().nullable().optional(),
});

export const UpdateProjectSchema = CreateProjectSchema.partial().extend({
  active: z.boolean().optional(),
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
  description: z.string().default(""),
  projectId: z.string().nullable().optional(),
  start: z.string(),
  stop: z.string().nullable().optional(),
  billable: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});

export const UpdateTimeEntrySchema = z.object({
  description: z.string().optional(),
  projectId: z.string().nullable().optional(),
  start: z.string().optional(),
  stop: z.string().nullable().optional(),
  billable: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

// ─── Reports ─────────────────────────────────────────────────────────────────

export const ReportQuerySchema = z.object({
  since: z.string(),
  until: z.string(),
  groupBy: z.enum(["day", "week", "month"]).default("day"),
  projectId: z.string().optional(),
  clientId: z.string().optional(),
});

// ─── Inferred types ──────────────────────────────────────────────────────────

export type Workspace = z.infer<typeof WorkspaceSchema>;
export type Client = z.infer<typeof ClientSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Tag = z.infer<typeof TagSchema>;
export type TimeEntry = z.infer<typeof TimeEntrySchema>;
export type CreateTimeEntry = z.infer<typeof CreateTimeEntrySchema>;
export type UpdateTimeEntry = z.infer<typeof UpdateTimeEntrySchema>;
export type CreateProject = z.infer<typeof CreateProjectSchema>;
export type CreateClient = z.infer<typeof CreateClientSchema>;
