import type { Context } from "hono";
import { createAuth } from "../auth";

type App = { Bindings: Env };

// The extension can't read Set-Cookie from a cross-origin response, so it
// calls this instead of /api/auth/sign-in/email and reads the token straight
// out of the JSON body (better-auth's signInEmail already includes it).
export async function extSignIn(c: Context<App>) {
  const body = await c.req.json<{ email?: string; password?: string }>();
  if (!body.email || !body.password) {
    return c.json({ message: "Email and password are required" }, 400);
  }

  const origin = new URL(c.req.url).origin;
  const auth = createAuth(c.env, origin);

  try {
    const result = await auth.api.signInEmail({
      body: { email: body.email, password: body.password },
      headers: c.req.raw.headers,
    });
    return c.json({ user: result.user, token: result.token });
  } catch {
    return c.json({ message: "Invalid email or password" }, 401);
  }
}
