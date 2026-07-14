import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { UpdateSettingsSchema } from "@shared/schemas";

// Per-user display settings (currency, time format). Stored on the better-auth
// `user` row so they persist server-side and follow the person across devices
// and localStorage wipes. Written with raw SQL so better-auth's schema is untouched.
export const settingsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/", async (c) => {
    const userId = c.get("userId");
    const row = await c.env.DB.prepare(
      `SELECT currency, time_format FROM "user" WHERE id = ?`
    )
      .bind(userId)
      .first<{ currency: string; time_format: string }>();

    return c.json({
      currency: row?.currency ?? "USD",
      timeFormat: (row?.time_format as "24h" | "12h") ?? "24h",
    });
  })
  .patch("/", zValidator("json", UpdateSettingsSchema), async (c) => {
    const userId = c.get("userId");
    const { currency, timeFormat } = c.req.valid("json");

    const sets: string[] = [];
    const bindings: unknown[] = [];
    if (currency !== undefined) {
      sets.push("currency = ?");
      bindings.push(currency);
    }
    if (timeFormat !== undefined) {
      sets.push("time_format = ?");
      bindings.push(timeFormat);
    }

    if (sets.length > 0) {
      bindings.push(userId);
      await c.env.DB.prepare(
        `UPDATE "user" SET ${sets.join(", ")} WHERE id = ?`
      )
        .bind(...bindings)
        .run();
    }

    const row = await c.env.DB.prepare(
      `SELECT currency, time_format FROM "user" WHERE id = ?`
    )
      .bind(userId)
      .first<{ currency: string; time_format: string }>();

    return c.json({
      currency: row?.currency ?? "USD",
      timeFormat: (row?.time_format as "24h" | "12h") ?? "24h",
    });
  });
