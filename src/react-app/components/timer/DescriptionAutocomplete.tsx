import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ColorDot } from "@/components/ColorDot";
import { useEntrySuggestions } from "@/hooks/useEntries";
import { useTagColors } from "@/hooks/useProjects";
import { cn } from "@/lib/utils";
import type { EntrySuggestion } from "@shared/schemas";

// How many suggestions the dropdown shows at once. Past ~8 the list stops being
// scannable and starts competing with the timer controls for vertical space.
const MAX_VISIBLE = 8;

interface DescriptionAutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  onSelect: (s: EntrySuggestion) => void;
  // Enter with no suggestion highlighted falls through to the timer's
  // start/stop, preserving the bar's existing behaviour. Unused (and Enter
  // inserts a newline instead) in multiline mode.
  onSubmit?: () => void;
  // Render a Textarea instead of an Input — for the entry form sheet, where
  // descriptions are multi-line.
  multiline?: boolean;
  id?: string;
  autoFocus?: boolean;
  className?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

// Rank matches: prefix hits first, then most-used, then most-recent. `all` is
// already ordered by recency from the server, so an empty query is just the head
// of the list.
function rankSuggestions(
  all: EntrySuggestion[],
  query: string,
  limit = MAX_VISIBLE
): EntrySuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, limit);

  const scored: { s: EntrySuggestion; idx: number }[] = [];
  for (const s of all) {
    const d = s.description.toLowerCase();
    // Suggesting back exactly what's already typed is noise.
    if (d === q) continue;
    const idx = d.indexOf(q);
    if (idx !== -1) scored.push({ s, idx });
  }
  scored.sort(
    (a, b) =>
      a.idx - b.idx ||
      b.s.uses - a.s.uses ||
      (a.s.lastUsed < b.s.lastUsed ? 1 : -1)
  );
  return scored.slice(0, limit).map((x) => x.s);
}

// Bold the matched span so it's obvious *why* a row is in the list.
function Highlighted({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-semibold text-inherit">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

// The description input (timer bar, and entry form via `multiline`), backed by
// a suggestion list built from the last 90 days of entries. Picking a
// suggestion restores the project/task/billable combo it was usually logged
// against plus the tags from its most recent entry, not just the text.
export function DescriptionAutocomplete({
  value,
  onChange,
  onSelect,
  onSubmit,
  multiline = false,
  id,
  autoFocus,
  className,
  inputRef,
}: DescriptionAutocompleteProps) {
  const { data: suggestions = [] } = useEntrySuggestions();
  const tagColor = useTagColors();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(
    () => rankSuggestions(suggestions, value),
    [suggestions, value]
  );
  const isOpen = open && matches.length > 0;

  const commit = (s: EntrySuggestion) => {
    onSelect(s);
    setOpen(false);
    setActive(-1);
  };

  const move = (delta: number) => {
    setActive((prev) => {
      const next = prev + delta;
      if (next < 0) return matches.length - 1;
      if (next >= matches.length) return 0;
      return next;
    });
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    switch (e.key) {
      case "ArrowDown":
        if (!matches.length) return;
        e.preventDefault();
        if (!isOpen) setOpen(true);
        else move(1);
        return;
      case "ArrowUp":
        if (!isOpen) return;
        e.preventDefault();
        move(-1);
        return;
      case "Enter":
        if (isOpen && active >= 0) {
          e.preventDefault();
          commit(matches[active]);
          return;
        }
        // Multiline: let Enter insert a newline as the Textarea normally would.
        if (!multiline) onSubmit?.();
        return;
      case "Escape":
        if (!isOpen) return;
        // Don't let Escape bubble to global handlers while it's only meant to
        // dismiss this dropdown.
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setActive(-1);
        return;
      case "Tab":
        setOpen(false);
        setActive(-1);
    }
  };

  // Input and Textarea take the same handlers/aria wiring; only the element
  // (and its ref type) differs between the timer bar and the entry form.
  const fieldProps = {
    id,
    value,
    autoFocus,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
      onChange(e.target.value);
      setOpen(true);
      setActive(-1);
    },
    onFocus: () => setOpen(true),
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // Ignore blur caused by clicking a row — the row's mousedown handler
      // commits it; closing here first would cancel the click.
      if (listRef.current?.contains(e.relatedTarget as Node)) return;
      setOpen(false);
      setActive(-1);
    },
    onKeyDown: handleKeyDown,
    placeholder: multiline ? "What did you work on?" : "What are you working on?",
    role: "combobox",
    "aria-expanded": isOpen,
    "aria-autocomplete": "list" as const,
    "aria-controls": "description-suggestions",
    "aria-activedescendant":
      active >= 0 ? `description-suggestion-${active}` : undefined,
    className,
  };

  return (
    <Popover open={isOpen} onOpenChange={(o) => !o && setOpen(false)}>
      <PopoverAnchor asChild>
        {multiline ? (
          <Textarea {...fieldProps} />
        ) : (
          <Input ref={inputRef} {...fieldProps} />
        )}
      </PopoverAnchor>
      <PopoverContent
        ref={listRef}
        id="description-suggestions"
        role="listbox"
        align="start"
        // Matching the trigger width is right until the trigger is narrow: in
        // the timer bar's single-row band the input can sit around 140px, and a
        // 140px suggestion list can't show a description, a project and a task.
        // Floor it at a readable width, capped to the viewport so it can't
        // become the thing that overflows.
        className="w-(--radix-popover-trigger-width) max-w-[calc(100vw-2rem)] min-w-80 p-1"
        // Focus must stay in the input so typing continues to filter.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {matches.map((s, i) => (
          <button
            key={`${s.description}__${s.projectId ?? ""}__${s.taskId ?? ""}`}
            id={`description-suggestion-${i}`}
            type="button"
            role="option"
            aria-selected={i === active}
            // mousedown, not click: it fires before the input's blur.
            onMouseDown={(e) => {
              e.preventDefault();
              commit(s);
            }}
            onMouseEnter={() => setActive(i)}
            className={cn(
              "flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left text-sm",
              i === active && "bg-accent"
            )}
          >
            <span className="w-full truncate text-foreground">
              <Highlighted text={s.description} query={value} />
            </span>
            <span className="flex w-full items-center gap-1.5 text-xs text-muted-foreground">
              {s.projectId ? (
                <>
                  <ColorDot color={s.projectColor} />
                  <span className="truncate">{s.projectName}</span>
                  {s.taskName && (
                    <span className="truncate opacity-70">· {s.taskName}</span>
                  )}
                </>
              ) : (
                <span className="opacity-70">No project</span>
              )}
              {/* Tags carried over on selection — kept quieter than the project
                  name so the row doesn't turn into a badge salad. */}
              {s.tags.length > 0 && (
                <span className="flex min-w-0 shrink-0 items-center gap-1.5">
                  {s.tags.slice(0, 2).map((t) => (
                    <span key={t} className="flex max-w-24 items-center gap-1">
                      <ColorDot color={tagColor(t)} className="h-1.5 w-1.5" />
                      <span className="truncate">{t}</span>
                    </span>
                  ))}
                  {s.tags.length > 2 && (
                    <span className="opacity-70">+{s.tags.length - 2}</span>
                  )}
                </span>
              )}
              <span className="ml-auto shrink-0 tabular-nums opacity-70">
                ×{s.uses}
              </span>
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
