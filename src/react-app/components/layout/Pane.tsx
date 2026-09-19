import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * The pane: the one shape every route is built from.
 *
 * A pane is a tall column. Its header does not sit above the content — it
 * floats over it, and the content fades out underneath as it scrolls past
 * (a gradient from the ground, so rows slide under the title rather than
 * being clipped by a hard edge). There are no scrollbars anywhere in the
 * app; the fade is what says "there is more".
 *
 * `PaneHeader` measures itself and reports its height to the pane, which
 * exposes it as `--pane-header-h`; `PaneScroll` pads by that much, so a
 * header that wraps to two rows at a narrow width pushes the content down
 * instead of covering its first row.
 */
const PaneContext = createContext<{ setHeaderHeight: (h: number) => void } | null>(null);

export function Pane({
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  return (
    <PaneContext.Provider value={{ setHeaderHeight }}>
      <div
        data-slot="pane"
        className={cn("relative flex h-full min-h-0 flex-col overflow-hidden", className)}
        style={
          {
            ...style,
            ...(headerHeight !== null ? { "--pane-header-h": `${headerHeight}px` } : {}),
          } as CSSProperties
        }
        {...props}
      >
        {children}
      </div>
    </PaneContext.Provider>
  );
}

export function PaneHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  const ctx = useContext(PaneContext);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      setHeight(h);
      ctx?.setHeaderHeight(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ctx]);

  return (
    <>
      {/* The fade lives on the pane, sized from the measured header, so the
          scroll region under it can be any component. */}
      <div
        aria-hidden
        className="tt-pane-fade pointer-events-none absolute inset-x-0 top-0 z-sticky"
        style={{ height: height ? height + 20 : undefined }}
      />
      <div
        ref={ref}
        data-slot="pane-header"
        className={cn(
          "absolute inset-x-0 top-0 z-sticky flex flex-wrap items-center gap-x-3 gap-y-2 px-6 pt-5 pb-2",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </>
  );
}

/** The page's name: a 24px bold title, inline with its actions. */
export function PaneTitle({
  className,
  children,
  subtitle,
  ...props
}: React.ComponentProps<"h1"> & { subtitle?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <h1
        data-slot="pane-title"
        className={cn("truncate text-2xl font-bold tracking-tight", className)}
        {...props}
      >
        {children}
      </h1>
      {subtitle && (
        <span className="shrink-0 text-sm text-muted-foreground">{subtitle}</span>
      )}
    </div>
  );
}

/** Filters, period controls and the primary action, right-aligned. */
export function PaneActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="pane-actions"
      className={cn("ml-auto flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

/**
 * The scroll region. Pads by the header's measured height so the first row
 * starts below the title. Pass `padded={false}` for a body that manages its
 * own scrolling (the calendar grid, the timesheet) — it still starts below
 * the header, but nothing else is assumed about it.
 */
export function PaneScroll({
  className,
  style,
  padded = true,
  ...props
}: React.ComponentProps<"div"> & { padded?: boolean }) {
  return (
    <div
      data-slot="pane-scroll"
      className={cn(
        "min-h-0 flex-1",
        padded ? "overflow-y-auto px-6 pb-6" : "flex flex-col overflow-hidden",
        className
      )}
      style={{ paddingTop: "var(--pane-header-h, 4.5rem)", ...style }}
      {...props}
    />
  );
}
