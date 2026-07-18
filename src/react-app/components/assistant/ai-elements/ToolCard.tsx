import {
  Play,
  Square,
  Clock,
  CalendarClock,
  ListTree,
  BarChart3,
  Trash2,
  Brain,
  Wrench,
  Check,
  X,
  Loader2,
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
import { cn } from "@/lib/utils";

type ToolPart = UIMessage["parts"][number];

// Humanized labels + icons for Aski's tools (part.type is `tool-<name>`).
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

/** One-line result summary from a tool's structured output. */
function summarize(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  if (o.ok === false) return String(o.reason ?? "Couldn't complete that.");
  const bits: string[] = [];
  if (typeof o.project === "string" && o.project) bits.push(o.project);
  if (typeof o.durationHours === "string") bits.push(`${o.durationHours}h`);
  if (typeof o.totalHours === "string") bits.push(`${o.totalHours}h total`);
  if (typeof o.billableHours === "string") bits.push(`${o.billableHours}h billable`);
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
  const Icon = meta.icon;
  const state = getToolPartState(part);
  const output = getToolOutput(part);
  const summary = summarize(output);

  const busy = state === "loading" || state === "streaming";
  const failed = state === "error";

  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/40 px-3 py-2 text-xs",
        failed && "border-destructive/40"
      )}
    >
      <div className="flex items-center gap-2">
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : failed ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="font-medium">{meta.label}</span>
        {state === "denied" && <span className="text-muted-foreground">— declined</span>}
      </div>

      {summary && !busy && (
        <p className={cn("mt-1 pl-5.5", failed ? "text-destructive" : "text-muted-foreground")}>
          {summary}
        </p>
      )}

      {state === "waiting-approval" && (
        <ApprovalPrompt part={part} name={name} onApprove={onApprove} />
      )}
    </div>
  );
}

function ApprovalPrompt({
  part,
  name,
  onApprove,
}: {
  part: ToolPart;
  name: string;
  onApprove: (id: string, approved: boolean) => void;
}) {
  const approval = getToolApproval(part);
  const input = getToolInput(part) as Record<string, unknown> | undefined;
  if (!approval?.id) return null;

  return (
    <div className="mt-2 space-y-2 pl-5.5">
      <p className="text-muted-foreground">
        Aski wants to run <span className="font-medium text-foreground">{name}</span>
        {input?.id ? ` on entry ${String(input.id).slice(0, 8)}…` : ""}. Approve?
      </p>
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
