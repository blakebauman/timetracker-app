import { z } from "zod";
import { AiQuickEntryRawSchema, type AiQuickEntryRaw } from "@shared/schemas";

// Small, fast, JSON-mode-capable — good fit for a single-user, low-latency call.
const QUICK_ENTRY_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const SUMMARY_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
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
