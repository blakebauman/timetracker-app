import { Suspense, type ComponentProps, type ComponentType } from "react";
import type { Calendar } from "@/components/ui/calendar";
import { lazyWithReload } from "@/lib/lazyWithReload";

// The month grid only ever renders inside a popover or dialog that the user
// opens, but imported statically it put react-day-picker in every first load.
const CalendarImpl = lazyWithReload(() =>
  import("@/components/ui/calendar").then((m) => ({
    default: m.Calendar as ComponentType<unknown>,
  }))
) as unknown as typeof Calendar;

/**
 * `Calendar`, fetched the first time a popover opens one. The fallback holds
 * the grid's footprint so the popover doesn't resize when it arrives.
 */
export function LazyCalendar(props: ComponentProps<typeof Calendar>) {
  return (
    <Suspense fallback={<div aria-hidden className="h-[18.5rem] w-[15.75rem]" />}>
      <CalendarImpl {...props} />
    </Suspense>
  );
}
