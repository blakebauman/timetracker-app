import { z } from "zod";
import { AiQuickEntryRawSchema, type AiQuickEntryRaw } from "@shared/schemas";
import { DISTINCT_COLORS, PALETTE } from "./colors";

// Used for every json_schema-mode call (quick entry, project recolor, event→
// project inference). Was llama-3.1-8b-instruct-fp8 until Workers AI dropped
// JSON-schema support from it (error 5025, ~July 2026) — if structured AI
// features all start failing again, test this model's JSON mode first.
const QUICK_ENTRY_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const SUMMARY_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
const GATEWAY = { id: "default" };

export class AiParseError extends Error {}

export interface ProjectGrounding {
  id: string;
  name: string;
  billable: boolean;
  tasks: { id: string; name: string }[];
}

function extractJson(raw: unknown): unknown {
  const response = (raw as { response?: unknown })?.response ?? raw;
  if (typeof response !== "string") return response;
  const fenced = response.match(/```(?:json)?\s*([\s\S]*?)```/i);
  try {
    return JSON.parse(fenced ? fenced[1] : response);
  } catch {
    return null;
  }
}

export function buildQuickEntrySystemPrompt(
  referenceDateIso: string,
  timezoneOffsetMinutes: number,
  projects: ProjectGrounding[]
): string {
  const projectLines = projects.length
    ? projects
        .map((p) => {
          const tasks = p.tasks.length
            ? ` (tasks: ${p.tasks.map((t) => `"${t.name}"`).join(", ")})`
            : "";
          return `- "${p.name}" [${p.billable ? "billable" : "non-billable"} by default]${tasks}`;
        })
        .join("\n")
    : "(no active projects)";

  return `You convert a short natural-language time log entry into structured JSON describing when the work happened and which project/task it belongs to.

Rules:
- Output ONLY JSON matching the given schema — no prose, no markdown code fences.
- The user's current local date/time is ${referenceDateIso} (UTC offset ${timezoneOffsetMinutes} minutes). Resolve relative phrases ("yesterday afternoon", "this morning", "2pm") against that local time, then output "start" and "stop" as UTC ISO 8601 timestamps.
- If the text states a duration (e.g. "2h") without an explicit end time, pick a specific start and stop within the described period that spans that duration.
- If there is truly no end time or duration implied (work still in progress), set "stop" to null.
- For "projectName" and "taskName", choose ONLY an exact name from the list below, or null if nothing matches well. Never invent a name that isn't listed.
- "billable" should follow the matched project's default shown below. Only diverge from that default if the text explicitly says otherwise (e.g. "internal", "non-billable", "unpaid").
- "confidence" reflects how sure you are about the project/task match and time resolution.

Known active projects:
${projectLines}`;
}

/** Parse free-text like "2h on Acme redesign yesterday afternoon" into a structured draft entry. */
export async function runQuickEntryParse(
  ai: Ai,
  text: string,
  referenceDateIso: string,
  timezoneOffsetMinutes: number,
  projects: ProjectGrounding[]
): Promise<AiQuickEntryRaw> {
  const system = buildQuickEntrySystemPrompt(referenceDateIso, timezoneOffsetMinutes, projects);

  let raw: unknown;
  try {
    raw = await ai.run(
      QUICK_ENTRY_MODEL,
      {
        messages: [
          { role: "system", content: system },
          { role: "user", content: text },
        ],
        response_format: {
          type: "json_schema",
          json_schema: z.toJSONSchema(AiQuickEntryRawSchema),
        },
      },
      { gateway: GATEWAY }
    );
  } catch {
    throw new AiParseError("AI is unavailable right now");
  }

  const parsed = AiQuickEntryRawSchema.safeParse(extractJson(raw));
  if (!parsed.success) {
    throw new AiParseError("AI returned an unexpected response — try rephrasing");
  }
  return parsed.data;
}

export interface SummaryEntryInput {
  description: string;
  projectName: string | null;
  start: string;
  duration: number | null;
  billable: boolean;
}

/** Draft a natural-language summary of already-tracked entries, for reports/invoicing. */
export async function runSummaryGeneration(
  ai: Ai,
  entries: SummaryEntryInput[],
  style: "narrative" | "bullets"
): Promise<string> {
  const capped = entries.slice(0, 300);
  const lines = capped.map((e) => {
    const hours = ((e.duration ?? 0) / 3600).toFixed(2);
    const date = e.start.slice(0, 10);
    return `${date} | ${e.projectName ?? "No project"} | ${hours}h | ${e.billable ? "billable" : "non-billable"} | ${e.description || "(no description)"}`;
  });
  const truncationNote =
    entries.length > capped.length
      ? `\n(Note: showing the first ${capped.length} of ${entries.length} entries.)`
      : "";
  const styleInstruction =
    style === "bullets"
      ? "Write it as a concise bulleted list grouped by project, suitable for a client invoice or status update."
      : "Write it as a short narrative paragraph summarizing the work, suitable for a client-facing report.";

  const prompt = `You are drafting a professional, client-facing summary of work performed, based on the following time entries (date | project | hours | billing | description):

${lines.join("\n")}${truncationNote}

${styleInstruction} Do not invent work not listed above. Output only the summary text, no preamble.`;

  let raw: { response?: string };
  try {
    raw = (await ai.run(
      SUMMARY_MODEL,
      { messages: [{ role: "user", content: prompt }] },
      { gateway: GATEWAY }
    )) as { response?: string };
  } catch {
    throw new AiParseError("AI is unavailable right now");
  }

  const summary = raw.response?.trim();
  if (!summary) throw new AiParseError("AI returned an empty summary");
  return summary;
}

/** Active projects (+tasks) shaped for AI grounding. Shared by the AI routes,
 *  calendar materialization, and the assistant's track-event action. */
export async function loadGroundingProjects(
  db: D1Database,
  workspaceId: string
): Promise<ProjectGrounding[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id AS project_id, p.name AS project_name, p.billable AS project_billable,
              tk.id AS task_id, tk.name AS task_name
       FROM projects p
       LEFT JOIN tasks tk ON tk.project_id = p.id AND tk.active = 1
       WHERE p.workspace_id = ? AND p.active = 1
       ORDER BY p.name ASC`
    )
    .bind(workspaceId)
    .all<Record<string, unknown>>();

  const byId = new Map<string, ProjectGrounding>();
  for (const row of results) {
    const id = row.project_id as string;
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: row.project_name as string,
        billable: Boolean(row.project_billable),
        tasks: [],
      });
    }
    if (row.task_id) {
      byId.get(id)!.tasks.push({ id: row.task_id as string, name: row.task_name as string });
    }
  }
  return [...byId.values()];
}

// ─── Calendar-event → project inference ──────────────────────────────────────

const EventProjectSchema = z.object({
  assignments: z.array(
    z.object({ title: z.string(), projectName: z.string().nullable() })
  ),
});

export interface InferredEventProject {
  projectId: string;
  projectName: string;
  billable: boolean;
}

/**
 * Best-effort: match calendar event titles to known projects so materialized
 * entries land pre-categorized with the project's billable default. Grounded
 * the same way as quick-entry (model may only pick listed names, fuzzy-resolved
 * with the same ambiguity guards). Any failure or non-match yields no entry in
 * the map — callers create the entry without a project, never block on AI.
 */
export async function inferEventProjects(
  db: D1Database,
  ai: Ai,
  workspaceId: string,
  titles: string[]
): Promise<Map<string, InferredEventProject>> {
  const resolved = new Map<string, InferredEventProject>();
  const unique = [...new Set(titles.map((t) => t.trim()).filter(Boolean))].slice(0, 50);
  if (!unique.length) return resolved;

  const projects = await loadGroundingProjects(db, workspaceId);
  if (!projects.length) return resolved;

  const system = `You match calendar event titles to a consultant's known projects in a time-tracking app, so meetings land on the right client engagement.

Rules:
- For each event title, pick the ONE project it clearly belongs to, choosing ONLY an exact name from the list below — or null.
- A match must be evident from the title (client name, project name, engagement code, or an obvious abbreviation of one). Generic meetings ("1:1", "Standup", "Lunch", "Weekly sync") with no project signal are null.
- When unsure, always prefer null over a guess — a wrong project is worse than none.
- Output ONLY JSON of the form { "assignments": [ { "title": "<exact event title>", "projectName": "<exact project name or null>" } ] }.

Known active projects:
${projects.map((p) => `- "${p.name}"`).join("\n")}`;
  const user = `Event titles:\n${unique.map((t) => `- ${t}`).join("\n")}`;

  let raw: unknown;
  try {
    raw = await ai.run(
      QUICK_ENTRY_MODEL,
      {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: z.toJSONSchema(EventProjectSchema),
        },
      },
      { gateway: GATEWAY }
    );
  } catch {
    return resolved;
  }

  const parsed = EventProjectSchema.safeParse(extractJson(raw));
  if (!parsed.success) return resolved;

  const byTitle = new Map(unique.map((t) => [normalize(t), t]));
  for (const a of parsed.data.assignments) {
    const title = byTitle.get(normalize(a.title));
    if (!title || !a.projectName || resolved.has(title)) continue;
    const project = bestMatch(a.projectName, projects, (p) => p.name);
    if (project) {
      resolved.set(title, {
        projectId: project.id,
        projectName: project.name,
        billable: project.billable,
      });
    }
  }
  return resolved;
}

// The assistant's chat now runs in the ChatAgent Durable Object (streaming + tool calling
// via the AI SDK's Workers AI provider) — see worker/durable-objects/ChatAgent.ts.
// The grounding block it feeds the model is still buildAssistantContext() in
// lib/assistant.ts.

// ─── Project color assignment ─────────────────────────────────────────────────

const ProjectColorSchema = z.object({
  assignments: z.array(z.object({ name: z.string(), color: z.string() })),
});

/**
 * Ask the model to assign each project a distinct palette color, grouping related
 * engagements into nearby hues when the names suggest it. Returns a name→hex map
 * containing only palette-valid colors; the caller enforces distinctness and
 * fills any gaps deterministically, so a poor AI response can't make things worse.
 */
export async function runProjectColorAssignment(
  ai: Ai,
  projectNames: string[]
): Promise<Map<string, string>> {
  const system = `You assign a display color to each project in a time-tracking app so the UI is colorful and easy to scan.

Rules:
- Choose each color ONLY from this palette (hex): ${DISTINCT_COLORS.join(", ")}.
- Make every project's color as visually distinct from the others as you can.
- If several projects clearly belong to the same client or engagement (a shared code or prefix in the name), you MAY use a related hue family for them, but each project must still get a DIFFERENT hex.
- Output ONLY JSON of the form { "assignments": [ { "name": "<exact project name>", "color": "<hex from the palette>" } ] }. Use the project names exactly as given.`;
  const user = `Projects:\n${projectNames.map((n) => `- ${n}`).join("\n")}`;

  let raw: unknown;
  try {
    raw = await ai.run(
      QUICK_ENTRY_MODEL,
      {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: z.toJSONSchema(ProjectColorSchema),
        },
      },
      { gateway: GATEWAY }
    );
  } catch {
    throw new AiParseError("AI is unavailable right now");
  }

  const parsed = ProjectColorSchema.safeParse(extractJson(raw));
  if (!parsed.success) throw new AiParseError("AI returned an unexpected response");

  const map = new Map<string, string>();
  for (const a of parsed.data.assignments) {
    const color = a.color.trim().toLowerCase();
    if (PALETTE.has(color)) map.set(a.name, color);
  }
  return map;
}

// ─── Fuzzy grounding resolution ───────────────────────────────────────────────
// The model is instructed to only pick names we gave it, so exact match is the
// common case. This is a dependency-free safety net for near-misses (casing,
// whitespace, minor paraphrase) — anything ambiguous or below threshold is left
// unmatched rather than guessing, since a wrong project/task id is worse than none.

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (!na.length || !nb.length) return 0;

  let prevRow = Array.from({ length: nb.length + 1 }, (_, i) => i);
  for (let i = 1; i <= na.length; i++) {
    const row = [i];
    for (let j = 1; j <= nb.length; j++) {
      row.push(
        na[i - 1] === nb[j - 1]
          ? prevRow[j - 1]
          : 1 + Math.min(prevRow[j - 1], prevRow[j], row[j - 1])
      );
    }
    prevRow = row;
  }
  const distance = prevRow[nb.length];
  return 1 - distance / Math.max(na.length, nb.length);
}

const MATCH_THRESHOLD = 0.82;
const AMBIGUITY_MARGIN = 0.05;

function bestMatch<T>(name: string, candidates: T[], nameOf: (c: T) => string): T | undefined {
  const exact = candidates.find((c) => normalize(nameOf(c)) === normalize(name));
  if (exact) return exact;

  const scored = candidates
    .map((c) => ({ c, score: similarity(nameOf(c), name) }))
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (best && best.score >= MATCH_THRESHOLD && (!second || best.score - second.score > AMBIGUITY_MARGIN)) {
    return best.c;
  }
  return undefined;
}

export interface GroundingResolution {
  projectId: string | null;
  projectMatched: boolean;
  taskId: string | null;
  taskMatched: boolean;
  warnings: string[];
}

export function resolveGrounding(
  projectName: string | null,
  taskName: string | null,
  projects: ProjectGrounding[]
): GroundingResolution {
  const warnings: string[] = [];
  let matchedProject: ProjectGrounding | undefined;

  if (projectName) {
    matchedProject = bestMatch(projectName, projects, (p) => p.name);
    if (!matchedProject) {
      warnings.push(`Couldn't confidently match project "${projectName}" — pick one manually.`);
    }
  }

  let taskId: string | null = null;
  let taskMatched = false;
  if (taskName) {
    if (!matchedProject) {
      warnings.push(`AI suggested task "${taskName}" but no project was matched.`);
    } else {
      const matchedTask = bestMatch(taskName, matchedProject.tasks, (t) => t.name);
      if (matchedTask) {
        taskId = matchedTask.id;
        taskMatched = true;
      } else {
        warnings.push(`Couldn't confidently match task "${taskName}" — pick one manually.`);
      }
    }
  }

  return {
    projectId: matchedProject?.id ?? null,
    projectMatched: Boolean(matchedProject),
    taskId,
    taskMatched,
    warnings,
  };
}
