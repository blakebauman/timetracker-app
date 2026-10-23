import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../lib/validate";
import { CreateDaysOffSchema, LocalDateSchema } from "@timetracker/core/schemas";
import { listDaysOff, weekdaysBetween } from "../lib/days-off";
import { broadcast, clientId } from "../db/queries";

const ListQuerySchema = z.object({
  from: LocalDateSchema,
  to: LocalDateSchema.optional(),
});

/** Tell the user's other tabs to refetch; the originating tab skips its own echo. */
function announce(
  env: Env,
  ctx: { waitUntil(promise: Promise<unknown>): void },
  workspaceId: string,
  origin: string | null
) {
  ctx.waitUntil(broadcast(env, workspaceId, "days_off:changed", null, origin));
}

// Per-user days off (workspace + user scoped). Dates are local days from the
// client; a range expands to its weekdays here so every reader sees one row
// per day and never has to reason about ranges.
export const daysOffRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/", zValidator("query", ListQuerySchema), async (c) => {
    const { from, to } = c.req.valid("query");
    return c.json(await listDaysOff(c.env.DB, c.get("workspaceId"), c.get("userId"), from, to));
  })
  .post("/", zValidator("json", CreateDaysOffSchema), async (c) => {
    const { from, to, portion, label } = c.req.valid("json");
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");

    // A single date is taken as given, even a Saturday — someone who works
    // weekends may well book one off. A range books only its weekdays.
    const dates = to && to !== from ? weekdaysBetween(from, to) : [from];
    if (dates.length === 0) {
      return c.json({ error: "That range has no weekdays in it" }, 400);
    }

    // Re-booking a day replaces its portion and label rather than stacking.
    const upsert = c.env.DB.prepare(
      `INSERT INTO days_off (id, workspace_id, user_id, date, portion, label)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (workspace_id, user_id, date)
       DO UPDATE SET portion = excluded.portion, label = excluded.label`
    );
    await c.env.DB.batch(
      dates.map((date) => upsert.bind(crypto.randomUUID(), workspaceId, userId, date, portion, label))
    );

    announce(c.env, c.executionCtx, workspaceId, clientId(c));
    return c.json(
      await listDaysOff(c.env.DB, workspaceId, userId, dates[0], dates[dates.length - 1]),
      201
    );
  })
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    const res = await c.env.DB.prepare(
      `DELETE FROM days_off WHERE id = ? AND workspace_id = ? AND user_id = ?`
    )
      .bind(c.req.param("id"), workspaceId, c.get("userId"))
      .run();
    if (!res.meta.changes) return c.json({ error: "Not found" }, 404);
    announce(c.env, c.executionCtx, workspaceId, clientId(c));
    return c.body(null, 204);
  });
