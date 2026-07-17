# Product

## Register

product

## Users

Professional consultants, freelancers, and knowledge workers who track billable and non-billable time across multiple clients, projects, and tasks throughout the day, then report those hours back on a regular cadence. Users are mid-task when they open this: starting or stopping a timer, correcting yesterday's log, or pulling a report before a status update. They expect the tool to be fast, always-available (works offline, syncs across tabs/devices in real time), and to disappear into the workflow rather than demand attention.

## Product Purpose

A full-stack time tracker (Toggl-like) running entirely on Cloudflare's edge: timer + manual entry, a FullCalendar-based week/day/month grid, per-client/project/task organization, tag-based categorization, billing rate + currency-aware reporting (summary/weekly/detailed, CSV/Excel/PDF export, AI-drafted summaries), a browser extension for one-click starts from other tools, and real-time sync across tabs via a Durable Object. Success looks like: a user never loses track of billable time because logging it was friction, and reporting it back to a client or manager takes minutes, not an afternoon.

## Brand Personality

Precise, calm, unobtrusive. The product earns trust through restraint, not flourish — accurate numbers, instant feedback, and a UI that gets out of the way of the work. Soft, muted surfaces (not stark black-and-white, not AI-cream) let the meaningful color — the brand red for primary actions and running-timer state, project/tag swatches for at-a-glance scanning — carry the visual weight instead of decoration. Icon-only actions in dense toolbars (Reports, Timer header) over icon+label pairs, reserving text labels for controls that convey current state (date range, rounding mode). The one deliberate warmer exception: the auth pages (login/signup) carry a playful, human voice in copy — the app itself stays quietly professional.

## Anti-references

- **Generic SaaS-cream dashboards** — cream/sand near-white bodies, gradient-text hero metrics, tiny uppercase tracked eyebrows above every section, identical stat-card grids with orphaned cells. This is the default AI-dashboard look and it's explicitly rejected; soft tones are achieved via a warm-neutral ramp nudged toward the brand's own red hue, not a generic cream token.
- **Enterprise-bloat density** (Jira/ServiceNow-style) — overloaded toolbars, nested cards, config-everything settings screens with 40 visible fields. Progressive disclosure matters: reveal what's needed for the task, not everything the system supports.
- Not a Toggl visual clone. Feature parity (calendar view, favorites, auto-track) is a deliberate gap-closing strategy, not a mandate to look identical — this product has its own soft-tone, red-accent identity.

## Design Principles

1. **Restraint carries the design; color carries meaning.** A single saturated accent (brand red) plus purposeful project/tag colors read clearly against a calm, softened neutral ground — color is never decorative.
2. **The tool disappears into the task.** Standard, familiar affordances (top bar + side nav, command palette, tabs) over invented interaction patterns. Users fluent in Linear/Notion/Toggl should feel at home immediately.
3. **State is always visible, never lost.** Optimistic UI (timer stop, entry edits) so numbers don't visibly regress during a network round-trip; real-time WebSocket sync across tabs; offline queueing so a bad connection never drops a logged minute.
4. **Every empty and gap state teaches.** Charts, breakdowns, and calendars show a clear "why is this blank + what to do" state rather than a blank axis — including newly recognized opportunities (untracked-gap fill on the calendar).
5. **Density is earned, not decorated.** Dense data (entry lists, detailed reports, many-project workspaces) is welcome, but every dense surface still resolves cleanly at narrow widths — legend items wrap instead of overflowing, stat strips reflow without orphaned cells.

## Accessibility & Inclusion

Standard WCAG AA: ≥4.5:1 body text contrast (verified against the soft-tone ramp, not just the shadcn defaults), visible keyboard focus states, full keyboard navigation. Motion respects `prefers-reduced-motion` throughout, including the productivity features (idle-detection prompts, pomodoro/reminder notifications) added this session.
