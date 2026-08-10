import { useState } from "react";
import { Check, ChevronDown, FolderOpen } from "lucide-react";
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
import { ColorDot } from "@/components/ColorDot";
import { cn } from "@/lib/utils";
import { useProjects } from "@/hooks/useProjects";

interface ProjectPickerProps {
  value: string | null;
  onChange: (projectId: string | null) => void;
  compact?: boolean;
  className?: string;
  /** Custom trigger element (single child, receives the popover ref). */
  children?: React.ReactNode;
}

export function ProjectPicker({
  value,
  onChange,
  compact = false,
  className,
  children,
}: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const { data: projects = [] } = useProjects();

  const selected = projects.find((p) => p.id === value);

  const select = (projectId: string | null) => {
    onChange(projectId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
        <Button
          variant="ghost"
          size={compact ? "sm" : "default"}
          // Compact + unselected renders icons only, so the button would have no
          // accessible name at all. Label it unconditionally: even when the name
          // is visible, "ERP Migration" alone doesn't say it's a project picker.
          aria-label={selected ? `Project: ${selected.name}` : "Select project"}
          className={cn(
            "gap-1.5 text-sm",
            !selected && "text-muted-foreground",
            compact && "h-7 px-2",
            className
          )}
        >
          {selected ? (
            <>
              <ColorDot color={selected.color} />
              <span className="max-w-30 truncate">{selected.name}</span>
            </>
          ) : (
            <>
              <FolderOpen className="h-3.5 w-3.5" />
              {!compact && <span>No project</span>}
            </>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search projects..." className="h-9" />
          <CommandList>
            <CommandEmpty>No projects found</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="no-project"
                keywords={["no project"]}
                onSelect={() => select(null)}
              >
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">No project</span>
                {!value && <Check className="ml-auto h-3.5 w-3.5" />}
              </CommandItem>
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={project.id}
                  keywords={[project.name]}
                  onSelect={() => select(project.id)}
                >
                  <ColorDot color={project.color} />
                  <span className="truncate">{project.name}</span>
                  {value === project.id && (
                    <Check className="ml-auto h-3.5 w-3.5 shrink-0" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Dashed "Project" chip for entries without a project — opens the picker in
 * place so an unbillable entry can be fixed without the edit dialog. Dashed
 * border matches the calendar's ghost/gap affordance: unfilled, actionable.
 */
export function AssignProjectChip({
  onAssign,
  ariaLabel = "Assign project",
}: {
  onAssign: (projectId: string) => void;
  ariaLabel?: string;
}) {
  return (
    <ProjectPicker
      value={null}
      onChange={(projectId) => projectId && onAssign(projectId)}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        className="flex h-4 items-center gap-1 rounded-sm border border-dashed border-muted-foreground/40 px-1.5 text-micro font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <FolderOpen className="h-2.5 w-2.5" />
        Project
      </button>
    </ProjectPicker>
  );
}
