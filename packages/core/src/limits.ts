// Numeric limits shared by the worker and the client. Kept out of schemas.ts on
// purpose: that module builds zod schemas at the top level, so importing a
// single number from it put all of zod and every schema into the client's
// first load.

// Max rows `GET /time_entries` returns (newest first). Shared so the list view
// can tell the user when a wide range like "All dates" has been truncated
// rather than silently dropping the oldest entries.
export const ENTRY_LIST_LIMIT = 500;

// D1 allows 100 bound parameters per statement. A bulk `WHERE id IN (…)`
// spends one per id plus a few for the workspace and patch values, so 90 is
// the ceiling a single statement can honour; the client chunks larger
// selections (lib/api.ts) rather than the server silently truncating them.
export const BULK_ENTRY_IDS_MAX = 90;
