/**
 * Column geometry shared by the two week grids — Timesheet and Planner.
 *
 * They are the same table shape with different cells, and they had the same
 * measurements typed out twice in six places each. The widths matter beyond
 * tidiness: the Project column's `left` offset must equal the Task column's
 * width or the second sticky column overlaps the first mid-scroll, and that is
 * exactly the kind of pair that drifts when it lives in two files.
 *
 * The small-screen sizes exist because the two label columns took 280 of a
 * 390px viewport, leaving about 110px of the scrollable week visible — one day
 * column and half of the next. At 196px the scroll is worth performing.
 */
const TASK_COL = "sticky left-0 z-sticky w-[92px] min-w-[92px] sm:w-[132px] sm:min-w-[132px]";
const PROJECT_COL =
  "sticky left-[92px] z-sticky w-[104px] min-w-[104px] border-r border-border-strong sm:left-[132px] sm:w-[148px] sm:min-w-[148px]";
const PAD = "px-2 py-2 sm:px-3";

export const weekGrid = {
  /** The table itself. min-width tracks the sum of the label columns. */
  table: "w-full min-w-[676px] border-collapse text-sm sm:min-w-[760px]",
  headTask: `${TASK_COL} ${PAD} bg-background text-left font-medium`,
  headProject: `${PROJECT_COL} ${PAD} bg-background text-left font-medium`,
  cellTask: `${TASK_COL} ${PAD} bg-background group-hover/row:bg-muted/30`,
  cellProject: `${PROJECT_COL} ${PAD} bg-background group-hover/row:bg-muted/30`,
  /** The totals row spans both label columns, so it carries their combined width. */
  footLabel: `sticky left-0 z-sticky w-[196px] min-w-[196px] border-r border-border-strong bg-background ${PAD} text-muted-foreground sm:w-[280px] sm:min-w-[280px]`,
} as const;
