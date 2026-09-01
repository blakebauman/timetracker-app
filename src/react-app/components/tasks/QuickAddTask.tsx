import { useState } from "react";
import { Plus, CornerDownLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { useCreateTask } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { parseQuickAdd, formatDueDate, PRIORITY_LABEL } from "@/lib/taskUtils";
import { cn } from "@/lib/utils";
import type { Project } from "@shared/schemas";

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
 * `AddTaskDialog` survives for the deliberate case (the empty state, and adding
 * from elsewhere with a project to choose).
 */
export function QuickAddTask({
  defaultProjectId = null,
  defaultDueDate = null,
  parentId = null,
  autoFocus = false,
  placeholder = "Add a task — try “draft report tomorrow p1”",
  onDone,
  stacked = false,
  className,
}: QuickAddTaskProps) {
  const createTask = useCreateTask();
  const { data: projects = [] } = useProjects();
  const [value, setValue] = useState("");
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);

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

  const canSubmit = parsed.name.length > 0 && !!effectiveProjectId;

  const submit = () => {
    if (!canSubmit || !effectiveProjectId) return;
    createTask.mutate(
      {
        name: parsed.name,
        projectId: effectiveProjectId,
        ...(dueDate ? { dueDate } : {}),
        ...(parsed.priority ? { priority: parsed.priority } : {}),
        ...(parentId ? { parentId } : {}),
      },
      {
        // Clear on success only. Clearing optimistically and then failing loses
        // what the user typed, and this field's whole job is not losing it.
        onSuccess: () => setValue(""),
      }
    );
  };

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5 transition-colors duration-fast ease-out-quart focus-within:border-solid focus-within:border-ring">
        <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              setValue("");
              onDone?.();
            }
          }}
          placeholder={placeholder}
          aria-label="Add a task"
          className="h-6 border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
        />
        {!parentId && !hinted && !soleProject && !stacked && (
          <ProjectPicker value={projectId} onChange={setProjectId} className="shrink-0" />
        )}
        {canSubmit && (
          <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </div>

      {!parentId && !hinted && !soleProject && stacked && (
        <ProjectPicker value={projectId} onChange={setProjectId} className="w-full" />
      )}

      {/* Echo what the tokens were understood as, before Enter commits them.
          A parser that silently eats "fri" is worse than no parser — and since
          the tokens are stripped from the name, the name it will actually save
          is echoed too. */}
      {(parsed.dueDate || parsed.priority || hinted) && (
        <p className="px-2 text-micro text-muted-foreground">
          {[
            `“${parsed.name}”`,
            parsed.dueDate ? `due ${formatDueDate(parsed.dueDate).toLowerCase()}` : null,
            parsed.priority ? `priority ${PRIORITY_LABEL[parsed.priority].toLowerCase()}` : null,
            hinted ? hinted.name : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {/* Enter with no project chosen used to do nothing at all, with nothing on
          screen to say why — the one failure mode a capture field cannot have. */}
      {parsed.name.length > 0 && !effectiveProjectId && (
        <p className="px-2 text-micro text-muted-foreground">
          {projects.length === 0
            ? "Create a project first — tasks belong to one."
            : "Choose a project to add this task."}
        </p>
      )}
    </div>
  );
}
