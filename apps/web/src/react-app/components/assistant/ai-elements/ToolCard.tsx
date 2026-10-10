import {
  Play,
  Square,
  Clock,
  CalendarClock,
  ListTree,
  BarChart3,
  Trash2,
  Brain,
  Search,
  Wrench,
  X,
  AlertTriangle,
  ListChecks,
  ListPlus,
  CircleCheck,
  CalendarRange,
  CalendarPlus,
} from "lucide-react";
import type { UIMessage } from "ai";
import { useQuery } from "@tanstack/react-query";
import {
  getToolPartState,
  getToolInput,
  getToolOutput,
  getToolApproval,
} from "@cloudflare/ai-chat/react";
import type { TimeEntry } from "@timetracker/core/schemas";
import { workDescription } from "@timetracker/core/entry-text";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useProjects } from "@/hooks/useProjects";
import { useAllTasks } from "@/hooks/useTasks";
import { useUIStore } from "@/stores/uiStore";
import { useTimerStore } from "@/stores/timerStore";
import { api } from "@/lib/api";
import { formatDurationShort, formatEntryTime, formatFullDate, localDayKey } from "@/lib/dateUtils";
import { formatDueDate, formatMinute } from "@/lib/taskUtils";
import { todayLocalDate } from "@timetracker/core/task-recurrence";
import { cn } from "@/lib/utils";

type ToolPart = UIMessage["parts"][number];
type Rec = Record<string, unknown>;
type TimeFormat = "24h" | "12h";

// Humanized labels + icons for the Assistant's tools (part.type is `tool-<name>`).
// Every tool in worker/lib/assistant-tools.ts has an entry: a tool missing here
// rendered as its camelCase name ("planDay") with an empty card.
const TOOLS: Record<string, { label: string; icon: typeof Play }> = {
  startTimer: { label: "Start timer", icon: Play },
  stopTimer: { label: "Stop timer", icon: Square },
  logTimeEntry: { label: "Log time", icon: Clock },
  trackMeeting: { label: "Track meeting", icon: CalendarClock },
  getTimeSummary: { label: "Time summary", icon: BarChart3 },
  listProjects: { label: "Projects", icon: ListTree },
  deleteEntry: { label: "Delete entry", icon: Trash2 },
  rememberPreference: { label: "Remember", icon: Brain },
  searchMemory: { label: "Recall", icon: Search },
  listTasks: { label: "Tasks", icon: ListChecks },
  createTask: { label: "Add task", icon: ListPlus },
  completeTask: { label: "Tick off task", icon: CircleCheck },
  planDay: { label: "Plan the day", icon: CalendarRange },
  scheduleTasks: { label: "Schedule tasks", icon: CalendarPlus },
};

function toolNameOf(part: ToolPart): string {
  return typeof part.type === "string" && part.type.startsWith("tool-")
    ? part.type.slice("tool-".length)
    : "";
}

// ---------------------------------------------------------------------------
// Reading tool payloads. Tools speak in decimal-hour strings and UTC instants;
// the cards speak the app's own vocabulary — "1h 30m", the user's 12h/24h
// clock, "Today" — so a result reads like the timesheet it changed.
// ---------------------------------------------------------------------------

function str(o: Rec, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function isOk(o: Rec): boolean {
  return o.ok !== false;
}
/** One place for a failed tool's reason: the timer tools say `reason`, the task tools `error`. */
function failure(o: Rec, fallback: string): string {
  return str(o, "reason") ?? str(o, "error") ?? fallback;
}
/**
 * A duration from a tool result: seconds when the result has them, else the
 * decimal-hour strings ("1.50") results carried before — those still sit in
 * persisted conversations.
 */
function duration(secs: unknown, decimalHours?: unknown): string {
  if (typeof secs === "number" && Number.isFinite(secs)) return formatDurationShort(secs);
  const n = typeof decimalHours === "string" ? Number(decimalHours) : typeof decimalHours === "number" ? decimalHours : NaN;
  return Number.isFinite(n) ? formatDurationShort(Math.round(n * 3600)) : "0m";
}
/** "HH:MM" (local) → the user's clock. */
function clock(hhmm: string, tf: TimeFormat): string {
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? formatMinute(h * 60 + m, tf) : hhmm;
}
/** "Today · 14:00–15:30" / "Wed, Oct 8 · 2:00 PM–3:30 PM". */
function range(start: string, stop: string, tf: TimeFormat): string {
  const day = localDayKey(start) === todayLocalDate() ? "Today" : formatFullDate(start);
  return `${day} · ${formatEntryTime(start, tf)}–${formatEntryTime(stop, tf)}`;
}
function seconds(start: string, stop: string): number {
  return Math.max(0, Math.round((Date.parse(stop) - Date.parse(start)) / 1000));
}

/** What the cards need from the rest of the app: the clock, project colours, task names. */
function useToolContext(needsTasks: boolean) {
  const timeFormat = useUIStore((s) => s.timeFormat);
  const { data: projects = [] } = useProjects();
  const { data: tasks = [] } = useAllTasks(needsTasks);
  return {
    timeFormat,
    /** The project a free-text name refers to, as best the client can tell (the server's matcher is fuzzier). */
    projectName: (name: string | undefined) => {
      if (!name) return null;
      const n = name.toLowerCase();
      return (projects.find((p) => p.name.toLowerCase() === n) ?? projects.find((p) => p.name.toLowerCase().includes(n)))?.name ?? null;
    },
    projectColor: (name: string | undefined) =>
      name ? (projects.find((p) => p.name.toLowerCase() === name.toLowerCase())?.color ?? null) : null,
    task: (id: unknown) => (typeof id === "string" ? tasks.find((t) => t.id === id) : undefined),
  };
}
type ToolContext = ReturnType<typeof useToolContext>;

const TASK_TOOLS = new Set(["completeTask", "scheduleTasks", "planDay", "listTasks"]);

// ---------------------------------------------------------------------------
// Layout primitives. A result is drawn as a row on the rack — the same card,
// hairline and mono figure as an entry row — rather than a tinted status chip:
// the thing the Assistant just logged should look like the thing it logged.
// ---------------------------------------------------------------------------

type Tone = "done" | "info" | "warn" | "error";

const TONE_ICON: Record<Tone, string> = {
  done: "text-success-ink",
  info: "text-muted-foreground",
  warn: "text-warning-ink",
  error: "text-destructive",
};

function Swatch({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", !color && "border border-border-strong")}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

function Row({
  icon: Icon,
  tone = "info",
  spin = false,
  swatch,
  title,
  meta,
  figure,
  children,
}: {
  icon?: typeof Play;
  tone?: Tone;
  spin?: boolean;
  /** A project colour (or null for "no project") drawn where the icon would be. */
  swatch?: string | null;
  title: React.ReactNode;
  /** The secondary line: project, time range, billable. */
  meta?: React.ReactNode;
  /** The right-hand figure — a duration, a count — in mono. */
  figure?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-container border bg-card px-3 py-2 text-xs",
        tone === "error" && "border-destructive/40"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          {spin ? (
            <Spinner size="sm" className="text-muted-foreground" />
          ) : swatch !== undefined ? (
            <Swatch color={swatch} />
          ) : (
            Icon && <Icon className={cn("size-3.5", TONE_ICON[tone])} />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{title}</span>
        {figure && (
          <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">{figure}</span>
        )}
      </div>
      {/* Wraps rather than truncates: the time range at the end is the part
          worth checking, and it was the part an ellipsis cut off. */}
      {meta && <div className="mt-0.5 pl-5.5 text-pretty text-muted-foreground">{meta}</div>}
      {children && <div className="mt-1.5 pl-5.5 text-muted-foreground">{children}</div>}
    </div>
  );
}

/** A list inside a row: label left, mono figure right. */
function Lines({
  items,
  max,
}: {
  items: { key: string; label: React.ReactNode; figure?: React.ReactNode; swatch?: string | null }[];
  max: number;
}) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-1">
      {items.slice(0, max).map((r) => (
        <li key={r.key} className="flex items-baseline gap-2">
          {r.swatch !== undefined && (
            <span className="self-center">
              <Swatch color={r.swatch} />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-foreground">{r.label}</span>
          {r.figure && (
            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{r.figure}</span>
          )}
        </li>
      ))}
      {items.length > max && <li className="text-muted-foreground">+{items.length - max} more</li>}
    </ul>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Per-tool result rows. Each maps one tool's output (worker/lib/assistant-tools.ts)
// to the row it changed or the answer it found.
// ---------------------------------------------------------------------------

function renderResult(name: string, input: Rec, out: Rec, ctx: ToolContext): React.ReactNode {
  const tf = ctx.timeFormat;
  const project = str(out, "project");
  const billable = (b: unknown) => (b ? "billable" : "non-billable");

  switch (name) {
    case "startTimer":
      return (
        <Row
          swatch={ctx.projectColor(project)}
          title={str(input, "description") ?? "Timer started"}
          meta={[project ?? "No project", billable(out.billable), str(out, "note")]
            .filter(Boolean)
            .join(" · ")}
          figure={str(out, "startedAt") ? `since ${formatEntryTime(str(out, "startedAt")!, tf)}` : undefined}
        />
      );

    case "stopTimer":
      if (!isOk(out)) return <Row icon={Square} tone="warn" title={failure(out, "No timer was running")} />;
      return <Row icon={Square} tone="done" title="Timer stopped · saved" figure={duration(out.durationSeconds, out.durationHours)} />;

    case "logTimeEntry":
    case "trackMeeting": {
      if (!isOk(out))
        return (
          <Row
            icon={name === "trackMeeting" ? CalendarClock : Clock}
            tone="error"
            title={failure(out, name === "trackMeeting" ? "Couldn't track that meeting" : "Couldn't log that")}
          />
        );
      const start = str(input, "start");
      const stop = str(input, "stop");
      return (
        <Row
          swatch={ctx.projectColor(project)}
          title={
            name === "logTimeEntry"
              ? workDescription(str(input, "description") ?? "", [project]) || "No description"
              : (str(input, "title") ?? "Tracked meeting")
          }
          meta={[project ?? "No project", start && stop ? range(start, stop, tf) : null, str(out, "note")]
            .filter(Boolean)
            .join(" · ")}
          figure={duration(out.durationSeconds, out.durationHours)}
        />
      );
    }

    case "getTimeSummary": {
      const byProject =
        (out.byProject as Array<{ project?: string; seconds?: number; hours?: string }> | undefined) ?? [];
      return (
        <Row
          icon={BarChart3}
          title="Tracked"
          meta={`${duration(out.billableSeconds, out.billableHours)} billable`}
          figure={duration(out.totalSeconds, out.totalHours)}
        >
          <Lines
            max={6}
            items={byProject.map((r, i) => ({
              key: `${i}`,
              swatch: ctx.projectColor(r.project),
              label: r.project ?? "No project",
              figure: duration(r.seconds, r.hours),
            }))}
          />
        </Row>
      );
    }

    case "listProjects": {
      const projects = (out.projects as Array<{ name?: string; billable?: boolean }> | undefined) ?? [];
      return (
        <Row icon={ListTree} title={plural(projects.length, "project")}>
          <Lines
            max={8}
            items={projects.map((p, i) => ({
              key: `${i}`,
              swatch: ctx.projectColor(p.name),
              label: p.name ?? "?",
              figure: p.billable ? "billable" : undefined,
            }))}
          />
        </Row>
      );
    }

    case "deleteEntry":
      if (!isOk(out)) return <Row icon={Trash2} tone="warn" title={failure(out, "Nothing was deleted")} />;
      return <Row icon={Trash2} tone="done" title="Entry deleted" />;

    case "rememberPreference":
      return (
        <Row icon={Brain} tone="done" title="Remembered for future chats">
          {str(input, "content") ?? str(out, "key")}
        </Row>
      );

    case "searchMemory": {
      const memories = (out.memories as string[] | undefined) ?? [];
      return (
        <Row icon={Search} title={memories.length ? plural(memories.length, "thing") + " remembered" : "Nothing remembered about that"}>
          <Lines max={4} items={memories.map((m, i) => ({ key: `${i}`, label: m }))} />
        </Row>
      );
    }

    case "listTasks": {
      const tasks =
        (out.tasks as Array<{ id: string; name: string; project?: string | null; due?: string | null; time?: string | null }> | undefined) ?? [];
      return (
        <Row icon={ListChecks} title={tasks.length ? plural(tasks.length, "open task") : "No open tasks"}>
          <Lines
            max={6}
            items={tasks.map((t) => ({
              key: t.id,
              swatch: ctx.projectColor(t.project ?? undefined),
              label: t.name,
              figure: t.time ? clock(t.time, tf) : t.due ? formatDueDate(t.due) : undefined,
            }))}
          />
        </Row>
      );
    }

    case "createTask":
      if (!isOk(out)) return <Row icon={ListPlus} tone="error" title={failure(out, "Couldn't add that task")} />;
      return (
        <Row
          swatch={ctx.projectColor(project)}
          title={str(out, "name") ?? str(input, "name") ?? "Task added"}
          meta={[project, str(out, "due") ? `due ${formatDueDate(str(out, "due")!)}` : "no due date"]
            .filter(Boolean)
            .join(" · ")}
          figure="added"
        />
      );

    case "completeTask": {
      if (!isOk(out)) return <Row icon={CircleCheck} tone="error" title={failure(out, "Couldn't tick that off")} />;
      const tracked = typeof out.trackedMinutes === "number" ? out.trackedMinutes : null;
      const next = str(out, "nextDue");
      return (
        <Row
          icon={CircleCheck}
          tone="done"
          title={str(out, "name") ?? "Task done"}
          meta={
            out.alreadyDone
              ? "Already done"
              : next
                ? `Done · next one due ${formatDueDate(next)}`
                : "Done"
          }
          figure={tracked ? formatDurationShort(tracked * 60) : undefined}
        />
      );
    }

    case "planDay": {
      const plan = (out.plan as Array<{ taskId: string; name: string; start: string; end: string }> | undefined) ?? [];
      const misfits = (out.doesNotFit as Array<{ taskId: string; name: string; minutes: number }> | undefined) ?? [];
      const free = typeof out.freeMinutes === "number" ? out.freeMinutes : null;
      return (
        <Row
          icon={CalendarRange}
          title={plan.length ? "A plan for the rest of today" : "Nothing left to plan today"}
          figure={free !== null ? `${formatDurationShort(free * 60)} free` : undefined}
        >
          {plan.length > 0 && (
            // A timeline, not a list: the start time leads, in mono, so the
            // column of times reads down like the calendar it will land on.
            <ol className="flex flex-col gap-1">
              {plan.map((p) => (
                <li key={p.taskId} className="flex items-baseline gap-2">
                  <span className="min-w-24 shrink-0 font-mono tabular-nums text-muted-foreground">
                    {clock(p.start, tf)}–{clock(p.end, tf)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
                </li>
              ))}
            </ol>
          )}
          {misfits.length > 0 && (
            <p className="mt-1.5">
              Doesn't fit: {misfits.map((m) => `${m.name} (${formatDurationShort(m.minutes * 60)})`).join(", ")}
            </p>
          )}
        </Row>
      );
    }

    case "scheduleTasks": {
      const scheduled = (out.scheduled as string[] | undefined) ?? [];
      if (!isOk(out)) return <Row icon={CalendarPlus} tone="error" title={failure(out, "Nothing was scheduled")} />;
      return (
        <Row icon={CalendarPlus} tone="done" title={`${plural(scheduled.length, "task")} on today's calendar`}>
          <Lines
            max={8}
            items={scheduled.map((s, i) => {
              // "09:30 Task name" — the worker's echo; split so the time sits in mono.
              const [, time = "", rest = s] = /^(\d{2}:\d{2}) (.*)$/.exec(s) ?? [];
              return { key: `${i}`, label: rest, figure: time ? clock(time, tf) : undefined };
            })}
          />
        </Row>
      );
    }

    default: {
      const meta = TOOLS[name] ?? { label: "Done", icon: Wrench };
      return <Row icon={meta.icon} tone={isOk(out) ? "info" : "warn"} title={isOk(out) ? meta.label : failure(out, "Couldn't complete that")} />;
    }
  }
}

export function ToolCard({
  part,
  onApprove,
}: {
  part: ToolPart;
  onApprove: (id: string, approved: boolean) => void;
}) {
  const name = toolNameOf(part);
  const meta = TOOLS[name] ?? { label: "Working", icon: Wrench };
  const state = getToolPartState(part);
  const ctx = useToolContext(TASK_TOOLS.has(name));
  const input = (getToolInput(part) as Rec | undefined) ?? {};
  const output = (getToolOutput(part) as Rec | undefined) ?? {};

  // "approved" is the gap between Approve and the result arriving: still working,
  // not done — rendering the (empty) result here flashed "Logged 0m".
  if (state === "loading" || state === "streaming" || state === "approved") {
    return <Row spin title={<span className="text-muted-foreground">{meta.label}…</span>} />;
  }
  if (state === "error") {
    return <Row icon={AlertTriangle} tone="error" title={`${meta.label} didn't go through`} />;
  }
  if (state === "waiting-approval") {
    return <Approval part={part} name={name} input={input} ctx={ctx} onApprove={onApprove} />;
  }
  if (state === "denied") {
    return <Row icon={X} title={<span className="text-muted-foreground">Declined · {meta.label}</span>} />;
  }

  return <>{renderResult(name, input, output, ctx)}</>;
}

// ---------------------------------------------------------------------------
// Approval. The moment the Assistant asks to write to a billable timesheet is
// the one where trust is won or lost, so it states the action as a sentence in
// the app's own words — "Log 1h 30m to Acme" — never the tool's name or an id
// fragment, and the button names the verb. Approve is the primary pill; only a
// delete wears the destructive red.
// ---------------------------------------------------------------------------

interface Proposal {
  sentence: React.ReactNode;
  swatch?: string | null;
  details: string[];
  consequence?: string;
  /** The Approve button's label. */
  verb: string;
  destructive?: boolean;
}

const B = ({ children }: { children: React.ReactNode }) => (
  <span className="font-medium text-foreground">{children}</span>
);

function propose(name: string, input: Rec, ctx: ToolContext, running: { description: string } | null): Proposal {
  const tf = ctx.timeFormat;
  const project = str(input, "projectName");
  const start = str(input, "start");
  const stop = str(input, "stop");
  const billable = typeof input.billable === "boolean" ? (input.billable ? "billable" : "non-billable") : null;

  switch (name) {
    case "startTimer":
      return {
        sentence: (
          <>
            Start <B>{str(input, "description") ?? "a timer"}</B>
            {project && <> on <B>{project}</B></>}
          </>
        ),
        swatch: ctx.projectColor(project),
        details: [billable].filter(Boolean) as string[],
        // The server only asks when a timer is already running, so the thing
        // being approved is really the stop.
        consequence: running
          ? `“${running.description || "The running timer"}” stops and is saved first.`
          : "The running timer stops and is saved first.",
        verb: "Start",
      };
    case "stopTimer":
      return {
        sentence: (
          <>
            Stop <B>{running?.description || "the running timer"}</B>
          </>
        ),
        details: [],
        consequence: "It's saved with the time so far.",
        verb: "Stop",
      };
    case "logTimeEntry": {
      // The description the server will save — not one it will drop for
      // only restating the project (workDescription).
      const work = workDescription(str(input, "description") ?? "", [project, ctx.projectName(project)]);
      return {
        sentence: (
          <>
            Log <B>{start && stop ? formatDurationShort(seconds(start, stop)) : "time"}</B>
            {" to "}
            <B>{project ?? "no project"}</B>
          </>
        ),
        swatch: ctx.projectColor(project),
        details: [
          work ? `“${work}”` : "no description",
          start && stop ? range(start, stop, tf) : null,
          billable,
        ].filter(Boolean) as string[],
        verb: "Log time",
      };
    }
    case "trackMeeting":
      return {
        sentence: (
          <>
            Add <B>{str(input, "title") ?? "this meeting"}</B> to your timesheet
          </>
        ),
        details: [
          start && stop ? `${range(start, stop, tf)} · ${formatDurationShort(seconds(start, stop))}` : null,
          "project picked from the title",
        ].filter(Boolean) as string[],
        verb: "Add",
      };
    case "rememberPreference":
      return {
        sentence: <>Remember this for future chats</>,
        details: [str(input, "content") ? `“${str(input, "content")}”` : ""].filter(Boolean),
        consequence: "You can remove it any time in Settings → Tracking.",
        verb: "Remember",
      };
    case "createTask": {
      const due = str(input, "dueDate");
      const time = str(input, "time");
      const deadline = str(input, "deadline");
      const estimate = typeof input.estimateMinutes === "number" ? input.estimateMinutes : null;
      const priority = typeof input.priority === "number" && input.priority < 4 ? `P${input.priority}` : null;
      return {
        sentence: (
          <>
            Add <B>{str(input, "name") ?? "a task"}</B>
            {project && <> to <B>{project}</B></>}
          </>
        ),
        swatch: ctx.projectColor(project),
        details: [
          due ? `due ${formatDueDate(due)}${time ? ` at ${clock(time, tf)}` : ""}` : time ? `today at ${clock(time, tf)}` : null,
          deadline ? `deadline ${formatDueDate(deadline)}` : null,
          estimate ? `~${formatDurationShort(estimate * 60)}` : null,
          priority,
        ].filter(Boolean) as string[],
        verb: "Add task",
      };
    }
    case "completeTask": {
      const task = ctx.task(input.taskId);
      return {
        sentence: (
          <>
            Tick off <B>{task?.name ?? "a task"}</B>
          </>
        ),
        swatch: task ? task.projectColor : undefined,
        details: [
          task?.projectName ?? null,
          task?.recurRule ? "its next occurrence is created" : null,
        ].filter(Boolean) as string[],
        consequence: task ? undefined : "This task isn't in your list any more — it may already be done.",
        verb: "Tick off",
      };
    }
    case "scheduleTasks": {
      const slots = (input.slots as Array<{ taskId: string; start: string }> | undefined) ?? [];
      return {
        sentence: (
          <>
            Put <B>{plural(slots.length, "task")}</B> on today's calendar
          </>
        ),
        details: slots.map((s) => `${clock(s.start, tf)}  ${ctx.task(s.taskId)?.name ?? "A task"}`),
        verb: "Schedule",
      };
    }
    default: {
      const meta = TOOLS[name];
      return {
        sentence: <>{meta ? meta.label : "Make a change"}</>,
        details: [],
        verb: "Approve",
      };
    }
  }
}

function Approval({
  part,
  name,
  input,
  ctx,
  onApprove,
}: {
  part: ToolPart;
  name: string;
  input: Rec;
  ctx: ToolContext;
  onApprove: (id: string, approved: boolean) => void;
}) {
  const approval = getToolApproval(part);
  const running = useTimerStore((s) => s.runningEntry);
  if (!approval?.id) return null;

  const proposal =
    name === "deleteEntry" ? null : propose(name, input, ctx, running ? { description: running.description } : null);

  return (
    <div
      role="group"
      aria-label="Waiting for your approval"
      className="space-y-2.5 rounded-container border border-border-strong bg-card px-3 py-2.5"
    >
      {name === "deleteEntry" ? (
        <DeleteProposal id={str(input, "id")} ctx={ctx} />
      ) : (
        proposal && <ProposalBody proposal={proposal} />
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={name === "deleteEntry" ? "destructive" : "default"}
          onClick={() => onApprove(approval.id, true)}
        >
          {name === "deleteEntry" ? "Delete" : proposal?.verb}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onApprove(approval.id, false)}>
          Decline
        </Button>
      </div>
    </div>
  );
}

function ProposalBody({ proposal }: { proposal: Proposal }) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {proposal.swatch !== undefined && <Swatch color={proposal.swatch} />}
        <span className="min-w-0">{proposal.sentence}</span>
      </p>
      {proposal.details.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {proposal.details.map((d, i) => (
            <li key={i} className="whitespace-pre-wrap">
              {d}
            </li>
          ))}
        </ul>
      )}
      {proposal.consequence && <p className="text-xs text-muted-foreground">{proposal.consequence}</p>}
    </div>
  );
}

/** A delete names the entry it will remove — never an id fragment. */
function DeleteProposal({ id, ctx }: { id: string | undefined; ctx: ToolContext }) {
  const { data: entry, isLoading, isError } = useQuery({
    queryKey: ["time-entries", "one", id],
    queryFn: () => api.timeEntries.get(id!) as Promise<TimeEntry>,
    enabled: !!id,
    retry: false,
    staleTime: 30_000,
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Finding the entry…</p>;
  if (isError || !entry) {
    return (
      <ProposalBody
        proposal={{
          sentence: <>Delete an entry</>,
          details: [],
          consequence: "It isn't in your timesheet — there may be nothing to delete.",
          verb: "Delete",
        }}
      />
    );
  }
  return (
    <ProposalBody
      proposal={{
        sentence: (
          <>
            Delete <B>{entry.description || "an entry without a description"}</B>
          </>
        ),
        swatch: entry.projectColor,
        details: [
          [
            entry.projectName ?? "No project",
            entry.stop ? range(entry.start, entry.stop, ctx.timeFormat) : "running now",
            entry.duration ? formatDurationShort(entry.duration) : null,
          ]
            .filter(Boolean)
            .join(" · "),
        ],
        consequence: "This can't be undone.",
        verb: "Delete",
      }}
    />
  );
}
