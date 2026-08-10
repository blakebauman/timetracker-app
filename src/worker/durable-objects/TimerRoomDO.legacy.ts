import { DurableObject } from "cloudflare:workers";

/**
 * Tombstone for the legacy key-value-backed timer room. Temporary — deleted by
 * the v4 migration, in the deploy right after the one that introduces this file.
 *
 * It exists because moving the timer room to the SQLite backend is pinned
 * between two API checks that cannot both be satisfied in a single deploy:
 *
 *   10061 — "Cannot apply --delete-class migration to class 'TimerRoomDO'
 *            without also removing the binding that references it."
 *            The delete is validated against the bindings of the *currently
 *            deployed* script, so the binding must already point elsewhere in a
 *            live deploy before the delete is allowed.
 *
 *   10064 — "New version of script does not export class 'TimerRoomDO' which is
 *            depended on by existing Durable Objects."
 *            A script may not simply stop exporting a class whose namespace
 *            still exists.
 *
 * Together: the binding has to move away *before* the delete, but the class has
 * to stay exported *until* the delete. So one deploy ships this stub with the
 * binding already repointed at `TimerRoom` (v3), and the next deletes the
 * namespace and this file (v4).
 *
 * Nothing routes here — the binding moved — so the handler only has to exist.
 */
export class TimerRoomDO extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    return new Response("Gone — this room moved to the TimerRoom class.", {
      status: 410,
    });
  }
}
