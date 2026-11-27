# Pitch In

Find a drop-in volunteering event near you. Pitch In and help out your community!

**Status:** work in progress. See [the v1 plan](docs/PLAN.md) and the [decision log](docs/decisions.md).

## Product roadmap

### Overview

1. **South Australia calendar:** a calendar of all drop-in volunteering events in SA, at [pitchin.au](https://pitchin.au).
2. **Autonomous updates:** the calendar keeps itself up to date.
3. **Australia-wide:** support for the other states and territories.

### Keeping the code reusable

Pitch In is about volunteering, but the code shouldn't be tied to that. The aim is that the same code can power other calendars, such as a separate site for free exercise and group activities, or a site for other community events, and that these could stay separate or be merged later. Avoid hardcoding volunteering-specific assumptions where a general event concept would do. See [ideas](docs/ideas.md).

### Stack for stage 1

- **Frontend:** Vite, React and TypeScript, as a static single-page app that loads `events.json` at runtime.
- **Data:** a curated source file of event series (RRULEs and explicit dates), expanded into `events.json` by a TypeScript generator using `zod` and `rrule`, tested with Vitest.
- **Repo:** a pnpm workspaces monorepo, with ESLint and Prettier.
- **Hosting:** AWS: a private S3 bucket behind CloudFront, with ACM for TLS and Route 53 for DNS, in a dedicated account under AWS Organizations.
- **Infrastructure as code:** Terraform, with state in S3.
- **CI/CD:** GitHub Actions, deploying to AWS with OIDC (no long-lived keys).

### Proposed stack for later stages

- **Scheduled regeneration:** GitHub Actions regenerates `events.json` daily, with an alarm if the data goes stale.
- **AI agents:** Claude-based agents re-check official sources and update events, discover new series, and fill in series that don't yet have dates. Changes go through review before they're published.
- **Staging:** a separate AWS account and Terraform environment.
- **Observability:** CloudFront logs and uptime alarms.
- **National expansion:** timezone-aware event generation, plus prerendering (for example Astro) for SEO.

## Development

### Getting started

You need Node 26 (see `.nvmrc`) and pnpm, which [Corepack](https://nodejs.org/api/corepack.html) can provide from the `packageManager` field.

```bash
pnpm install
pnpm --filter web dev
```

### Scripts

Run from the repo root:

| Script           | What it does                                            |
| ---------------- | ------------------------------------------------------- |
| `pnpm lint`      | ESLint, then a Prettier format check                    |
| `pnpm format`    | Format everything with Prettier                         |
| `pnpm typecheck` | Type-check every package                                |
| `pnpm test`      | Run every package's tests (Vitest)                      |
| `pnpm build`     | Build the web app into `apps/web/dist`                  |
| `pnpm generate`  | Expand the source data into `events.json` (from step 8) |

### Layout

- `apps/web`: the Vite + React + TypeScript site
- `packages/events`: schemas, types and the event generator
- `data/`: source event series and generated output
- `docs/`: plan and decisions

## Licence

[MIT](LICENSE)
