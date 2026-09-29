import { Hono } from "hono";
import { zValidator } from "../lib/validate";
import { CreateTaskSchema, UpdateTaskSchema } from "@timetracker/core/schemas";
import { broadcast, clientId } from "../db/queries";
import { createTask, deleteTask, listTasks, updateTask } from "../lib/tasks";

/**
 * Tell the workspace's other tabs to refetch their task lists. Without it a task
 * edited in one tab sat stale in every other until some unrelated entry change
 * happened to invalidate the list. No payload: every task view derives from the
 * one list query, so a refetch is simpler than merging a row.
 */
function announceTasksChanged(
  env: Env,
  ctx: { waitUntil(promise: Promise<unknown>): void },
  workspaceId: string,
  origin: string | null
) {
  ctx.waitUntil(broadcast(env, workspaceId, "tasks:changed", null, origin));
}

// Transport only: the invariants live in lib/tasks.ts, shared with MCP and
// the Assistant.
export const tasksRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  .get("/", async (c) => {
    const { projectId, includeInactive } = c.req.query();
    return c.json(
      await listTasks(c.env.DB, c.get("workspaceId"), {
        projectId: projectId || undefined,
        includeInactive: Boolean(includeInactive),
      })
    );
  })
  .post("/", zValidator("json", CreateTaskSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const result = await createTask(c.env.DB, workspaceId, c.req.valid("json"));
    if (!result.ok) return c.json({ error: result.error }, result.status);
    announceTasksChanged(c.env, c.executionCtx, workspaceId, clientId(c));
    return c.json(result.value, 201);
  })
  .put("/:id", zValidator("json", UpdateTaskSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const result = await updateTask(c.env.DB, workspaceId, c.req.param("id"), c.req.valid("json"));
    if (!result.ok) return c.json({ error: result.error }, result.status);
    announceTasksChanged(c.env, c.executionCtx, workspaceId, clientId(c));
    return c.json(result.value);
  })
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    await deleteTask(c.env.DB, workspaceId, c.req.param("id"));
    announceTasksChanged(c.env, c.executionCtx, workspaceId, clientId(c));
    return c.json({ ok: true });
  });
