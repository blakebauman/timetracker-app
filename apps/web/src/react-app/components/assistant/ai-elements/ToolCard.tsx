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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
} from "@/components/ui/item";
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
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
//
// Each call is one step on the reply's trace (AI Elements' Tool): `doing` while
// it runs, `done` once it has, and the result rows inside the step's disclosure.
// A step whose rows *are* the answer — a receipt for a write, the numbers, the
// plan — opens with them showing; a lookup the Assistant only read on the way
// to its answer (`folded`) stays one line until you ask to see it.
const TOOLS: Record<string, { label: string; doing: string; done: string; icon: typeof Play; folded?: boolean }> = {
  startTimer: { label: "Start timer", doing: "Starting a timer", done: "Started a timer", icon: Play },
  stopTimer: { label: "Stop timer", doing: "Stopping the timer", done: "Stopped the timer", icon: Square },
  logTimeEntry: { label: "Log time", doing: "Logging time", done: "Logged time", icon: Clock },
  trackMeeting: { label: "Track meeting", doing: "Adding the meeting", done: "Added the meeting", icon: CalendarClock },
  getTimeSummary: { label: "Time summary", doing: "Adding up your time", done: "Added up your time", icon: BarChart3 },
  listProjects: { label: "Projects", doing: "Looking up projects", done: "Looked up projects", icon: ListTree, folded: true },
  deleteEntry: { label: "Delete entry", doing: "Deleting the entry", done: "Deleted the entry", icon: Trash2 },
  rememberPreference: { label: "Remember", doing: "Saving that", done: "Remembered that", icon: Brain },
  searchMemory: { label: "Recall", doing: "Checking what I remember", done: "Checked what I remember", icon: Search, folded: true },
  listTasks: { label: "Tasks", doing: "Looking at your tasks", done: "Looked at your tasks", icon: ListChecks },
  createTask: { label: "Add task", doing: "Adding the task", done: "Added a task", icon: ListPlus },
  completeTask: { label: "Tick off task", doing: "Ticking it off", done: "Ticked off a task", icon: CircleCheck },
  planDay: { label: "Plan the day", doing: "Planning your day", done: "Planned your day", icon: CalendarRange },
  scheduleTasks: { label: "Schedule tasks", doing: "Scheduling tasks", done: "Scheduled tasks", icon: CalendarPlus },
};
const UNKNOWN_TOOL = { label: "Done", doing: "Working", done: "Done", icon: Wrench, folded: false };


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
// Layout primitives. A result is drawn as a row on the rack — an AI Elements
// Item with the same hairline and mono figure as an entry row — rather than a
// tinted status chip: the thing the Assistant just logged should look like the
// thing it logged. It sits on the sheet inside its step's trace, recessed onto
// the ground the way an input is.
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
  swatch,
  title,
  meta,
  figure,
  children,
}: {
  icon?: typeof Play;
  tone?: Tone;
  /** A project colour (or null for "no project") drawn where the icon would be. */
  swatch?: string | null;
  title: React.ReactNode;
  /** The secondary line: project, time range, billable. */
  meta?: React.ReactNode;
  /** The right-hand figure — a duration, a count — in mono. Wrap any words in `<Word>`. */
  figure?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Item
      variant="outline"
      size="xs"
      className={cn(
        "flex-nowrap items-start gap-2 rounded-container bg-background px-3 py-2 text-xs",
        tone === "error" && "border-destructive/40"
      )}
    >
      <ItemMedia className="h-5 w-3.5 shrink-0">
        {swatch !== undefined ? (
          <Swatch color={swatch} />
        ) : (
          Icon && <Icon className={cn("size-3.5", TONE_ICON[tone])} />
        )}
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        {/* Not ItemTitle / ItemDescription: those line-clamp, and the meta line
            must wrap (below), the title truncate on one line. */}
        {/* Two lines before an ellipsis, like a task row: a description cut
            at one line lost its second clause ("…stakehol…"). */}
        <div className="line-clamp-2 text-sm leading-5 wrap-anywhere text-foreground">{title}</div>
        {/* Wraps rather than truncates: the time range at the end is the part
            worth checking, and it was the part an ellipsis cut off. */}
        {meta && <div className="text-pretty text-muted-foreground">{meta}</div>}
        {children && <div className="mt-1 text-muted-foreground">{children}</div>}
      </ItemContent>
      {figure && (
        <span className="shrink-0 font-mono text-sm leading-5 tabular-nums text-foreground">{figure}</span>
      )}
    </Item>
  );
}

/** A word beside a mono figure ("since 14:00", "30m free"): the number holds the column, the word stays in the text face. */
const Word = ({ children }: { children: React.ReactNode }) => <span className="font-sans">{children}</span>;

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
          figure={
            str(out, "startedAt") ? (
              <>
                <Word>since </Word>
                {formatEntryTime(str(out, "startedAt")!, tf)}
              </>
            ) : undefined
          }
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
          // Most of this workspace's time is non-billable; "0m billable" on
          // every summary was noise, so the line appears only when it says something.
          // A running timer is in the total and still climbing; say so, or the
          // figure reads as stale next to the timer bar ticking below it.
          meta={
            [
              Number(out.runningSeconds) > 0 ? `incl. ${duration(out.runningSeconds)} running` : null,
              Number(out.billableSeconds ?? out.billableHours) > 0
                ? `${duration(out.billableSeconds, out.billableHours)} billable`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
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
              figure: p.billable ? <Word>billable</Word> : undefined,
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
          meta={["Added", project, str(out, "due") ? `due ${formatDueDate(str(out, "due")!)}` : "no due date"]
            .filter(Boolean)
            .join(" · ")}
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
          // "Nothing left to plan" over a list of tasks that didn't fit told
          // the user the opposite of the truth.
          title={
            plan.length
              ? "A plan for the rest of today"
              : misfits.length
                ? "Nothing fits in the rest of today"
                : "Nothing left to plan today"
          }
          figure={
            free !== null ? (
              <>
                {formatDurationShort(free * 60)}
                <Word> free</Word>
              </>
            ) : undefined
          }
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
            // The same label-and-figure column as every other list here, not a
            // comma run-on that buried the estimates mid-sentence.
            <div className={cn(plan.length > 0 && "mt-2")}>
              <p className="mb-1">{plan.length ? "Doesn't fit" : "Needs more time than is left"}</p>
              <Lines
                max={6}
                items={misfits.map((m) => ({
                  key: m.taskId,
                  label: m.name,
                  figure: formatDurationShort(m.minutes * 60),
                }))}
              />
            </div>
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
      const meta = TOOLS[name] ?? UNKNOWN_TOOL;
      return <Row icon={meta.icon} tone={isOk(out) ? "info" : "warn"} title={isOk(out) ? meta.label : failure(out, "Couldn't complete that")} />;
    }
  }
}

/**
 * One tool call. Running, failed, declined and done are a step on the trace;
 * waiting for approval is a confirmation Item, rendered by the caller outside
 * the trace (see `isAwaitingApproval`).
 */
export function ToolCard({
  part,
  live = false,
  onApprove,
}: {
  part: ToolPart;
  /** The turn this call belongs to is still streaming. */
  live?: boolean;
  onApprove: (id: string, approved: boolean) => void;
}) {
  const name = toolNameOf(part);
  const meta = TOOLS[name] ?? UNKNOWN_TOOL;
  const state = getToolPartState(part);
  const ctx = useToolContext(TASK_TOOLS.has(name));
  const input = (getToolInput(part) as Rec | undefined) ?? {};
  const output = (getToolOutput(part) as Rec | undefined) ?? {};
  const Icon = meta.icon;

  if (state === "waiting-approval") {
    return <Approval part={part} name={name} input={input} ctx={ctx} onApprove={onApprove} />;
  }
  // "approved" is the gap between Approve and the result arriving: still working,
  // not done — rendering the (empty) result here flashed "Logged 0m".
  if (state === "loading" || state === "streaming" || state === "approved") {
    // A step can only be running while its turn is. One left unfinished by a
    // turn that ended (a dropped socket, a stopped reply) shimmered forever,
    // saying "Planning your day…" about work nothing was doing. "approved"
    // is exempt: it is the instant between Approve and the turn resuming,
    // before the chat reports busy, and would flash "didn't finish" there.
    if (!live && state !== "approved") {
      return (
        <TraceLine>
          <TraceIcon>
            <AlertTriangle />
          </TraceIcon>
          <TraceTitle>{meta.label} didn't finish</TraceTitle>
        </TraceLine>
      );
    }
    return (
      <TraceLine status="running">
        <TraceIcon>
          <Icon />
        </TraceIcon>
        <TraceTitle>{meta.doing}…</TraceTitle>
      </TraceLine>
    );
  }
  if (state === "error") {
    return (
      <TraceLine status="error">
        <TraceIcon>
          <AlertTriangle />
        </TraceIcon>
        <TraceTitle>{meta.label} didn't go through</TraceTitle>
      </TraceLine>
    );
  }
  if (state === "denied") {
    return (
      <TraceLine>
        <TraceIcon>
          <X />
        </TraceIcon>
        <TraceTitle>Declined · {meta.label}</TraceTitle>
      </TraceLine>
    );
  }

  return (
    <TraceCollapsible defaultOpen={!meta.folded}>
      <TraceCollapsibleTrigger>
        <TraceLine status={isOk(output) ? undefined : "error"}>
          <TraceIcon>
            <Icon />
          </TraceIcon>
          <TraceTitle>{meta.done}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="flex flex-col gap-1.5">
        {renderResult(name, input, output, ctx)}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
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

  // AI Elements' Confirmation: a question for the person, not a step the
  // Assistant took, so it is an Item outside the trace. The stronger hairline
  // is what sets it apart from the result rows around it — not a colour.
  return (
    <Item
      role="group"
      aria-label="Waiting for your approval"
      variant="outline"
      size="sm"
      className="flex-col items-stretch gap-2.5 rounded-container border-border-strong bg-background px-3 py-2.5"
    >
      <ItemContent className="gap-1">
        {name === "deleteEntry" ? (
          <DeleteProposal id={str(input, "id")} ctx={ctx} />
        ) : (
          proposal && <ProposalBody proposal={proposal} />
        )}
      </ItemContent>
      {/* Wraps: at large text sizes the pair is wider than the card, and an
          unwrapped row pushed Decline out past its edge and scrolled the thread. */}
      <ItemActions className="flex-wrap gap-2">
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
      </ItemActions>
    </Item>
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
