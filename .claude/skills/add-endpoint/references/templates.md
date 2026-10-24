# Endpoint templates

Shapes only. Copy the conventions, not the names. The live reference is
`apps/web/src/worker/routes/days-off.ts` + `apps/web/src/react-app/hooks/useDaysOff.ts`.

## Router — `apps/web/src/worker/routes/widgets.ts`

```ts
import { Hono } from "hono";
import { zValidator } from "../lib/validate";
import { CreateWidgetSchema } from "@timetracker/core/schemas";
import { broadcast, clientId } from "../db/queries";

export const widgetsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, created_at FROM widgets WHERE workspace_id = ? ORDER BY created_at DESC`
    )
      .bind(c.get("workspaceId"))
      .all();
    return c.json(results);
  })
  .post("/", zValidator("json", CreateWidgetSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { name, projectId } = c.req.valid("json");

    // Ids from the body are untrusted: prove they belong to this workspace.
    if (projectId) {
      const owned = await c.env.DB.prepare(`SELECT 1 FROM projects WHERE id = ? AND workspace_id = ?`)
        .bind(projectId, workspaceId)
        .first();
      if (!owned) return c.json({ error: "Project not found" }, 404);
    }

    const id = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO widgets (id, workspace_id, name, project_id) VALUES (?, ?, ?, ?)`)
      .bind(id, workspaceId, name, projectId ?? null)
      .run();

    c.executionCtx.waitUntil(broadcast(c.env, workspaceId, "widgets:changed", null, clientId(c)));
    return c.json({ id, name }, 201);
  });
```

Mount it in `apps/web/src/worker/index.ts`:

```ts
  .route("/api/widgets", widgetsRouter)
```

and, only if it calls AI, email or outbound HTTP:

```ts
  .use("/api/widgets/*", aiRateLimit) // or outboundRateLimit, per index.ts
```

## Client — `lib/api.ts`

```ts
  widgets: {
    list: () => request<Widget[]>("/widgets"),
    create: (body: CreateWidget) =>
      request<Widget>("/widgets", { method: "POST", body: JSON.stringify(body) }),
  },
```

## Hook — `hooks/useWidgets.ts`

```ts
export function useWidgets() {
  return useQuery({ queryKey: ["widgets"], queryFn: () => api.widgets.list() });
}

export function useCreateWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWidget) => api.widgets.create(body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["widgets"] }),
    onError: (err) =>
      isQueuedOffline(err)
        ? toast.info("Offline — it will be saved when you reconnect")
        : toast.error(mutationErrorMessage(err, "Couldn't save the widget")),
  });
}
```

## Tenant-isolation spec sketch

```ts
test("another workspace cannot read or write widgets", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await signUp(a);
  await signUp(b);
  const origin = new URL(a.url()).origin;
  const created = await a.request.post("/api/widgets", { headers: { origin }, data: { name: "A's" } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const listB = await b.request.get("/api/widgets");
  expect(await listB.json()).toEqual([]);
});
```
