import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { UpdateSettingsSchema } from "@shared/schemas";

type Row = {
  currency: string;
  time_format: string;
  round_mode: string;
  round_minutes: number;
  week_start: number;
  show_weekends: number;
};

function toSettings(row: Row | null) {
  return {
    currency: row?.currency ?? "USD",
    timeFormat: (row?.time_format as "24h" | "12h") ?? "24h",
    roundMode: (row?.round_mode as "off" | "nearest" | "up" | "down") ?? "off",
    roundMinutes: row?.round_minutes ?? 15,
    weekStart: row?.week_start ?? 1,
    showWeekends: row?.show_weekends === undefined ? true : Boolean(row.show_weekends),
  };
}

const SELECT = `SELECT currency, time_format, round_mode, round_minutes, week_start, show_weekends FROM "user" WHERE id = ?`;

// Per-user display settings (currency, time format, report rounding). Stored on
// the better-auth `user` row so they persist server-side and follow the person
// across devices and localStorage wipes. Raw SQL keeps better-auth's schema untouched.
export const settingsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/", async (c) => {
    const userId = c.get("userId");
    const row = await c.env.DB.prepare(SELECT).bind(userId).first<Row>();
    return c.json(toSettings(row));
  })
  .patch("/", zValidator("json", UpdateSettingsSchema), async (c) => {
    const userId = c.get("userId");
    const { currency, timeFormat, roundMode, roundMinutes, weekStart, showWeekends } =
      c.req.valid("json");

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
    if (roundMode !== undefined) {
      sets.push("round_mode = ?");
      bindings.push(roundMode);
    }
    if (roundMinutes !== undefined) {
      sets.push("round_minutes = ?");
      bindings.push(roundMinutes);
    }
    if (weekStart !== undefined) {
      sets.push("week_start = ?");
      bindings.push(weekStart);
    }
    if (showWeekends !== undefined) {
      sets.push("show_weekends = ?");
      bindings.push(showWeekends ? 1 : 0);
    }

    if (sets.length > 0) {
      bindings.push(userId);
      await c.env.DB.prepare(`UPDATE "user" SET ${sets.join(", ")} WHERE id = ?`)
        .bind(...bindings)
        .run();
    }

    const row = await c.env.DB.prepare(SELECT).bind(userId).first<Row>();
    return c.json(toSettings(row));
  });
