import { useState } from "react";
import { Check, ChevronDown, CheckSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useTasks, useCreateTask } from "@/hooks/useTasks";

interface TaskPickerProps {
  projectId: string | null;
  value: string | null;
  onChange: (taskId: string | null) => void;
  compact?: boolean;
  className?: string;
  /**
   * Render the trigger as a form field — bordered, full width — instead of the
   * ghost chip used in dense toolbars. The edit-entry sheet stacks this next to
   * bordered inputs, where a borderless trigger read as a label rather than a
   * control and broke the column's left edge.
   */
  field?: boolean;
}

export function TaskPicker({
  projectId,
  value,
  onChange,
  compact = false,
  className,
  field = false,
}: TaskPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: tasks = [] } = useTasks(projectId ?? undefined);
  const createTask = useCreateTask();

  const selected = tasks.find((t) => t.id === value);

  const select = (taskId: string | null) => {
    onChange(taskId);
    setOpen(false);
  };

  // Same reasoning as the project picker: a project with no tasks yet offered
  // only "No task", so breaking work down meant leaving the timer for /tasks.
  const typed = search.trim();
  const exists = tasks.some((t) => t.name.toLowerCase() === typed.toLowerCase());
  const canCreate = Boolean(projectId) && typed.length > 0 && !exists && !createTask.isPending;

  const handleCreate = async () => {
    if (!projectId) return;
    const task = await createTask.mutateAsync({ name: typed, projectId });
    setSearch("");
    select(task.id);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch("");
  };

  // No project selected = no tasks possible
  if (!projectId) return null;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={field ? "outline" : "ghost"}
          size={compact ? "sm" : "default"}
          aria-label={selected ? `Task: ${selected.name}` : "Select task"}
          className={cn(
            "gap-1.5 text-sm",
            !selected && "text-muted-foreground",
            compact && "h-7 px-2",
            field && "w-full justify-start font-normal",
            className
          )}
        >
          <CheckSquare className="h-3.5 w-3.5 shrink-0" />
          {selected ? (
            <span className="max-w-30 truncate">{selected.name}</span>
          ) : (
            !compact && <span>No task</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder={tasks.length === 0 ? "Name a task…" : "Search or create…"}
            value={search}
            onValueChange={setSearch}
            className="h-9"
          />
          <CommandList>
            <CommandEmpty className="px-2 py-2">
              {canCreate ? (
                <CreateTaskItem
                  name={typed}
                  pending={createTask.isPending}
                  onCreate={handleCreate}
                  standalone
                />
              ) : (
                <span className="text-sm text-muted-foreground">
                  {tasks.length === 0 ? "No tasks for this project" : "No tasks found"}
                </span>
              )}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="no-task"
                keywords={["no task"]}
                onSelect={() => select(null)}
              >
                <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">No task</span>
                {!value && <Check className="ml-auto h-3.5 w-3.5" />}
              </CommandItem>
              {tasks.map((task) => (
                <CommandItem
                  key={task.id}
                  value={task.id}
                  keywords={[task.name]}
                  onSelect={() => select(task.id)}
                >
                  <CheckSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{task.name}</span>
                  {value === task.id && (
                    <Check className="ml-auto h-3.5 w-3.5 shrink-0" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>

            {canCreate && (
              <CommandGroup className="border-t">
                <CreateTaskItem
                  name={typed}
                  pending={createTask.isPending}
                  onCreate={handleCreate}
                />
              </CommandGroup>
            )}

            {tasks.length === 0 && !typed && (
              <p className="border-t px-3 py-2.5 text-xs leading-normal text-muted-foreground">
                Type a name to add the first task to this project.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** "Create <name>" row, shared by the empty and partial-match cases. */
function CreateTaskItem({
  name,
  pending,
  onCreate,
  standalone = false,
}: {
  name: string;
  pending: boolean;
  onCreate: () => void;
  /** Inside CommandEmpty, which cmdk does not treat as selectable. */
  standalone?: boolean;
}) {
  const content = (
    <>
      {pending ? (
        <Spinner size="sm" />
      ) : (
        <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">
        Create <span className="font-medium">{name}</span>
      </span>
    </>
  );

  if (standalone) {
    return (
      <button
        type="button"
        onClick={onCreate}
        disabled={pending}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-fast ease-out-quart hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50"
      >
        {content}
      </button>
    );
  }

  return (
    <CommandItem
      value={`__create__${name}`}
      keywords={[name]}
      onSelect={onCreate}
      disabled={pending}
    >
      {content}
    </CommandItem>
  );
}
