import { betterAuth } from "better-auth";

export function createAuth(env: Env) {
  return betterAuth({
    // D1 is auto-detected via its batch/exec/prepare interface
    database: env.DB as unknown as Parameters<typeof betterAuth>[0]["database"],
    secret: env.AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Auto-create a workspace for every new user
            const id = crypto.randomUUID().replace(/-/g, "");
            await env.DB.prepare(
              `INSERT INTO workspaces (id, name, userId) VALUES (?, ?, ?)`
            )
              .bind(id, `${user.name}'s Workspace`, user.id)
              .run();
          },
        },
      },
    },
    // Trust requests from these origins (needed for cookie auth in same-origin SPA)
    trustedOrigins: [
      "http://localhost:5173",
      "http://localhost:8787",
      "https://timetracker.blakebauman.dev",
      "https://time-tracker-app.fold-run.workers.dev",
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
