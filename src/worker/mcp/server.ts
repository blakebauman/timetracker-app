// The MCP server: this workspace's time data, exposed to Claude, ChatGPT, or any
// other MCP client over Streamable HTTP.
//
// Every tool is a thin wrapper over the same helpers the REST API uses — the
// report builder, the pacing computation, the draft pipeline — so an answer
// given in a chat window and an answer given on the Reports page come from one
// implementation and cannot disagree.
//
// Two rules hold throughout:
//   1. A tool never sees a workspace id from the caller. The workspace is fixed
//      at construction from the resolved API key, so no argument a model can
//      invent reaches a tenant boundary.
//   2. Write tools are registered ONLY for a read_write key. A read key is not
//      told they exist, rather than being refused when it calls them.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildReportWhere, durationExpr, formatEntry, ENTRY_SELECT, broadcast } from "../db/queries";
import { loadProjectPacing } from "../lib/pacing";
import { generateDrafts, listDrafts } from "../lib/drafts";
import type { ApiKeyScope } from "../lib/api-keys";

/** Cap on rows any single tool returns, so one call can't blow the context window. */
const ROW_LIMIT = 200;

const SERVER_NAME = "timetracker";
const SERVER_VERSION = "1.0.0";

/** MCP tool results are text; JSON is the most reliably parsed shape for one. */
function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

const DateArg = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .describe("A calendar date, YYYY-MM-DD");

/**
 * A range of the caller's LOCAL dates → the UTC half-open interval the report
 * queries expect.
 *
 * The offset matters more than it looks. Asked "how much did I track
 * yesterday", a client seven hours west of UTC that got a UTC-day window would
 * report a day shifted by seven hours — quietly including the previous
 * evening's work and dropping its own. Defaults to 0 (UTC) when the client
 * doesn't say, which is at least a defensible reading of a bare date.
 */
function rangeToIso(since: string, until: string, offsetMinutes = 0) {
  const startMs = new Date(`${since}T00:00:00.000Z`).getTime() + offsetMinutes * 60_000;
  const endMs =
    new Date(`${until}T00:00:00.000Z`).getTime() + offsetMinutes * 60_000 + 86_400_000;
  return {
    sinceIso: new Date(startMs).toISOString(),
    untilIso: new Date(endMs).toISOString(),
  };
}

/** Shared arg so date ranges mean the caller's days, not the server's. */
const TimezoneArg = z
  .number()
  .int()
  .min(-900)
  .max(900)
  .default(0)
  .describe(
    "The user's UTC offset in minutes, JS getTimezoneOffset sign (west of UTC is positive). Pass it so the date range means their days, not UTC's."
  );

function hours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

export interface McpContext {
  env: Env;
  workspaceId: string;
  userId: string;
  scope: ApiKeyScope;
}

export function buildMcpServer(ctx: McpContext): McpServer {
  const { env, workspaceId, scope } = ctx;
  const db = env.DB;
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  // ─── Read ─────────────────────────────────────────────────────────────────

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "Every active project in the workspace with its client, billable default, hourly rate, time budget and total tracked time. Call this first when a question names a project or client.",
      inputSchema: {},
    },
    async () => {
      const { results } = await db
        .prepare(
          `SELECT p.id, p.name, p.billable, p.rate, p.estimated_hours, p.start_date, p.end_date,
                  c.name AS client_name,
                  COALESCE(SUM(te.duration), 0) AS tracked
           FROM projects p
           LEFT JOIN clients c ON c.id = p.client_id AND c.workspace_id = p.workspace_id
           LEFT JOIN time_entries te
             ON te.project_id = p.id AND te.workspace_id = p.workspace_id AND te.stop IS NOT NULL
           WHERE p.workspace_id = ? AND p.active = 1
           GROUP BY p.id ORDER BY p.name ASC`
        )
        .bind(workspaceId)
        .all<Record<string, unknown>>();

      return json(
        results.map((r) => ({
          id: r.id,
          name: r.name,
          client: r.client_name ?? null,
          billable: Boolean(r.billable),
          hourlyRate: r.rate ?? null,
          budgetHours: r.estimated_hours ?? null,
          trackedHours: hours((r.tracked as number) ?? 0),
          startDate: r.start_date ?? null,
          endDate: r.end_date ?? null,
        }))
      );
    }
  );

  server.registerTool(
    "list_clients",
    {
      title: "List clients",
      description: "Every client in the workspace, with how many projects each has.",
      inputSchema: {},
    },
    async () => {
      const { results } = await db
        .prepare(
          `SELECT c.id, c.name, c.archived, COUNT(p.id) AS project_count
           FROM clients c
           LEFT JOIN projects p ON p.client_id = c.id AND p.workspace_id = c.workspace_id
           WHERE c.workspace_id = ?
           GROUP BY c.id ORDER BY c.name ASC`
        )
        .bind(workspaceId)
        .all<Record<string, unknown>>();
      return json(
        results.map((r) => ({
          id: r.id,
          name: r.name,
          archived: Boolean(r.archived),
          projectCount: r.project_count,
        }))
      );
    }
  );

  server.registerTool(
    "get_time_summary",
    {
      title: "Summarize tracked time",
      description:
        "Total, billable and invoiceable time over a date range, broken down by project, client, task or tag. This is the tool for 'how much did I bill client X last quarter' and 'which project took the most time'. Amounts use each project's own hourly rate.",
      inputSchema: {
        since: DateArg.describe("First day of the range (inclusive), YYYY-MM-DD"),
        until: DateArg.describe("Last day of the range (inclusive), YYYY-MM-DD"),
        groupBy: z
          .enum(["project", "client", "task", "tag"])
          .default("project")
          .describe("Which dimension to break the total down by"),
        timezoneOffsetMinutes: TimezoneArg,
      },
    },
    async ({ since, until, groupBy, timezoneOffsetMinutes }) => {
      const { sinceIso, untilIso } = rangeToIso(since, until, timezoneOffsetMinutes);
      const { where, bindings } = buildReportWhere({
        workspaceId,
        since: sinceIso,
        until: untilIso,
      });
      const dur = durationExpr();
      const amount = `SUM((CASE WHEN te.billable = 1 THEN ${dur} ELSE 0 END) * COALESCE(p.rate, 0) / 3600.0)`;

      // Tag grouping needs the join table; the other three hang off the entry or
      // its project. Kept as one shape so the response is uniform whichever
      // dimension was asked for.
      const dimension = {
        project: { col: "te.project_id", name: "COALESCE(p.name, 'No project')", join: "" },
        client: {
          col: "p.client_id",
          name: "COALESCE(cl.name, 'No client')",
          join: `LEFT JOIN clients cl ON cl.id = p.client_id AND cl.workspace_id = te.workspace_id`,
        },
        task: {
          col: "te.task_id",
          name: "COALESCE(tk.name, 'No task')",
          join: `LEFT JOIN tasks tk ON tk.id = te.task_id AND tk.workspace_id = te.workspace_id`,
        },
        tag: {
          col: "t.id",
          name: "COALESCE(t.name, 'No tag')",
          join: `LEFT JOIN time_entry_tags tet ON tet.time_entry_id = te.id
                 LEFT JOIN tags t ON t.id = tet.tag_id AND t.workspace_id = te.workspace_id`,
        },
      }[groupBy];

      const [totals, grouped] = await db.batch<Record<string, unknown>>([
        db
          .prepare(
            `SELECT COUNT(*) AS entries, SUM(${dur}) AS total,
                    SUM(CASE WHEN te.billable = 1 THEN ${dur} ELSE 0 END) AS billable,
                    ${amount} AS amount
             FROM time_entries te
             LEFT JOIN projects p ON p.id = te.project_id
             WHERE ${where}`
          )
          .bind(...bindings),
        db
          .prepare(
            `SELECT ${dimension.name} AS name, COUNT(*) AS entries,
                    SUM(${dur}) AS total,
                    SUM(CASE WHEN te.billable = 1 THEN ${dur} ELSE 0 END) AS billable,
                    ${amount} AS amount
             FROM time_entries te
             LEFT JOIN projects p ON p.id = te.project_id
             ${dimension.join}
             WHERE ${where}
             GROUP BY ${dimension.col}
             ORDER BY total DESC`
          )
          .bind(...bindings),
      ]);

      const row = totals.results[0] ?? {};
      return json({
        range: { since, until },
        groupBy,
        totalHours: hours((row.total as number) ?? 0),
        billableHours: hours((row.billable as number) ?? 0),
        billableAmount: Math.round(((row.amount as number) ?? 0) * 100) / 100,
        entryCount: row.entries ?? 0,
        breakdown: grouped.results.map((r) => ({
          name: r.name,
          hours: hours((r.total as number) ?? 0),
          billableHours: hours((r.billable as number) ?? 0),
          amount: Math.round(((r.amount as number) ?? 0) * 100) / 100,
          entries: r.entries,
        })),
      });
    }
  );

  server.registerTool(
    "list_time_entries",
    {
      title: "List time entries",
      description:
        "Individual time entries in a date range, newest first — descriptions, projects, durations and billable flags. Use this when the question is about what specific work was done, not how much.",
      inputSchema: {
        since: DateArg.describe("First day of the range (inclusive), YYYY-MM-DD"),
        until: DateArg.describe("Last day of the range (inclusive), YYYY-MM-DD"),
        search: z
          .string()
          .max(200)
          .optional()
          .describe("Optional case-insensitive substring of the entry description"),
        timezoneOffsetMinutes: TimezoneArg,
      },
    },
    async ({ since, until, search, timezoneOffsetMinutes }) => {
      const { sinceIso, untilIso } = rangeToIso(since, until, timezoneOffsetMinutes);
      const clauses = [`te.workspace_id = ?`, `te.start >= ?`, `te.start < ?`];
      const bindings: unknown[] = [workspaceId, sinceIso, untilIso];
      if (search?.trim()) {
        clauses.push(`te.description LIKE ? ESCAPE '\\'`);
        bindings.push(`%${search.trim().replace(/[%_\\]/g, "\\$&")}%`);
      }

      const { results } = await db
        .prepare(
          `${ENTRY_SELECT} WHERE ${clauses.join(" AND ")}
           GROUP BY te.id ORDER BY te.start DESC LIMIT ${ROW_LIMIT}`
        )
        .bind(...bindings)
        .all<Record<string, unknown>>();

      return json(
        results.map(formatEntry).map((e) => ({
          id: e.id,
          date: e.start.slice(0, 10),
          start: e.start,
          stop: e.stop,
          hours: hours(e.duration ?? 0),
          description: e.description,
          project: e.projectName,
          task: e.taskName,
          billable: e.billable,
          tags: e.tags,
          running: e.stop === null,
        }))
      );
    }
  );

  server.registerTool(
    "get_project_pacing",
    {
      title: "Check project budgets",
      description:
        "For every budgeted project: how much of the budget is spent, the recent burn rate per working day, working days left before the end date, and whether the current rate overruns the budget. Use this for 'which projects are at risk' and 'am I going to blow the budget on X'.",
      inputSchema: {},
    },
    async () => {
      const pacing = await loadProjectPacing(db, workspaceId);
      return json(
        pacing.map((p) => ({
          project: p.projectName,
          client: p.clientName,
          status: p.status,
          budgetHours: p.estimatedSeconds ? hours(p.estimatedSeconds) : null,
          trackedHours: hours(p.trackedSeconds),
          percentUsed: p.percentUsed === null ? null : Math.round(p.percentUsed * 100),
          burnHoursPerWorkingDay: hours(p.burnPerWorkingDay),
          workingDaysRemaining: p.workingDaysRemaining,
          projectedHours: p.projectedSeconds === null ? null : hours(p.projectedSeconds),
          projectedOverrunHours:
            p.projectedOverrunSeconds === null ? null : hours(p.projectedOverrunSeconds),
          endDate: p.endDate,
        }))
      );
    }
  );

  server.registerTool(
    "get_running_timer",
    {
      title: "Check the running timer",
      description: "The timer running right now, if any, and how long it has been going.",
      inputSchema: {},
    },
    async () => {
      const row = await db
        .prepare(
          `SELECT te.id, te.description, te.start, p.name AS project_name
           FROM time_entries te
           LEFT JOIN projects p ON p.id = te.project_id AND p.workspace_id = te.workspace_id
           WHERE te.workspace_id = ? AND te.stop IS NULL
           ORDER BY te.start DESC LIMIT 1`
        )
        .bind(workspaceId)
        .first<Record<string, unknown>>();

      if (!row) return json({ running: false });
      const elapsed = Date.now() - new Date(row.start as string).getTime();
      return json({
        running: true,
        id: row.id,
        description: row.description,
        project: row.project_name ?? null,
        startedAt: row.start,
        elapsedHours: Math.round((elapsed / 3_600_000) * 100) / 100,
      });
    }
  );

  server.registerTool(
    "list_drafts",
    {
      title: "List drafted entries",
      description:
        "Proposed time entries waiting for review on a given day, with why each was proposed. Drafts are NOT tracked time and do not appear in any report until a person confirms them in the app.",
      inputSchema: { date: DateArg.describe("The local day to inspect, YYYY-MM-DD") },
    },
    async ({ date }) => {
      const drafts = await listDrafts(db, workspaceId, ctx.userId, date);
      return json(
        drafts.map((d) => ({
          id: d.id,
          start: d.start,
          stop: d.stop,
          hours: hours(d.duration),
          description: d.description,
          project: d.projectName,
          billable: d.billable,
          source: d.source,
          confidence: d.confidence,
          why: d.reason,
        }))
      );
    }
  );

  // ─── Write ────────────────────────────────────────────────────────────────
  //
  // Registered only for a read_write key. A read-only key isn't shown these at
  // all — a tool a client can see but can never successfully call is worse than
  // one that was never advertised.
  if (scope !== "read_write") return server;

  server.registerTool(
    "start_timer",
    {
      title: "Start a timer",
      description:
        "Start tracking time now. Stops any timer already running, exactly as the app's own timer bar does. Pass a project id from list_projects when the work belongs to one.",
      inputSchema: {
        description: z.string().max(2000).describe("What is being worked on"),
        projectId: z
          .string()
          .optional()
          .describe("A project id from list_projects; omit if the work has no project"),
      },
      annotations: { destructiveHint: false },
    },
    async ({ description, projectId }) => {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      // Billable follows the project's default, matching resolveBillable on the
      // REST path — a timer started from a chat window must not land
      // non-billable when the same work started in the app wouldn't.
      let billable = false;
      if (projectId) {
        const project = await db
          .prepare(`SELECT billable FROM projects WHERE id = ? AND workspace_id = ?`)
          .bind(projectId, workspaceId)
          .first<{ billable: number }>();
        if (!project) return text(`No project with id ${projectId} in this workspace.`);
        billable = Boolean(project.billable);
      }

      await db
        .prepare(
          `UPDATE time_entries
           SET stop = ?, duration = CAST((julianday(?) - julianday(start)) * 86400 + 0.5 AS INTEGER),
               updated_at = ?
           WHERE workspace_id = ? AND stop IS NULL`
        )
        .bind(now, now, now, workspaceId)
        .run();

      await db
        .prepare(
          `INSERT INTO time_entries
             (id, workspace_id, project_id, task_id, description, start, stop, duration, billable, created_at, updated_at)
           VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?, ?)`
        )
        .bind(id, workspaceId, projectId ?? null, description, now, billable ? 1 : 0, now, now)
        .run();

      await broadcast(env, workspaceId, "timer:start", { id });
      return text(`Started "${description}" at ${now}.`);
    }
  );

  server.registerTool(
    "stop_timer",
    {
      title: "Stop the running timer",
      description: "Stop whatever timer is currently running and keep the entry.",
      inputSchema: {},
    },
    async () => {
      const now = new Date().toISOString();
      const running = await db
        .prepare(
          `SELECT id, description, start FROM time_entries
           WHERE workspace_id = ? AND stop IS NULL ORDER BY start DESC LIMIT 1`
        )
        .bind(workspaceId)
        .first<{ id: string; description: string; start: string }>();
      if (!running) return text("No timer is running.");

      await db
        .prepare(
          `UPDATE time_entries
           SET stop = ?, duration = CAST((julianday(?) - julianday(start)) * 86400 + 0.5 AS INTEGER),
               updated_at = ?
           WHERE id = ? AND workspace_id = ?`
        )
        .bind(now, now, now, running.id, workspaceId)
        .run();

      await broadcast(env, workspaceId, "timer:stop", { id: running.id });
      const elapsed = Date.now() - new Date(running.start).getTime();
      return text(
        `Stopped "${running.description}" after ${Math.round(elapsed / 60_000)} minutes.`
      );
    }
  );

  server.registerTool(
    "log_time",
    {
      title: "Log a completed time entry",
      description:
        "Record work that has already happened. Times are ISO 8601 instants — resolve any relative phrasing before calling.",
      inputSchema: {
        description: z.string().max(2000).describe("What the work was"),
        start: z.string().describe("ISO 8601 start instant, e.g. 2026-08-24T14:00:00Z"),
        stop: z.string().describe("ISO 8601 stop instant, after start"),
        projectId: z.string().optional().describe("A project id from list_projects"),
        billable: z
          .boolean()
          .optional()
          .describe("Omit to inherit the project's billable default"),
      },
    },
    async ({ description, start, stop, projectId, billable }) => {
      const startMs = new Date(start).getTime();
      const stopMs = new Date(stop).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(stopMs)) {
        return text("start and stop must be ISO 8601 timestamps.");
      }
      if (stopMs <= startMs) return text("stop must be after start.");

      let resolvedBillable = billable ?? false;
      if (projectId) {
        const project = await db
          .prepare(`SELECT billable FROM projects WHERE id = ? AND workspace_id = ?`)
          .bind(projectId, workspaceId)
          .first<{ billable: number }>();
        if (!project) return text(`No project with id ${projectId} in this workspace.`);
        if (billable === undefined) resolvedBillable = Boolean(project.billable);
      }

      const now = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO time_entries
             (id, workspace_id, project_id, task_id, description, start, stop, duration, billable, created_at, updated_at)
           VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          workspaceId,
          projectId ?? null,
          description,
          new Date(startMs).toISOString(),
          new Date(stopMs).toISOString(),
          Math.round((stopMs - startMs) / 1000),
          resolvedBillable ? 1 : 0,
          now,
          now
        )
        .run();

      await broadcast(env, workspaceId, "entries:changed", null);
      return text(
        `Logged ${Math.round((stopMs - startMs) / 60_000)} minutes: "${description}".`
      );
    }
  );

  server.registerTool(
    "draft_day",
    {
      title: "Draft a day's missing entries",
      description:
        "Propose the entries missing from a day, from calendar events that ended untracked, uncovered stretches between the day's activity, and work usually logged on that weekday. Proposals are NOT tracked time — they wait for a person to review and confirm them in the app.",
      inputSchema: {
        date: DateArg.describe("The local day to draft, YYYY-MM-DD"),
        timezoneOffsetMinutes: TimezoneArg,
      },
    },
    async ({ date, timezoneOffsetMinutes }) => {
      const result = await generateDrafts(
        env,
        workspaceId,
        ctx.userId,
        date,
        timezoneOffsetMinutes
      );
      return json({
        drafted: result.drafts.length,
        awaitingReview: result.drafts.map((d) => ({
          start: d.start,
          stop: d.stop,
          hours: hours(d.duration),
          description: d.description,
          project: d.projectName,
          why: d.reason,
        })),
      });
    }
  );

  return server;
}
