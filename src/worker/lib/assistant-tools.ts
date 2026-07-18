// Aski's tools (Tier 1): the actions the chat agent can take on the user's
// behalf. Each wraps the SAME D1 writes + WebSocket broadcasts the REST routes
// use (see routes/time-entries.ts), so a timer the assistant starts/stops syncs
// to every open tab and the extension exactly like a manual one. Project names
// are resolved through the same grounded fuzzy matcher as quick-entry, so the
// model can only ever land on a real project id (or none).

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { broadcast, getEntryById } from "../db/queries";
import { loadGroundingProjects, resolveGrounding, inferEventProjects } from "./ai";
import { rememberFact, searchMemories } from "./assistant-memory";

export interface AssistantToolContext {
  env: Env;
  workspaceId: string;
  /** JS getTimezoneOffset() convention (minutes); used only for human-readable echoes. */
  offsetMinutes: number;
}

const ISO = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO 8601 timestamp");

/** Resolve a free-text project name to a real id via the grounded matcher. */
async function resolveProject(
  env: Env,
  workspaceId: string,
  projectName: string | null | undefined
): Promise<{ projectId: string | null; projectName: string | null; billable: boolean; warning?: string }> {
  if (!projectName) return { projectId: null, projectName: null, billable: false };
  const projects = await loadGroundingProjects(env.DB, workspaceId);
  const r = resolveGrounding(projectName, null, projects);
  if (!r.projectMatched) {
    return { projectId: null, projectName: null, billable: false, warning: r.warnings[0] };
  }
  const matched = projects.find((p) => p.id === r.projectId)!;
  return { projectId: matched.id, projectName: matched.name, billable: matched.billable };
}

export function buildAssistantTools(ctx: AssistantToolContext): ToolSet {
  const { env, workspaceId } = ctx;
  const db = env.DB;

  return {
    startTimer: tool({
      description:
        "Start a new running timer for the user. Automatically stops any timer that is already running (same as the app's Start button). Use when the user says they're starting or now working on something.",
      inputSchema: z.object({
        description: z.string().max(500).describe("What the user is working on"),
        projectName: z
          .string()
          .nullish()
          .describe("Exact name of a known project to bill it to, or omit"),
        billable: z
          .boolean()
          .nullish()
          .describe("Override billable; defaults to the project's default"),
      }),
      execute: async ({ description, projectName, billable }) => {
        const now = new Date().toISOString();
        const proj = await resolveProject(env, workspaceId, projectName);
        // Stop whatever is running first, mirroring POST /time_entries.
        await db
          .prepare(
            `UPDATE time_entries
             SET stop = ?, duration = CAST((julianday(?) - julianday(start)) * 86400 + 0.5 AS INTEGER), updated_at = ?
             WHERE workspace_id = ? AND stop IS NULL`
          )
          .bind(now, now, now, workspaceId)
          .run();
        const id = crypto.randomUUID();
        await db
          .prepare(
            `INSERT INTO time_entries
               (id, workspace_id, project_id, task_id, description, start, stop, duration, billable, calendar_event_id, created_at, updated_at)
             VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL, ?, NULL, ?, ?)`
          )
          .bind(
            id,
            workspaceId,
            description,
            now,
            (billable ?? proj.billable) ? 1 : 0,
            now,
            now
          )
          .run();
        const entry = await getEntryById(db, id, workspaceId);
        await broadcast(env, workspaceId, "timer:start", entry);
        return {
          ok: true,
          startedAt: now,
          project: proj.projectName,
          billable: (billable ?? proj.billable) ? true : false,
          note: proj.warning,
        };
      },
    }),

    stopTimer: tool({
      description:
        "Stop the currently running timer. No-op (ok:false) if nothing is running.",
      inputSchema: z.object({}),
      execute: async () => {
        const running = await db
          .prepare(`SELECT id, start FROM time_entries WHERE workspace_id = ? AND stop IS NULL LIMIT 1`)
          .bind(workspaceId)
          .first<{ id: string; start: string }>();
        if (!running) return { ok: false, reason: "No timer is running." };
        const now = new Date().toISOString();
        await db
          .prepare(
            `UPDATE time_entries
             SET stop = ?, duration = CAST((julianday(?) - julianday(start)) * 86400 + 0.5 AS INTEGER), updated_at = ?
             WHERE id = ? AND workspace_id = ? AND stop IS NULL`
          )
          .bind(now, now, now, running.id, workspaceId)
          .run();
        const entry = await getEntryById(db, running.id, workspaceId);
        await broadcast(env, workspaceId, "timer:stop", entry);
        const seconds = Math.round((Date.parse(now) - Date.parse(running.start)) / 1000);
        return { ok: true, stoppedAt: now, durationHours: (seconds / 3600).toFixed(2) };
      },
    }),

    logTimeEntry: tool({
      description:
        "Log a COMPLETED past time entry (both start and stop known). Use for retroactively recording work, e.g. 'I worked on Acme from 2 to 4pm'. Do not use to start a live timer.",
      inputSchema: z.object({
        description: z.string().max(500),
        start: ISO.describe("UTC ISO 8601 start"),
        stop: ISO.describe("UTC ISO 8601 stop; must be after start"),
        projectName: z.string().nullish(),
        billable: z.boolean().nullish(),
      }),
      execute: async ({ description, start, stop, projectName, billable }) => {
        if (Date.parse(stop) <= Date.parse(start)) {
          return { ok: false, reason: "Stop must be after start." };
        }
        const proj = await resolveProject(env, workspaceId, projectName);
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        const duration = Math.round((Date.parse(stop) - Date.parse(start)) / 1000);
        await db
          .prepare(
            `INSERT INTO time_entries
               (id, workspace_id, project_id, task_id, description, start, stop, duration, billable, calendar_event_id, created_at, updated_at)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, ?)`
          )
          .bind(
            id,
            workspaceId,
            proj.projectId,
            description,
            start,
            stop,
            duration,
            (billable ?? proj.billable) ? 1 : 0,
            now,
            now
          )
          .run();
        const entry = await getEntryById(db, id, workspaceId);
        await broadcast(env, workspaceId, "entries:changed", entry);
        return {
          ok: true,
          durationHours: (duration / 3600).toFixed(2),
          project: proj.projectName,
          note: proj.warning,
        };
      },
    }),

    trackMeeting: tool({
      description:
        "Add a calendar meeting to the timesheet as a completed entry, categorized by AI project inference. Use for an untracked meeting the user asks to log.",
      inputSchema: z.object({
        title: z.string().max(500),
        start: ISO,
        stop: ISO,
      }),
      execute: async ({ title, start, stop }) => {
        if (Date.parse(stop) <= Date.parse(start)) {
          return { ok: false, reason: "Stop must be after start." };
        }
        let match = null;
        try {
          match = (await inferEventProjects(db, env.AI, workspaceId, [title])).get(title.trim()) ?? null;
        } catch {
          // best-effort
        }
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        const duration = Math.round((Date.parse(stop) - Date.parse(start)) / 1000);
        await db
          .prepare(
            `INSERT INTO time_entries
               (id, workspace_id, project_id, task_id, description, start, stop, duration, billable, calendar_event_id, created_at, updated_at)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, ?)`
          )
          .bind(id, workspaceId, match?.projectId ?? null, title, start, stop, duration, match?.billable ? 1 : 0, now, now)
          .run();
        const entry = await getEntryById(db, id, workspaceId);
        await broadcast(env, workspaceId, "entries:changed", entry);
        return { ok: true, project: match?.projectName ?? null, durationHours: (duration / 3600).toFixed(2) };
      },
    }),

    getTimeSummary: tool({
      description:
        "Summarize tracked time over a date range: total hours, billable split, and per-project breakdown. Dates are UTC ISO. Use to answer 'how much did I bill this week?'.",
      inputSchema: z.object({
        since: ISO.describe("range start (inclusive)"),
        until: ISO.describe("range end (exclusive)"),
      }),
      execute: async ({ since, until }) => {
        const { results } = await db
          .prepare(
            `SELECT COALESCE(p.name, 'No project') AS project,
                    SUM(te.duration) AS seconds,
                    SUM(CASE WHEN te.billable = 1 THEN te.duration ELSE 0 END) AS billable_seconds,
                    COUNT(*) AS entries
             FROM time_entries te
             LEFT JOIN projects p ON p.id = te.project_id
             WHERE te.workspace_id = ? AND te.stop IS NOT NULL AND te.start >= ? AND te.start < ?
             GROUP BY project ORDER BY seconds DESC`
          )
          .bind(workspaceId, since, until)
          .all<{ project: string; seconds: number; billable_seconds: number; entries: number }>();
        const totalSeconds = results.reduce((s, r) => s + (r.seconds ?? 0), 0);
        const billableSeconds = results.reduce((s, r) => s + (r.billable_seconds ?? 0), 0);
        return {
          totalHours: (totalSeconds / 3600).toFixed(2),
          billableHours: (billableSeconds / 3600).toFixed(2),
          byProject: results.map((r) => ({
            project: r.project,
            hours: ((r.seconds ?? 0) / 3600).toFixed(2),
            entries: r.entries,
          })),
        };
      },
    }),

    listProjects: tool({
      description: "List the workspace's active projects and their billable defaults.",
      inputSchema: z.object({}),
      execute: async () => {
        const projects = await loadGroundingProjects(db, workspaceId);
        return {
          projects: projects.map((p) => ({ name: p.name, billable: p.billable })),
        };
      },
    }),

    deleteEntry: tool({
      description:
        "Permanently delete a time entry by id. Destructive — requires user approval. Only call with an id the user clearly identified.",
      inputSchema: z.object({ id: z.string() }),
      // Native AI-SDK human-in-the-loop: the client must approve before execute runs.
      needsApproval: true,
      execute: async ({ id }) => {
        const res = await db
          .prepare(`DELETE FROM time_entries WHERE id = ? AND workspace_id = ?`)
          .bind(id, workspaceId)
          .run();
        const deleted = (res.meta?.changes ?? 0) > 0;
        if (deleted) await broadcast(env, workspaceId, "entries:changed", null);
        return { ok: deleted, reason: deleted ? undefined : "No entry with that id." };
      },
    }),

    rememberPreference: tool({
      description:
        "Remember a durable fact or preference about the user for future conversations, e.g. 'always mark Acme non-billable' or 'I start my day at 9am'. Use a short stable key.",
      inputSchema: z.object({
        key: z.string().max(80).describe("short slug identifying the fact, e.g. 'acme-billing'"),
        content: z.string().max(1000).describe("the fact, phrased so it's useful later"),
      }),
      execute: async ({ key, content }) => {
        const { key: saved } = await rememberFact(db, workspaceId, key, content);
        return { ok: true, key: saved };
      },
    }),

    searchMemory: tool({
      description: "Search previously remembered facts about the user by keyword.",
      inputSchema: z.object({ query: z.string().max(200) }),
      execute: async ({ query }) => {
        const memories = await searchMemories(db, workspaceId, query);
        return { memories: memories.map((m) => m.content) };
      },
    }),
  };
}
