import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { UpdateSettingsSchema } from "@shared/schemas";
import { sendDigest, localDateAt } from "../lib/digest";

type Row = {
  currency: string;
  time_format: string;
  round_mode: string;
  round_minutes: number;
  week_start: number;
  show_weekends: number;
  auto_assign_colors: number;
  digest_daily: number;
  digest_weekly: number;
  digest_hour: number;
  digest_tz_offset: number;
};

function toSettings(row: Row | null) {
  return {
    currency: row?.currency ?? "USD",
    timeFormat: (row?.time_format as "24h" | "12h") ?? "24h",
    roundMode: (row?.round_mode as "off" | "nearest" | "up" | "down") ?? "off",
    roundMinutes: row?.round_minutes ?? 15,
    weekStart: row?.week_start ?? 1,
    showWeekends: row?.show_weekends === undefined ? true : Boolean(row.show_weekends),
    autoAssignColors: Boolean(row?.auto_assign_colors),
    digestDaily: Boolean(row?.digest_daily),
    digestWeekly: Boolean(row?.digest_weekly),
    digestHour: row?.digest_hour ?? 8,
    digestTimezoneOffsetMinutes: row?.digest_tz_offset ?? 0,
  };
}

const SELECT = `SELECT currency, time_format, round_mode, round_minutes, week_start,
                       show_weekends, auto_assign_colors, digest_daily, digest_weekly,
                       digest_hour, digest_tz_offset
                FROM "user" WHERE id = ?`;

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
    const {
      currency,
      timeFormat,
      roundMode,
      roundMinutes,
      weekStart,
      showWeekends,
      autoAssignColors,
      digestDaily,
      digestWeekly,
      digestHour,
      digestTimezoneOffsetMinutes,
    } = c.req.valid("json");

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
    if (autoAssignColors !== undefined) {
      sets.push("auto_assign_colors = ?");
      bindings.push(autoAssignColors ? 1 : 0);
    }
    if (digestDaily !== undefined) {
      sets.push("digest_daily = ?");
      bindings.push(digestDaily ? 1 : 0);
    }
    if (digestWeekly !== undefined) {
      sets.push("digest_weekly = ?");
      bindings.push(digestWeekly ? 1 : 0);
    }
    if (digestHour !== undefined) {
      sets.push("digest_hour = ?");
      bindings.push(digestHour);
    }
    if (digestTimezoneOffsetMinutes !== undefined) {
      sets.push("digest_tz_offset = ?");
      bindings.push(digestTimezoneOffsetMinutes);
    }

    if (sets.length > 0) {
      bindings.push(userId);
      await c.env.DB.prepare(`UPDATE "user" SET ${sets.join(", ")} WHERE id = ?`)
        .bind(...bindings)
        .run();
    }

    const row = await c.env.DB.prepare(SELECT).bind(userId).first<Row>();
    return c.json(toSettings(row));
  })
  /**
   * Send one digest immediately, to the signed-in user's own address.
   *
   * Exists because a scheduled email you have never seen is impossible to
   * judge: nobody can decide whether they want a 7am briefing without reading
   * one. Covers the same period the scheduled send would.
   */
  .post(
    "/digest/send",
    zValidator(
      "json",
      z.object({
        kind: z.enum(["daily", "weekly"]).default("daily"),
        /**
         * The caller's own UTC offset. Sent by the client because this is the
         * one moment we can learn it for certain — and without it "yesterday"
         * is computed in UTC, which for a user west of UTC reports *today's*
         * hours under a "Yesterday" heading.
         */
        timezoneOffsetMinutes: z.number().int().min(-900).max(900).optional(),
      })
    ),
    async (c) => {
      const userId = c.get("userId");
      const workspaceId = c.get("workspaceId");
      const { kind, timezoneOffsetMinutes } = c.req.valid("json");

      const row = await c.env.DB.prepare(
        `SELECT email, name, digest_tz_offset FROM "user" WHERE id = ?`
      )
        .bind(userId)
        .first<{ email: string; name: string | null; digest_tz_offset: number }>();
      if (!row?.email) return c.json({ error: "No email address on file" }, 400);

      // Prefer what the client just told us over what we last stored, and
      // persist it: a preview is often the first time a user touches digests at
      // all, so it is also the first chance to learn which timezone their "8am"
      // means before anything is ever scheduled.
      const offset = timezoneOffsetMinutes ?? row.digest_tz_offset;
      if (timezoneOffsetMinutes !== undefined && timezoneOffsetMinutes !== row.digest_tz_offset) {
        await c.env.DB.prepare(`UPDATE "user" SET digest_tz_offset = ? WHERE id = ?`)
          .bind(timezoneOffsetMinutes, userId)
          .run();
      }

      // The same period the scheduled send covers: yesterday, in the user's
      // own local reckoning.
      const yesterday = localDateAt(Date.now() - 86_400_000, offset);

      try {
        const content = await sendDigest(
          c.env,
          {
            id: userId,
            email: row.email,
            name: row.name,
            workspaceId,
            timezoneOffsetMinutes: offset,
          },
          kind,
          yesterday
        );
        return c.json({ sent: true, subject: content.subject });
      } catch (e) {
        console.error("digest: manual send failed", { userId, error: String(e) });
        return c.json({ error: "Couldn't send the email — check the address is verified" }, 502);
      }
    }
  );
