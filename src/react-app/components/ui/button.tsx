import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // `border border-transparent bg-clip-padding` is the radix-maia base, and it
  // is load-bearing rather than cosmetic: `focus-visible:border-ring` below sets
  // a border *colour*, and Tailwind's preflight leaves border-width at 0, so on
  // every variant that didn't declare its own border the focus border simply
  // never rendered. Measured across the app: border-width was 0px on every
  // button. DESIGN.md §7 documents focus as "border shifts to the ring color
  // plus a 3px ring" — only the ring half was ever true here. A transparent
  // base border also keeps the box identical between variants, so `outline`
  // isn't quietly 1px tighter inside than `default`. Switch already did this.
  //
  // The press scale stays at 97% (DESIGN.md §7) but skips menu triggers, which
  // is maia's `not-aria-[haspopup]` refinement: a trigger that shrinks while
  // its menu is opening reads as two conflicting animations on one click.
  //
  // `aria-expanded` styling is the other convention worth taking — an open
  // dropdown's trigger should look held-open, and none of these variants said
  // so, so a `...` menu button looked identical open and closed.
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all duration-150 ease-out-quart outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        // shadow-xs dropped: DESIGN.md §4's Flat-By-Default Rule says there is
        // no resting shadow anywhere in the system and that overlay shadows are
        // the only shadows in the app. Both were false while these controls
        // carried one. maia has no shadow on any control either.
        outline:
          "border-border bg-background hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3.5 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
