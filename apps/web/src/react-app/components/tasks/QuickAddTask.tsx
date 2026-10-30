import { Fragment, useId, useRef, useState } from "react";
import { BELOW_SM, useMediaQuery } from "@/hooks/useMediaQuery";
import { Plus, CornerDownLeft, CircleHelp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { useCreateTask } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { isQueuedOffline } from "@/lib/api";
import { parseQuickAdd, formatDueSpoken, formatMinute, PRIORITY_LABEL } from "@/lib/taskUtils";
import { useUIStore } from "@/stores/uiStore";
import { formatDurationShort } from "@/lib/dateUtils";
import { describeRecurRule } from "@timetracker/core/task-recurrence";
import { cn } from "@/lib/utils";
import type { Project } from "@timetracker/core/schemas";

/** "the date, priority and estimate" — what a nameless line was read as. */
function naturalList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The grammar, where the line is — it lived only in the user guide. */
const TOKENS: [string, string][] = [
  ["tomorrow · fri · 10d · next week", "due date"],
  ["3pm · 15:00 · at 9:30", "time of day"],
  ["by fri", "deadline"],
  ["p1 – p4", "priority"],
  ["~2h · ~45m", "estimate"],
  ["#acme", "project"],
  ["@discovery", "tag"],
  ["every fri · every weekday", "repeat"],
];

function TokenHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="What the add-task line understands"
          title="What this line understands"
          className="shrink-0 text-muted-foreground"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 text-xs">
        <p className="text-sm font-medium">Type it the way you'd say it</p>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5">
          {TOKENS.map(([example, meaning]) => (
            <Fragment key={meaning}>
              <dt className="font-mono text-foreground">{example}</dt>
              <dd className="text-muted-foreground">{meaning}</dd>
            </Fragment>
          ))}
        </dl>
        <p className="text-muted-foreground">
          The line under the field shows what was understood before you press Enter.
        </p>
      </PopoverContent>
    </Popover>
  );
}

interface QuickAddTaskProps {
  /** Preselected project — the group being added into. */
  defaultProjectId?: string | null;
  /**
   * The project is the host's, not the user's to pick — a project group's
   * "+". The picker is hidden, as it is for a subtask: changing it there filed
   * the task outside the group you were adding to.
   */
  lockProject?: boolean;
  /** Seeds the due date, so adding inside "Tomorrow" produces a task due tomorrow. */
  defaultDueDate?: string | null;
  /** Creates a subtask of this task instead of a top-level one. */
  parentId?: string | null;
  autoFocus?: boolean;
  placeholder?: string;
  /** Accessible name; defaults to "Add a task". Q targets the field with the default. */
  label?: string;
  onDone?: () => void;
  /** Put the project chip on its own line — for narrow hosts like the rail. */
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
 * five tasks is five lines of typing — including after picking a project, which
 * hands focus back to the field rather than leaving it on the chip.
 *
 * `TaskDialog` survives for the deliberate case (the empty state, and anything
 * needing the fields this line can't express — notes, an estimate, a repeat).
 */
export function QuickAddTask({
  defaultProjectId = null,
  lockProject = false,
  defaultDueDate = null,
  parentId = null,
  autoFocus = false,
  placeholder,
  label,
  onDone,
  stacked = false,
  className,
}: QuickAddTaskProps) {
  const createTask = useCreateTask();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  // The full example doesn't fit a phone's line; cut to "draft report f" it
  // taught nothing. The phone gets the tokens alone.
  const phone = useMediaQuery(BELOW_SM);
  const hint = placeholder ?? (phone ? "Add a task — fri p1 ~2h" : "Add a task — try “draft report fri p1 ~2h”");
  const { data: projects = [] } = useProjects();
  const lastProjectId = useUIStore((s) => s.lastTaskProjectId);
  const setLastProjectId = useUIStore((s) => s.setLastTaskProjectId);
  const [value, setValue] = useState("");
  /** Picked here; null = not picked, so the remembered project applies. */
  const [pickedId, setPickedId] = useState<string | null>(null);
  /** The user picked over a `#project` match — the chip wins over the token. */
  const [overrodeHint, setOverrodeHint] = useState(false);
  /** An Enter was refused — the field is now invalid until it's edited. */
  const [refused, setRefused] = useState(false);
  const timeFormat = useUIStore((s) => s.timeFormat);
  const echoId = useId();
  const statusId = useId();

  const known = (id: string | null) => (id && projects.some((p: Project) => p.id === id) ? id : null);
  // With exactly one project there is no choice to make. Otherwise the line
  // starts on the project the last task went to — a run of tasks for one
  // client is one choice, not one per line. Only a first-ever capture has
  // nothing to start on.
  const soleProject = projects.length === 1 ? projects[0].id : null;
  const baseProjectId =
    known(pickedId) ?? known(defaultProjectId) ?? (lockProject || parentId ? null : known(lastProjectId)) ?? soleProject;

  const parsed = parseQuickAdd(value);
  // `#token` resolves against real project names; an unmatched hint is left as
  // plain text rather than silently filed somewhere the user didn't name.
  const hinted: Project | undefined =
    parsed.projectHint && !overrodeHint && !lockProject
      ? projects.find((p: Project) => p.name.toLowerCase().replace(/\s+/g, "-").startsWith(parsed.projectHint!))
      : undefined;
  const effectiveProjectId = hinted?.id ?? baseProjectId;
  const dueDate = parsed.dueDate ?? defaultDueDate;
  // A subtask can't repeat on its own (the server drops the rule), so the line
  // doesn't claim it will.
  const recurRule = parentId ? null : parsed.recurRule;

  // What the line was read as, apart from its name — for the "no name" message.
  const recognised = [
    parsed.dueDate && "date",
    parsed.scheduledMinute !== null && "time",
    parsed.deadlineDate && "deadline",
    parsed.priority && "priority",
    parsed.estimatedSeconds && "estimate",
    recurRule && "repeat",
    hinted && "project",
    parsed.tagHints.length > 0 && (parsed.tagHints.length === 1 ? "tag" : "tags"),
  ].filter(Boolean) as string[];
  const typed = value.trim().length > 0;
  const nameMissing = typed && parsed.name.length === 0;
  const canSubmit = parsed.name.length > 0 && !!effectiveProjectId;
  const needsProject = parsed.name.length > 0 && !effectiveProjectId;
  const pending = createTask.isPending;

  const submit = () => {
    if (nameMissing || needsProject) {
      setRefused(true);
      return;
    }
    // A second Enter while the first is in flight used to create the task twice.
    if (!canSubmit || !effectiveProjectId || pending) return;
    // Clear only the line that was sent. The field stays live while the request
    // is out, and the next task typed meanwhile must survive this one landing.
    const sent = value;
    const clearSent = () => {
      setValue((current) => (current === sent ? "" : current));
      setOverrodeHint(false);
    };
    if (!lockProject && !parentId) setLastProjectId(effectiveProjectId);
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

  // The due day the task will get, said even when it comes from the host (the
  // plan column files under today) rather than from a typed token — otherwise
  // the one date the line applies on its own was the one it never mentioned.
  const showDue = Boolean(dueDate) && (Boolean(parsed.dueDate) || typed);
  const hasEcho = Boolean(
    showDue ||
      parsed.deadlineDate ||
      parsed.priority ||
      parsed.estimatedSeconds ||
      recurRule ||
      hinted ||
      parsed.tagHints.length > 0
  );

  // "every mon" sets both the rule and its first day; "due Monday · every
  // mon" said Monday twice. A repeat says when it starts instead.
  const repeatText = recurRule ? describeRecurRule(recurRule) : null;
  const dueText = dueDate
    ? `${formatDueSpoken(dueDate)}${
        parsed.scheduledMinute !== null ? ` at ${formatMinute(parsed.scheduledMinute, timeFormat)}` : ""
      }`
    : null;

  const showPicker = !parentId && !lockProject && !soleProject;
  // Warning ink only once Enter has been refused: amber on the first keystroke
  // was a telling-off before the thought was finished. Until then the chip
  // says what it's waiting for, neutrally.
  const warn = refused && needsProject;
  const picker = showPicker && (
    <ProjectPicker
      value={effectiveProjectId}
      onChange={(id) => {
        setPickedId(id);
        if (hinted) setOverrodeHint(true);
        if (id) setLastProjectId(id);
        if (refused) setRefused(false);
      }}
      compact
      hideNone
      attention={warn ? "Tasks belong to a project" : undefined}
      emptyLabel={needsProject ? <span className="max-sm:sr-only">Add project</span> : undefined}
      nameClassName="max-sm:max-w-20"
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        inputRef.current?.focus();
      }}
      // A 44px reach on touch without growing the 32px chip in the line.
      className="relative shrink-0 pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-['']"
    />
  );

  const status = refused
    ? nameMissing
      ? `Add a name — only the ${naturalList(recognised.length ? recognised : ["details"])} ${
          recognised.length === 1 ? "was" : "were"
        } recognised.`
      : needsProject
        ? projects.length === 0
          ? "Create a project first — tasks belong to one."
          : "Choose a project to add this task."
        : ""
    : "";

  return (
    <div className={cn("space-y-1", className)}>
      {/* The capsule carries the focus treatment for the bare field inside it —
          the border shifts to the ring hue and the 3px ring appears, the one
          focus vocabulary every other input in the app uses. Keyed on the
          field itself, not focus-within: the project chip inside draws its own
          ring, and both at once was a ring inside a ring. A tap anywhere on
          its padding lands in the field: the input is 24px of a 46px pill. */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) inputRef.current?.focus();
        }}
        className={cn(
          "flex cursor-text items-center gap-2 rounded-full border border-dashed px-3 py-1.5 transition-[border-color,box-shadow] duration-fast ease-out-quart has-[input:focus-visible]:border-solid has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50",
          // After the focus classes, so a refused Enter shows while focused —
          // the ring used to paint straight over the warning edge.
          refused &&
            status &&
            "border-solid border-warning has-[input:focus-visible]:border-warning has-[input:focus-visible]:ring-warning/30"
        )}
      >
        <Plus className="pointer-events-none h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          id={inputId}
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
          placeholder={hint}
          aria-label={label ?? (parentId ? "Add a subtask" : "Add a task")}
          aria-describedby={cn(hasEcho && echoId, status && statusId) || undefined}
          aria-invalid={status ? true : undefined}
          aria-busy={pending || undefined}
          // The phone keyboard's return key reads as "done", not a newline.
          enterKeyHint="done"
          // 16px below md: iOS zooms the page into any field under 16px on focus.
          className="h-6 min-w-0 border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:ring-0 md:text-sm dark:bg-transparent"
        />
        {pending ? (
          <Spinner size="sm" className="text-muted-foreground" label="Adding task" />
        ) : (
          canSubmit && <CornerDownLeft className="pointer-events-none h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        )}
        {!stacked && picker}
        {/* Once, on the page's own line — not on every group's and subtask's. */}
        {!stacked && !phone && !parentId && !lockProject && <TokenHelp />}
      </div>

      {stacked && picker && <div className="flex px-1">{picker}</div>}

      {/* Echo what the tokens were understood as, before Enter commits them.
          A parser that silently eats "fri" is worse than no parser — and since
          the tokens are stripped from the name, the name it will actually save
          is echoed too. It describes the field rather than announcing itself:
          a live region here would read out every keystroke. Label size: it is
          the most useful feedback on the page. */}
      {hasEcho && (
        <p id={echoId} className="px-3 text-xs text-muted-foreground">
          {[
            parsed.name ? `“${parsed.name}”` : "(no name)",
            repeatText
              ? `${repeatText.toLowerCase()}${dueText ? `, from ${dueText}` : ""}`
              : showDue && dueText
                ? `due ${dueText}`
                : null,
            parsed.deadlineDate ? `deadline ${formatDueSpoken(parsed.deadlineDate)}` : null,
            parsed.priority ? `priority ${PRIORITY_LABEL[parsed.priority].toLowerCase()}` : null,
            parsed.estimatedSeconds ? `estimate ${formatDurationShort(parsed.estimatedSeconds)}` : null,
            hinted ? `in ${hinted.name}` : null,
            ...parsed.tagHints.map((t) => `@${t}`),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {/* Why the last Enter didn't add anything, in warning ink at label size.
          Always mounted, so a screen reader hears the message when it appears. */}
      <p
        id={statusId}
        role="status"
        className={cn("px-3 text-xs font-medium text-warning-ink", !status && "sr-only")}
      >
        {status}
      </p>
    </div>
  );
}
