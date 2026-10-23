// A weekly status update for one project: what was worked on, what got
// finished, what's still moving, which meetings it took, and what's planned
// next — as plain text ready to paste into an update to the engagement lead.
//
// The facts are deterministic: every time, count and task name comes from the
// entries and tasks. The model is optional and writes only the opening
// "Highlights" bullets, with no figures in them (`runStatusHighlights`). When
// it fails, or returns nothing usable, the itemised work list stands in, so the
// dialog always has something to copy.
//
// Shared by POST /api/ai/status-update and the MCP `status_update` tool.
import type { StatusUpdateResult } from "@timetracker/core/schemas";
import { runStatusHighlights } from "./ai";

export interface StatusUpdateInput {
  workspaceId: string;
  projectId: string;
  /** The caller's local week as UTC instants, half-open. */
  since: string;
  until: string;
  /** JS getTimezoneOffset sign: west of UTC is positive. */
  offsetMinutes: number;
  style: "highlights" | "itemised";
}

/** Items per section; a status update is read, not audited. */
const SECTION_CAP = 12;
/** How far ahead "Next" looks, in local days from the end of the range. */
const NEXT_DAYS = 7;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "9h 24m", "45m", "2h" — the app's duration voice, never decimal hours. */
export function humanDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}

/** The caller's local calendar date of a UTC instant. */
function localDate(ms: number, offsetMinutes: number): string {
  return new Date(ms - offsetMinutes * 60_000).toISOString().slice(0, 10);
}

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

function addDays(date: string, days: number): string {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "19–25 Oct 2026", "28 Sep – 4 Oct 2026", "29 Dec 2025 – 4 Jan 2026". */
export function formatWeekRange(first: string, last: string): string {
  const a = parts(first);
  const b = parts(last);
  if (first === last) return `${a.d} ${MONTHS[a.m - 1]} ${a.y}`;
  if (a.y !== b.y) return `${a.d} ${MONTHS[a.m - 1]} ${a.y} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  return `${a.d}–${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}

function formatDay(date: string): string {
  const p = parts(date);
  return `${WEEKDAYS[p.weekday]} ${p.d} ${MONTHS[p.m - 1]}`;
}

interface Tally {
  label: string;
  seconds: number;
  count: number;
}

/** Group by a case-insensitive key, keeping the first spelling seen; largest first. */
function tally(items: { label: string; seconds: number }[]): Tally[] {
  const byKey = new Map<string, Tally>();
  for (const { label, seconds } of items) {
    const key = label.toLowerCase().replace(/\s+/g, " ");
    const t = byKey.get(key);
    if (t) {
      t.seconds += seconds;
      t.count++;
    } else byKey.set(key, { label, seconds, count: 1 });
  }
  return [...byKey.values()].sort((x, y) => y.seconds - x.seconds || x.label.localeCompare(y.label));
}

function capped(lines: string[]): string[] {
  if (lines.length <= SECTION_CAP) return lines;
  return [...lines.slice(0, SECTION_CAP), `…and ${lines.length - SECTION_CAP} more`];
}

function section(title: string, lines: string[]): string | null {
  return lines.length ? `${title}\n${capped(lines).map((l) => `- ${l}`).join("\n")}` : null;
}

/** Null when the project isn't in this workspace. */
export async function buildStatusUpdate(
  db: D1Database,
  ai: Ai | null,
  input: StatusUpdateInput
): Promise<StatusUpdateResult | null> {
  const { workspaceId, projectId, since, until, offsetMinutes, style } = input;
  const sinceMs = Date.parse(since);
  const untilMs = Date.parse(until);
  const firstDay = localDate(sinceMs, offsetMinutes);
  // `until` is exclusive: the week's last day is the one holding the instant before it.
  const lastDay = localDate(Math.max(sinceMs, untilMs - 1), offsetMinutes);
  const nextFrom = addDays(lastDay, 1);
  const nextTo = addDays(lastDay, NEXT_DAYS);

  const [projectRes, entryRes, completedRes, nextRes] = await db.batch([
    db
      .prepare(
        `SELECT p.name, c.name AS client_name
         FROM projects p
         LEFT JOIN clients c ON c.id = p.client_id AND c.workspace_id = p.workspace_id
         WHERE p.id = ? AND p.workspace_id = ?`
      )
      .bind(projectId, workspaceId),
    db
      .prepare(
        `SELECT te.description, te.duration, te.calendar_event_id,
                t.id AS task_id, t.name AS task_name, t.active AS task_active
         FROM time_entries te
         LEFT JOIN tasks t ON t.id = te.task_id AND t.workspace_id = te.workspace_id
         WHERE te.workspace_id = ? AND te.project_id = ?
           AND te.start >= ? AND te.start < ? AND te.stop IS NOT NULL
         ORDER BY te.start ASC`
      )
      .bind(workspaceId, projectId, since, until),
    db
      .prepare(
        `SELECT name FROM tasks
         WHERE workspace_id = ? AND project_id = ? AND active = 0
           AND completed_at >= ? AND completed_at < ?
         ORDER BY completed_at ASC`
      )
      .bind(workspaceId, projectId, since, until),
    db
      .prepare(
        `SELECT name, due_date FROM tasks
         WHERE workspace_id = ? AND project_id = ? AND active = 1
           AND due_date >= ? AND due_date <= ?
         ORDER BY due_date ASC, priority ASC, sort_order ASC
         LIMIT ?`
      )
      .bind(workspaceId, projectId, nextFrom, nextTo, SECTION_CAP),
  ]);

  const project = (projectRes.results as Record<string, unknown>[])[0];
  if (!project) return null;
  const projectName = project.name as string;
  const clientName = (project.client_name as string | null) ?? null;

  const entries = entryRes.results as Record<string, unknown>[];
  const totalSeconds = entries.reduce((s, e) => s + ((e.duration as number | null) ?? 0), 0);

  // A calendar-tracked entry is a meeting; its description is the event title.
  const meetingRows = entries.filter((e) => e.calendar_event_id);
  const workRows = entries.filter((e) => !e.calendar_event_id);
  const meetings = tally(
    meetingRows.map((e) => ({
      label: ((e.description as string | null) ?? "").trim() || "Untitled meeting",
      seconds: (e.duration as number | null) ?? 0,
    }))
  );
  const work = tally(
    workRows.map((e) => ({
      label:
        ((e.description as string | null) ?? "").trim() ||
        ((e.task_name as string | null) ?? "").trim() ||
        "Unlabelled work",
      seconds: (e.duration as number | null) ?? 0,
    }))
  );

  const completed = (completedRes.results as Record<string, unknown>[]).map((r) => r.name as string);
  // Still open, but worked on this week. Seconds are this week's, not lifetime.
  const inProgress = tally(
    entries
      .filter((e) => e.task_id && e.task_active)
      .map((e) => ({ label: e.task_name as string, seconds: (e.duration as number | null) ?? 0 }))
  );
  const next = (nextRes.results as Record<string, unknown>[]).map(
    (r) => `${r.name as string} (${formatDay(r.due_date as string)})`
  );

  const itemisedWork = work.map(
    (w) => `${w.label} — ${humanDuration(w.seconds)}${w.count > 1 ? ` (${w.count}×)` : ""}`
  );

  let source: StatusUpdateResult["source"] = "itemised";
  let opening: string | null = section("Work", itemisedWork);
  if (style === "highlights" && entries.length + completed.length > 0) {
    const bullets = ai
      ? await runStatusHighlights(ai, {
          projectName,
          work: work.map((w) => w.label),
          completed,
          inProgress: inProgress.map((t) => t.label),
          meetings: meetings.map((m) => m.label),
        })
      : null;
    if (bullets) {
      source = "ai";
      opening = section("Highlights", bullets);
    } else {
      source = "fallback";
    }
  }

  const heading = `${projectName}${clientName ? ` (${clientName})` : ""}: status for ${formatWeekRange(firstDay, lastDay)}`;
  const summaryLine = entries.length
    ? `${humanDuration(totalSeconds)} tracked across ${entries.length} ${entries.length === 1 ? "entry" : "entries"}` +
      (meetings.length ? `, ${humanDuration(meetingRows.reduce((s, e) => s + ((e.duration as number | null) ?? 0), 0))} of it in meetings` : "") +
      "."
    : "No time tracked this week.";

  const blocks = [
    `${heading}\n${summaryLine}`,
    opening,
    section("Completed", completed),
    section(
      "In progress",
      inProgress.map((t) => `${t.label} — ${humanDuration(t.seconds)} this week`)
    ),
    section(
      "Meetings",
      meetings.map((m) => `${m.label} — ${humanDuration(m.seconds)}${m.count > 1 ? ` (${m.count}×)` : ""}`)
    ),
    section("Next", next),
  ].filter((b): b is string => !!b);

  return {
    text: blocks.join("\n\n"),
    source,
    projectName,
    totalSeconds,
    entryCount: entries.length,
    completedCount: completed.length,
    meetingCount: meetingRows.length,
  };
}
