import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { signUp } from "./auth";

// saved_reports and assistant_memory carried workspace_id with no foreign
// key until migration 0034, so deleting a workspace left their rows behind
// forever. The dev server and this suite share the local D1 file, so the
// schema and the cascade are checked directly in SQLite.
const webDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

function sql<T = Record<string, unknown>>(command: string): T[] {
  const out = execSync(
    `pnpm exec wrangler d1 execute time-tracker --local --json --command ${JSON.stringify(command)}`,
    { cwd: webDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  return (JSON.parse(out) as Array<{ results: T[] }>)[0].results;
}

test.describe("tenant rows follow their workspace", () => {
  test("the schema carries the cascading foreign keys", () => {
    const fks = sql<{ table: string; from: string; on_delete: string }>("PRAGMA foreign_key_list(saved_reports)");
    expect(fks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "workspaces", from: "workspace_id", on_delete: "CASCADE" }),
        expect.objectContaining({ table: "user", from: "user_id", on_delete: "CASCADE" }),
      ]),
    );
    const memFks = sql<{ table: string; on_delete: string }>("PRAGMA foreign_key_list(assistant_memory)");
    expect(memFks).toEqual([expect.objectContaining({ table: "workspaces", on_delete: "CASCADE" })]);

    const names = sql<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE name IN ('twoFactor', 'idx_member_org_user') ORDER BY name",
    ).map((r) => r.name);
    expect(names).toEqual(["idx_member_org_user"]);
  });

  test("deleting a workspace removes its saved reports", async ({ page }) => {
    await signUp(page);
    const origin = new URL(page.url()).origin;

    const orgs = (await (await page.request.get("/api/auth/organization/list", { headers: { origin } })).json()) as Array<{ id: string }>;
    expect(orgs.length).toBe(1);
    const workspaceId = orgs[0].id;

    const created = await page.request.post("/api/saved-reports", {
      headers: { origin },
      data: { name: "Cascade SENTINEL", config: { range: "week" } },
    });
    expect(created.status()).toBe(201);
    expect(sql(`SELECT count(*) AS n FROM saved_reports WHERE workspace_id = '${workspaceId}'`)[0].n).toBe(1);

    const deleted = await page.request.post("/api/auth/organization/delete", {
      headers: { origin },
      data: { organizationId: workspaceId },
    });
    expect(deleted.ok()).toBeTruthy();

    expect(sql(`SELECT count(*) AS n FROM workspaces WHERE id = '${workspaceId}'`)[0].n).toBe(0);
    expect(sql(`SELECT count(*) AS n FROM saved_reports WHERE workspace_id = '${workspaceId}'`)[0].n).toBe(0);
  });
});
