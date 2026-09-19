import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface BillableToggleProps {
  value: boolean;
  onChange: (billable: boolean) => void;
  className?: string;
}

/**
 * Whether the time being tracked is invoiceable.
 *
 * `billable` is the only column reports read to compute both billable hours and
 * invoiced amount, and nothing derives it from the project at read time — so
 * until this control existed the timer bar, the product's primary logging
 * surface, could not express the product's core unit of value. Every timer
 * started here landed non-billable and reported zero revenue.
 *
 * The glyph is the same bare `$` the entry row uses for its billable indicator
 * (not a lucide icon) so the two surfaces read as one vocabulary, and it carries
 * `--primary-ink` for the same reason: this is the brand red as *text*, which is
 * the one calibration of it that clears AA at small sizes.
 *
 * Icon-only with an accessible name, per the dense-toolbar convention — but
 * `aria-pressed` rather than a bare button, because the state is the point.
 */
export function BillableToggle({ value, onChange, className }: BillableToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          // The name is the thing; `aria-pressed` is the state — so a screen
          // reader announces "Billable, toggle button, pressed" rather than a
          // name that changes out from under it. Instructions ("click to…")
          // don't belong in an accessible name, and a state-carrying name here
          // also collided with the report bulk bar's "Mark billable".
          aria-pressed={value}
          aria-label="Billable"
          onClick={() => onChange(!value)}
          className={cn(
            "tt-touch shrink-0 font-semibold transition-colors duration-fast ease-out-quart",
            value
              ? "text-primary-ink hover:text-primary-ink"
              : "text-muted-foreground hover:text-foreground",
            className
          )}
        >
          {/* Weight carries the state alongside colour, so it survives a
              greyscale render and Windows high-contrast mode — hue is the
              channel a colour-blind reader loses. Deliberately no opacity on
              the off state: at `opacity-70` the glyph measured 2.78:1 on card
              in light mode, under the 3:1 a meaningful graphic needs. Full
              `muted-foreground` is 4.94:1, and weight still does the work. */}
          <span aria-hidden className={cn("text-sm", !value && "font-normal")}>
            $
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{value ? "Billable" : "Non-billable"}</TooltipContent>
    </Tooltip>
  );
}
