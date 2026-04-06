import { cors } from "hono/cors";

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return "*";
    if (
      origin.startsWith("http://localhost") ||
      origin.startsWith("https://localhost") ||
      origin.endsWith(".workers.dev") ||
      origin === "https://timetracker.blakebauman.dev" ||
      origin.startsWith("chrome-extension://")
    ) {
      return origin;
    }
    return null;
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
});
