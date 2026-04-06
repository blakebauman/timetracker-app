// Extend the global Env interface with non-binding secrets
// Values come from .dev.vars (local) or `wrangler secret put` (production)
interface Env {
  AUTH_SECRET: string;
}
