import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateApiKeySchema } from "@shared/schemas";
import { createApiKey, listApiKeys, revokeApiKey } from "../lib/api-keys";

/**
 * Managing the workspace's API keys — always from a real browser session, never
 * from a key. A credential that can mint further credentials turns one leaked
 * key into permanent access, so this router is deliberately unreachable from
 * the /mcp path.
 */
export const apiKeysRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/", async (c) => {
    return c.json(await listApiKeys(c.env.DB, c.get("workspaceId")));
  })
  .post("/", zValidator("json", CreateApiKeySchema), async (c) => {
    const { name, scope } = c.req.valid("json");
    const { record, plaintext } = await createApiKey(
      c.env.DB,
      c.get("workspaceId"),
      c.get("userId"),
      name,
      scope
    );
    // The only time the secret is ever returned.
    return c.json({ key: record, plaintext }, 201);
  })
  .delete("/:id", async (c) => {
    const revoked = await revokeApiKey(c.env.DB, c.get("workspaceId"), c.req.param("id"));
    if (!revoked) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });
