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
  Check,
  X,
  AlertTriangle,
} from "lucide-react";
import type { UIMessage } from "ai";
import {
  getToolPartState,
  getToolInput,
  getToolOutput,
  getToolApproval,
} from "@cloudflare/ai-chat/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type ToolPart = UIMessage["parts"][number];
type Rec = Record<string, unknown>;

// Humanized labels + icons for the assistant's tools (part.type is `tool-<name>`). Used
// for the pending/busy line and as the fallback for unknown tools.
const TOOLS: Record<string, { label: string; icon: typeof Play }> = {
  startTimer: { label: "Start timer", icon: Play },
  stopTimer: { label: "Stop timer", icon: Square },
  logTimeEntry: { label: "Log time entry", icon: Clock },
  trackMeeting: { label: "Track meeting", icon: CalendarClock },
  getTimeSummary: { label: "Time summary", icon: BarChart3 },
  listProjects: { label: "List projects", icon: ListTree },
  deleteEntry: { label: "Delete entry", icon: Trash2 },
  rememberPreference: { label: "Remember", icon: Brain },
  searchMemory: { label: "Recall", icon: Brain },
};

function toolNameOf(part: ToolPart): string {
  return typeof part.type === "string" && part.type.startsWith("tool-")
    ? part.type.slice("tool-".length)
    : "";
}

// ---------------------------------------------------------------------------
// Layout primitive — one consistent card shell across every tool result
// (fold.run chat/tool-cards, remapped to our semantic tokens rather than raw
// emerald/amber so it obeys the design system's status palette).
// ---------------------------------------------------------------------------

type Tone = "muted" | "ok" | "warn" | "error";

const TONE_SHELL: Record<Tone, string> = {
  muted: "border-border bg-muted/40",
  ok: "border-success/30 bg-success/5",
  warn: "border-warning/30 bg-warning/5",
  error: "border-destructive/40 bg-destructive/10",
};
const TONE_ICON: Record<Tone, string> = {
  muted: "text-muted-foreground",
  ok: "text-success",
  warn: "text-warning",
  error: "text-destructive",
};

function Card({
  icon: Icon,
  tone = "muted",
  spin = false,
  title,
  children,
}: {
  /** Omitted when `spin` is set — the busy state supplies its own indicator. */
  icon?: typeof Play;
  tone?: Tone;
  spin?: boolean;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-xs", TONE_SHELL[tone])}>
      <div className="flex items-center gap-2">
        {spin ? (
          <Spinner size="sm" className={TONE_ICON[tone]} />
        ) : (
          Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0", TONE_ICON[tone])} />
        )}
        <span className="min-w-0 flex-1 font-medium text-foreground">{title}</span>
      </div>
      {children && <div className="mt-1 pl-5.5 text-muted-foreground">{children}</div>}
    </div>
  );
}

function str(o: Rec, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function isOk(o: Rec): boolean {
  return o.ok !== false;
}
/** " · Acme" style project suffix, or "" when unprojected. */
function projectSuffix(o: Rec): string {
  const p = str(o, "project");
  return p ? ` · ${p}` : "";
}

// ---------------------------------------------------------------------------
// Per-tool result cards. Each maps one tool's output shape (see
// worker/lib/assistant-tools.ts) to a compact at-a-glance card.
// ---------------------------------------------------------------------------

function renderResult(name: string, input: Rec, out: Rec): React.ReactNode {
  switch (name) {
    case "startTimer":
      return (
        <Card icon={Play} tone="ok" title={`Started timer${projectSuffix(out)}`}>
          <span>{out.billable ? "Billable" : "Non-billable"}</span>
          {str(out, "note") && <span> · {str(out, "note")}</span>}
        </Card>
      );

    case "stopTimer":
      if (!isOk(out))
        return <Card icon={Square} tone="warn" title={str(out, "reason") ?? "No timer running"} />;
      return (
        <Card
          icon={Square}
          tone="ok"
          title={`Stopped timer · ${str(out, "durationHours") ?? "0"}h`}
        />
      );

    case "logTimeEntry":
      if (!isOk(out))
        return <Card icon={Clock} tone="error" title={str(out, "reason") ?? "Couldn't log entry"} />;
      return (
        <Card
          icon={Clock}
          tone="ok"
          title={`Logged ${str(out, "durationHours") ?? "0"}h${projectSuffix(out)}`}
        >
          {str(out, "note") && <span>{str(out, "note")}</span>}
        </Card>
      );

    case "trackMeeting":
      if (!isOk(out))
        return (
          <Card
            icon={CalendarClock}
            tone="error"
            title={str(out, "reason") ?? "Couldn't track meeting"}
          />
        );
      return (
        <Card
          icon={CalendarClock}
          tone="ok"
          title={`Tracked meeting · ${str(out, "durationHours") ?? "0"}h${projectSuffix(out)}`}
        />
      );

    case "getTimeSummary": {
      const byProject =
        (out.byProject as
          | Array<{ project?: string; hours?: string; entries?: number }>
          | undefined) ?? [];
      return (
        <Card icon={BarChart3} title={`${str(out, "totalHours") ?? "0"}h tracked`}>
          <div className="text-foreground/80">{str(out, "billableHours") ?? "0"}h billable</div>
          {byProject.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1">
              {byProject.slice(0, 6).map((r, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-foreground/90">{r.project ?? "No project"}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {r.hours ?? "0"}h
                  </span>
                </li>
              ))}
              {byProject.length > 6 && (
                <li className="text-micro italic text-muted-foreground/70">
                  +{byProject.length - 6} more
                </li>
              )}
            </ul>
          )}
        </Card>
      );
    }

    case "listProjects": {
      const projects =
        (out.projects as Array<{ name?: string; billable?: boolean }> | undefined) ?? [];
      return (
        <Card
          icon={ListTree}
          title={`${projects.length} project${projects.length === 1 ? "" : "s"}`}
        >
          {projects.length > 0 && (
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {projects.slice(0, 8).map((p, i) => (
                <li key={i} className="flex items-center gap-1.5 truncate">
                  <span className="truncate text-foreground/90">{p.name ?? "?"}</span>
                  {p.billable && <span className="text-micro text-success">billable</span>}
                </li>
              ))}
              {projects.length > 8 && (
                <li className="text-micro italic text-muted-foreground/70">
                  +{projects.length - 8} more
                </li>
              )}
            </ul>
          )}
        </Card>
      );
    }

    case "deleteEntry":
      if (!isOk(out))
        return <Card icon={Trash2} tone="warn" title={str(out, "reason") ?? "Nothing deleted"} />;
      return <Card icon={Trash2} tone="ok" title="Deleted entry" />;

    case "rememberPreference":
      return (
        <Card icon={Brain} tone="ok" title="Remembered">
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {str(out, "key") ?? str(input, "key") ?? "?"}
          </code>
        </Card>
      );

    case "searchMemory": {
      const memories = (out.memories as string[] | undefined) ?? [];
      return (
        <Card
          icon={Search}
          title={`Recalled ${memories.length} fact${memories.length === 1 ? "" : "s"}`}
        >
          {memories.length > 0 && (
            <ul className="mt-0.5 flex flex-col gap-0.5">
              {memories.slice(0, 4).map((m, i) => (
                <li key={i} className="truncate">
                  {m}
                </li>
              ))}
              {memories.length > 4 && (
                <li className="text-micro italic text-muted-foreground/70">
                  +{memories.length - 4} more
                </li>
              )}
            </ul>
          )}
        </Card>
      );
    }

    default: {
      // Unknown tool — fall back to a generic one-line summary.
      const meta = TOOLS[name] ?? { label: name || "Tool", icon: Wrench };
      const summary = genericSummary(out);
      return (
        <Card icon={meta.icon} tone={isOk(out) ? "muted" : "warn"} title={meta.label}>
          {summary}
        </Card>
      );
    }
  }
}

/** Best-effort one-liner for a tool we don't have a bespoke card for. */
function genericSummary(o: Rec): string | null {
  if (o.ok === false) return String(o.reason ?? "Couldn't complete that.");
  const bits: string[] = [];
  if (typeof o.project === "string" && o.project) bits.push(o.project);
  if (typeof o.durationHours === "string") bits.push(`${o.durationHours}h`);
  if (typeof o.totalHours === "string") bits.push(`${o.totalHours}h total`);
  if (typeof o.note === "string" && o.note) bits.push(o.note);
  return bits.join(" · ") || null;
}

export function ToolCard({
  part,
  onApprove,
}: {
  part: ToolPart;
  onApprove: (id: string, approved: boolean) => void;
}) {
  const name = toolNameOf(part);
  const meta = TOOLS[name] ?? { label: name || "Tool", icon: Wrench };
  const state = getToolPartState(part);
  const input = (getToolInput(part) as Rec | undefined) ?? {};
  const output = (getToolOutput(part) as Rec | undefined) ?? {};

  if (state === "loading" || state === "streaming") {
    return <Card spin title={<span className="text-muted-foreground">{meta.label}…</span>} />;
  }
  if (state === "error") {
    return <Card icon={AlertTriangle} tone="error" title={`${meta.label} failed`} />;
  }
  if (state === "waiting-approval") {
    return (
      <Card icon={meta.icon} tone="warn" title={meta.label}>
        <ApprovalPrompt part={part} name={name} input={input} onApprove={onApprove} />
      </Card>
    );
  }
  if (state === "denied") {
    return <Card icon={X} tone="muted" title={`${meta.label} — declined`} />;
  }

  return <>{renderResult(name, input, output)}</>;
}

function ApprovalPrompt({
  part,
  name,
  input,
  onApprove,
}: {
  part: ToolPart;
  name: string;
  input: Rec;
  onApprove: (id: string, approved: boolean) => void;
}) {
  const approval = getToolApproval(part);
  if (!approval?.id) return null;

  // Show the salient inputs so the user approves the actual action — not just a
  // tool name — and can catch an injected/incorrect entry before it's written.
  const details: string[] = [];
  const desc = input.description ?? input.title ?? input.content;
  if (typeof desc === "string" && desc.trim()) details.push(`“${desc.trim()}”`);
  if (typeof input.projectName === "string" && input.projectName.trim()) details.push(String(input.projectName));
  if (typeof input.start === "string" && typeof input.stop === "string") {
    details.push(`${new Date(input.start).toLocaleString()} → ${new Date(input.stop).toLocaleString()}`);
  }
  if (typeof input.billable === "boolean") details.push(input.billable ? "billable" : "non-billable");

  return (
    <div className="space-y-2">
      <p>
        The assistant wants to run <span className="font-medium text-foreground">{name}</span>
        {input.id ? ` on entry ${String(input.id).slice(0, 8)}…` : ""}. Approve?
      </p>
      {details.length > 0 && (
        <p className="rounded bg-muted/60 px-2 py-1 text-xs text-muted-foreground">{details.join(" · ")}</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" onClick={() => onApprove(approval.id, true)}>
          <Check className="h-3.5 w-3.5" /> Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => onApprove(approval.id, false)}>
          <X className="h-3.5 w-3.5" /> Deny
        </Button>
      </div>
    </div>
  );
}
