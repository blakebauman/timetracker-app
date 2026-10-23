import { Hono } from "hono";
import { zValidator } from "../lib/validate";
import { CloseWeekSchema, WeekReviewQuerySchema } from "@timetracker/core/schemas";
import { buildWeekReview, closeWeek } from "../lib/week-review";

// Closing a week (per user): the review of a local week, closing it (a
// snapshot of its hours), and reopening it. Transport only — the rules are in
// lib/week-review.ts.
export const weekReviewRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/", zValidator("query", WeekReviewQuerySchema), async (c) => {
    const { weekStart, timezoneOffsetMinutes } = c.req.valid("query");
    return c.json(
      await buildWeekReview(c.env, c.get("workspaceId"), c.get("userId"), weekStart, timezoneOffsetMinutes)
    );
  })
  .post("/close", zValidator("json", CloseWeekSchema), async (c) => {
    const { weekStart, timezoneOffsetMinutes } = c.req.valid("json");
    return c.json(
      await closeWeek(c.env, c.get("workspaceId"), c.get("userId"), weekStart, timezoneOffsetMinutes)
    );
  })
  .delete("/close", zValidator("query", WeekReviewQuerySchema), async (c) => {
    const { weekStart } = c.req.valid("query");
    await c.env.DB.prepare(
      `DELETE FROM week_closures WHERE workspace_id = ? AND user_id = ? AND week_start = ?`
    )
      .bind(c.get("workspaceId"), c.get("userId"), weekStart)
      .run();
    return c.body(null, 204);
  });
