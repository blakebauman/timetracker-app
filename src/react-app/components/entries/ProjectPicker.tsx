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
}

export function ProjectPicker({
  value,
  onChange,
  compact = false,
  className,
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
        <Button
          variant="ghost"
          size={compact ? "sm" : "default"}
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
