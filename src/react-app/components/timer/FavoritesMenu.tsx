import { Star, Plus, X, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ColorDot } from "@/components/ColorDot";
import { useFavorites, useCreateFavorite, useDeleteFavorite } from "@/hooks/useFavorites";
import { useTimer } from "@/hooks/useTimer";
import { cn } from "@/lib/utils";
import type { Favorite } from "@shared/schemas";

interface FavoritesMenuProps {
  // The current draft in the timer bar, offered as "save current as favorite".
  current?: {
    description: string;
    projectId: string | null;
    taskId: string | null;
    tags?: string[];
    billable?: boolean;
  };
}

// Star dropdown in the timer bar: one-click start from a saved preset, plus
// "save current as favorite". Mirrors Toggl's Favorites.
export function FavoritesMenu({ current }: FavoritesMenuProps) {
  const { data: favorites = [] } = useFavorites();
  const createFavorite = useCreateFavorite();
  const deleteFavorite = useDeleteFavorite();
  const { startTimer } = useTimer();

  const start = (f: Favorite) =>
    startTimer({
      description: f.description,
      projectId: f.projectId,
      taskId: f.taskId,
      tags: f.tags,
      billable: f.billable,
    });

  // Only offer to save when there's something worth saving.
  const canSaveCurrent = Boolean(
    current && (current.description.trim() || current.projectId)
  );

  const saveCurrent = () => {
    if (!current) return;
    createFavorite.mutate({
      description: current.description,
      projectId: current.projectId,
      taskId: current.taskId,
      tags: current.tags ?? [],
      billable: current.billable ?? false,
    });
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              // `icon-sm`, not `size="icon"` + `h-8 w-8` — the ad-hoc override
              // DESIGN.md §8 bans, and it is what let this button drift to a
              // different height from its neighbours in the first place.
              size="icon-sm"
              // `text-amber-500` was a raw Tailwind palette value with no token
              // behind it — a third saturated colour in a bar the One Accent
              // Rule allows one or two in — and it measured 2.11:1 against card
              // in light mode, under the 3:1 a state-carrying graphic needs.
              // Fill vs. outline is what a star means everywhere, so state
              // needs no colour of its own here; both states stay muted so the
              // Start disc keeps the bar's only strong mark. The count is in
              // the accessible name rather than carried by hue.
              className="tt-touch text-muted-foreground hover:text-foreground"
              aria-label={
                favorites.length > 0
                  ? `Favorites — ${favorites.length} saved`
                  : "Favorites"
              }
            >
              <Star className={cn("h-4 w-4", favorites.length > 0 && "fill-current")} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Favorites</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Favorites</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {favorites.length === 0 && (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            No favorites yet. Save a preset to start it in one click.
          </div>
        )}

        {favorites.map((f) => (
          <DropdownMenuItem
            key={f.id}
            className="group flex items-center gap-2"
            onSelect={(e) => {
              e.preventDefault();
              start(f);
            }}
          >
            <Play className="h-3 w-3 shrink-0 text-muted-foreground" />
            {f.projectId && <ColorDot color={f.projectColor} />}
            <span className="min-w-0 flex-1 truncate">
              {f.description || <span className="text-muted-foreground">(no description)</span>}
              {f.projectName && (
                <span className="text-muted-foreground"> · {f.projectName}</span>
              )}
            </span>
            <button
              type="button"
              className="tt-reveal shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
              title="Remove favorite"
              aria-label="Remove favorite"
              onClick={(e) => {
                e.stopPropagation();
                deleteFavorite.mutate(f.id);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuItem>
        ))}

        {canSaveCurrent && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                saveCurrent();
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Save current as favorite
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
