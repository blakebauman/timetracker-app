# MCP connector

Connect Claude, ChatGPT, or any other MCP client to a workspace and ask about
your time in plain language — then act on it.

> *"Which clients were most profitable per hour last quarter?"*
> *"Is the Meridian project going to blow its budget?"*
> *"What did I actually work on last Thursday?"*
> *"Start a timer on the Acme redesign."*

The server speaks **Streamable HTTP** at `https://timetracker.run/mcp` and
authenticates with a workspace **API key**. It is stateless — no session, no
Durable Object — so a client can reconnect at any time without losing anything.

---

## 1. Create an API key

**Settings → Workspace → MCP connector → Create key.**

| Scope | What the assistant can do |
|---|---|
| **Read only** | Projects, clients, entries, summaries, budgets, the running timer, drafts |
| **Read + write** | All of the above, plus start/stop timers, log entries, and draft a day |

The key is shown **once** and cannot be recovered — only its SHA-256 is stored.
If you lose it, revoke it and make another. Revocation takes effect on the very
next request.

Prefer **read only** unless you actually want the assistant writing to your
timesheet. You can hold several keys at once (one per client), which makes it
easy to revoke just the one that leaked.

## 2. Connect a client

### Claude Code

One command — it speaks HTTP with a bearer header natively:

```bash
claude mcp add --transport http timetracker https://timetracker.run/mcp \
  --header "Authorization: Bearer tt_live_…"
```

### Claude Desktop

Claude Desktop's built-in custom-connector flow expects OAuth, which this server
does not implement, so bridge it with `mcp-remote`. Edit
`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "timetracker": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://timetracker.run/mcp",
               "--header", "Authorization:${TT_AUTH}"],
      "env": { "TT_AUTH": "Bearer tt_live_…" }
    }
  }
}
```

Two details that are easy to get wrong and both fail confusingly:

- **No space after `Authorization:`.** Claude Desktop splits arguments on
  whitespace, which would sever the header from its value. The `${TT_AUTH}`
  indirection is what keeps the value in one piece.
- **The key goes in `env`, not `args`.** Anything that can run `ps` can read a
  process's argv.

Then **quit Claude Desktop completely (⌘Q) and reopen it** — the config is read
at launch, and `serverInfo` is cached from the connection made then. A running
instance will not pick up a new key, or a new server name, until it reconnects.

### ChatGPT and other clients

Anything that supports **remote MCP over Streamable HTTP with a custom header**
works. Point it at `https://timetracker.run/mcp` and send:

```
Authorization: Bearer tt_live_…
```

There is no OAuth flow. A client that only offers OAuth (rather than a header or
a bearer token field) needs `mcp-remote` in front of it, as above.

## 3. Check it works

```bash
KEY=tt_live_…
curl -s -X POST https://timetracker.run/mcp \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2025-06-18","capabilities":{},
        "clientInfo":{"name":"curl","version":"1"}}}'
```

A healthy server answers with an SSE frame containing:

```json
{"serverInfo":{"name":"timetracker","title":"TimeTracker","version":"1.1.0",
               "websiteUrl":"https://timetracker.run","icons":[…]}}
```

Swap `"method":"tools/list"` (and drop `params`) to see the tools your key can
reach — 7 on a read key, 11 on read+write.

---

## Tools

| Tool | Scope | Notes |
|---|---|---|
| `list_projects` | read | Ids, client, billable default, rate, budget, tracked total |
| `list_clients` | read | With project counts |
| `get_time_summary` | read | Totals over a range, grouped by project/client/task/tag |
| `list_time_entries` | read | Individual entries, optional description search |
| `get_project_pacing` | read | Budget spent, burn rate, projected overrun |
| `get_running_timer` | read | What's running now, and for how long |
| `list_drafts` | read | Proposals awaiting review, with why each was proposed |
| `start_timer` | read+write | Stops any running timer first, as the app does |
| `stop_timer` | read+write | Idempotent — a second call is a no-op |
| `log_time` | read+write | A completed entry; **not** idempotent by design |
| `draft_day` | read+write | Proposes a day's missing entries; idempotent |

Each tool declares `readOnlyHint` / `destructiveHint` / `idempotentHint` /
`openWorldHint`, so a client can badge them and stop prompting for harmless
reads. `openWorldHint` is `false` throughout: every tool touches this one
workspace's own database and nothing on the open internet.

Write tools are **registered only for a read+write key**. A read-only key isn't
shown them at all, rather than being refused when it calls one.

## What the model is told

The server sends `instructions` on connect, which clients prepend to the model's
context. They cover the things a tool schema can't say:

- **Pass `timezoneOffsetMinutes`.** Date ranges are the *user's* local days. If a
  client omits it, the range silently means UTC days — which, west of UTC,
  quietly includes the previous evening and drops part of the user's own day.
  This is advisory: if a "yesterday" answer looks shifted by a few hours, this is
  the first thing to suspect.
- Look project ids up with `list_projects` rather than guessing them.
- `get_time_summary` for "how much", `list_time_entries` for "what".
- A project with no rate contributes 0 to any amount — that's "no rate set",
  never "earned nothing".
- Drafted entries are **proposals, not tracked time**. They appear in no report
  and no total until a person confirms them in the app; `draft_day` creates them,
  it does not log time.

## Troubleshooting

**`401` on every request.** The key is wrong, revoked, or the header is
malformed. The response includes `WWW-Authenticate: Bearer realm="timetracker"`.
Note the server deliberately rejects a Better Auth *session* token here — only
`tt_live_…` keys are accepted, so a caller who thinks they're presenting an API
key is told when they aren't.

**Claude Desktop shows the connector but no tools**, or fails at launch with
`Cannot find module './lib/dispatcher/client'`. That's a corrupt `undici` in the
npx cache, not this server. Clear the offending entry and relaunch:

```bash
rm -rf ~/.npm/_npx/*    # or just the hashed dir named in the error
```

**The connector still shows an old name or icon.** `serverInfo` is cached from
the connection made at launch. Quit the client fully and reopen.

**Answers are a few hours out on "yesterday" / "last week".** The client is
probably not passing `timezoneOffsetMinutes`. See above.

**A tool the docs list isn't there.** You're on a read-only key; the four write
tools are only registered for read+write.

## Security model

- Only the **SHA-256** of a key is stored. The plaintext is returned once, at
  creation, and is unrecoverable — a key list that could reveal its own secrets
  would be one database read from a breach.
- **Workspace membership is re-verified on every call**, not just at creation. A
  key outlives the browser session that minted it, so "the person who made this
  was removed from the workspace six months ago" is the case that matters.
- **No tool takes a workspace id.** It is fixed at construction from the resolved
  key, so nothing a model can invent reaches a tenant boundary.
- **Key management is session-only** and unreachable from `/mcp`. A credential
  that could mint further credentials would turn one leaked key into permanent
  access.
- Revocation is immediate — the next request 401s.

## Implementation map

| Concern | Where |
|---|---|
| Tool definitions, `serverInfo`, `instructions` | `src/worker/mcp/server.ts` |
| Key creation, hashing, resolution | `src/worker/lib/api-keys.ts` |
| Key management API (session-only) | `src/worker/routes/api-keys.ts` |
| `/mcp` request gate | `handleMcpRequest` in `src/worker/index.ts` |
| Settings card | `src/react-app/components/settings/McpConnectorCard.tsx` |
| Tests | `e2e/mcp.spec.ts` |

Transport is `agents/mcp`'s `createMcpHandler` — Streamable HTTP, stateless. A
fresh `McpServer` is built per request, bound to the workspace the key resolved
to. See `docs/ARCHITECTURE.md` for how it sits in the request lifecycle.
