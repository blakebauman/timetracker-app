import { useId, useState } from "react";
import { Plus, CornerDownLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { useCreateTask } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { isQueuedOffline } from "@/lib/api";
import { parseQuickAdd, formatDueDate, formatMinute, PRIORITY_LABEL } from "@/lib/taskUtils";
import { useUIStore } from "@/stores/uiStore";
import { formatDurationShort } from "@/lib/dateUtils";
import { describeRecurRule } from "@timetracker/core/task-recurrence";
import { cn } from "@/lib/utils";
import type { Project } from "@timetracker/core/schemas";

interface QuickAddTaskProps {
  /** Preselected project — the group being added into, or the last one used. */
  defaultProjectId?: string | null;
  /** Seeds the due date, so adding inside "Tomorrow" produces a task due tomorrow. */
  defaultDueDate?: string | null;
  /** Creates a subtask of this task instead of a top-level one. */
  parentId?: string | null;
  autoFocus?: boolean;
  placeholder?: string;
  onDone?: () => void;
  /** Put the project picker on its own line — for narrow hosts like the rail. */
  stacked?: boolean;
  className?: string;
}

/**
 * Inline capture: type, Enter, keep typing.
 *
 * Not a dialog. Adding a task is the highest-frequency action on this page and
 * the one most sensitive to friction — a modal per task is how a list stops
 * getting used, because the cost of capturing the fourth thing you thought of is
 * an open/fill/submit/reopen cycle. The field stays focused after each Enter, so
 * five tasks is five lines of typing.
 *
 * `TaskDialog` survives for the deliberate case (the empty state, and anything
 * needing the fields this line can't express — notes, an estimate, a repeat).
 */
export function QuickAddTask({
  defaultProjectId = null,
  defaultDueDate = null,
  parentId = null,
  autoFocus = false,
  placeholder = "Add a task — try “draft report fri p1 ~2h”",
  onDone,
  stacked = false,
  className,
}: QuickAddTaskProps) {
  const createTask = useCreateTask();
  const { data: projects = [] } = useProjects();
  const [value, setValue] = useState("");
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);
  /** An Enter was refused for want of a project — the field is now invalid. */
  const [refused, setRefused] = useState(false);
  const timeFormat = useUIStore((s) => s.timeFormat);
  const echoId = useId();
  const statusId = useId();

  // With exactly one project there is no choice to make, and asking for it turns
  // every capture into two interactions. `null` still means "not chosen" for
  // everyone else — a task silently filed under a project the user didn't pick
  // is worse than one that won't submit.
  const soleProject = projects.length === 1 ? projects[0].id : null;

  const parsed = parseQuickAdd(value);
  // `#token` resolves against real project names; an unmatched hint is left as
  // plain text rather than silently filed somewhere the user didn't name.
  const hinted: Project | undefined = parsed.projectHint
    ? projects.find((p: Project) => p.name.toLowerCase().replace(/\s+/g, "-").startsWith(parsed.projectHint!))
    : undefined;
  const effectiveProjectId = hinted?.id ?? projectId ?? soleProject;
  const dueDate = parsed.dueDate ?? defaultDueDate;
  // A subtask can't repeat on its own (the server drops the rule), so the line
  // doesn't claim it will.
  const recurRule = parentId ? null : parsed.recurRule;

  const canSubmit = parsed.name.length > 0 && !!effectiveProjectId;
  const needsProject = parsed.name.length > 0 && !effectiveProjectId;
  const pending = createTask.isPending;

  const submit = () => {
    if (needsProject) {
      setRefused(true);
      return;
    }
    // A second Enter while the first is in flight used to create the task twice.
    if (!canSubmit || !effectiveProjectId || pending) return;
    // Clear only the line that was sent. The field stays live while the request
    // is out, and the next task typed meanwhile must survive this one landing.
    const sent = value;
    const clearSent = () => setValue((current) => (current === sent ? "" : current));
    createTask.mutate(
      {
        name: parsed.name,
        projectId: effectiveProjectId,
        ...(dueDate ? { dueDate } : {}),
        ...(parsed.priority ? { priority: parsed.priority } : {}),
        ...(parsed.estimatedSeconds ? { estimatedSeconds: parsed.estimatedSeconds } : {}),
        ...(parsed.scheduledMinute !== null && dueDate ? { scheduledMinute: parsed.scheduledMinute } : {}),
        ...(parsed.deadlineDate ? { deadlineDate: parsed.deadlineDate } : {}),
        ...(parsed.tagHints.length ? { tags: parsed.tagHints } : {}),
        ...(recurRule ? { recurRule } : {}),
        ...(parentId ? { parentId } : {}),
      },
      {
        // Clear on success only. Clearing optimistically and then failing loses
        // what the user typed, and this field's whole job is not losing it.
        onSuccess: clearSent,
        // Queued offline *is* saved — it replays on reconnect. Leaving the text
        // in place invited a second Enter, and a second queued copy.
        onError: (err) => {
          if (isQueuedOffline(err)) clearSent();
        },
      }
    );
  };

  const hasEcho = Boolean(
    parsed.dueDate ||
      parsed.deadlineDate ||
      parsed.priority ||
      parsed.estimatedSeconds ||
      recurRule ||
      hinted ||
      parsed.tagHints.length > 0
  );

  const showPicker = !parentId && !hinted && !soleProject;

  return (
    <div className={cn("space-y-1", className)}>
      {/* The capsule carries the focus treatment for the bare field inside it —
          the border shifts to the ring hue and the 3px ring appears, the one
          focus vocabulary every other input in the app uses. Keyed on the
          field itself, not focus-within: the project chip inside draws its own
          ring, and both at once was a ring inside a ring. */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border border-dashed px-3 py-1.5 transition-[border-color,box-shadow] duration-fast ease-out-quart has-[input:focus-visible]:border-solid has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50",
          refused && needsProject && "border-solid border-warning"
        )}
      >
        <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (refused) setRefused(false);
          }}
          onKeyDown={(e) => {
            // Enter that confirms an IME candidate is not a submit.
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            // Escape leaves the line; it never empties it. A half-typed task is
            // kept for when you come back. An empty subtask line closes.
            if (e.key === "Escape") {
              e.currentTarget.blur();
              if (!value.trim()) onDone?.();
            }
          }}
          placeholder={placeholder}
          aria-label={parentId ? "Add a subtask" : "Add a task"}
          aria-describedby={cn(hasEcho && echoId, needsProject && statusId) || undefined}
          aria-invalid={refused && needsProject ? true : undefined}
          aria-busy={pending || undefined}
          // 16px below md: iOS zooms the page into any field under 16px on focus.
          className="h-6 border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:ring-0 md:text-sm dark:bg-transparent"
        />
        {showPicker && !stacked && (
          <ProjectPicker value={projectId} onChange={setProjectId} className="shrink-0" />
        )}
        {pending ? (
          <Spinner size="sm" className="text-muted-foreground" label="Adding task" />
        ) : (
          canSubmit && <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </div>

      {showPicker && stacked && (
        <ProjectPicker value={projectId} onChange={setProjectId} className="w-full" />
      )}

      {/* Echo what the tokens were understood as, before Enter commits them.
          A parser that silently eats "fri" is worse than no parser — and since
          the tokens are stripped from the name, the name it will actually save
          is echoed too. It describes the field rather than announcing itself:
          a live region here would read out every keystroke. */}
      {hasEcho && (
        <p id={echoId} className="px-3 text-micro text-muted-foreground">
          {[
            `“${parsed.name}”`,
            parsed.dueDate
              ? `due ${formatDueDate(parsed.dueDate).toLowerCase()}${
                  parsed.scheduledMinute !== null ? ` at ${formatMinute(parsed.scheduledMinute, timeFormat)}` : ""
                }`
              : null,
            parsed.deadlineDate ? `deadline ${formatDueDate(parsed.deadlineDate).toLowerCase()}` : null,
            parsed.priority ? `priority ${PRIORITY_LABEL[parsed.priority].toLowerCase()}` : null,
            parsed.estimatedSeconds ? `estimate ${formatDurationShort(parsed.estimatedSeconds)}` : null,
            recurRule ? describeRecurRule(recurRule)?.toLowerCase() : null,
            hinted ? hinted.name : null,
            ...parsed.tagHints.map((t) => `@${t}`),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {/* Enter with no project chosen used to do nothing at all, with nothing on
          screen to say why — the one failure mode a capture field cannot have.
          The region is always mounted so a screen reader hears the message
          when it appears; it's the reason the next Enter won't work, so it
          reads at label size in warning ink, not as a footnote. */}
      <p
        id={statusId}
        role="status"
        className={cn("px-3 text-xs font-medium text-warning-ink", !needsProject && "sr-only")}
      >
        {needsProject
          ? projects.length === 0
            ? "Create a project first — tasks belong to one."
            : "Choose a project to add this task."
          : ""}
      </p>
    </div>
  );
}
