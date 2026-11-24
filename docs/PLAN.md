# Pitch In: v1 plan

Pitch In (pitchin.au) is a discovery tool for drop-in volunteering in South Australia. It shows what's on and when, and sends people to the official source to confirm before they go.

## Stack (v1)

- **Repo:** public GitHub monorepo using pnpm workspaces
- **Frontend:** Vite + React + TypeScript. A static SPA that fetches `/events.json` at runtime. Filters live in the URL query string. There are no path routes.
- **Data:** a source dataset of event series, with RRULEs and explicit dates. A TypeScript generator expands it into `events.json`. The generator uses the `rrule` package and is tested with Vitest. It's run manually for now, in roughly 3-month increments.
- **Hosting:** a private S3 bucket behind CloudFront (OAC), with an ACM certificate in us-east-1. DNS is in Route 53. The domain is registered at Namecheap.
- **AWS account:** a dedicated member account for Pitch In, inside an AWS Organization, with Identity Center sign-in. Staging can get its own account later.
- **IaC:** Terraform. The site is built by hand first to learn it, then rebuilt from Terraform. The hosted zone is kept and imported. State lives in an S3 backend with native locking.
- **CI/CD:** GitHub Actions. CI runs from day one. Deploys use OIDC: build, sync to S3, invalidate only what needs it.

## Repo layout

```
pitchin/
├── apps/
│   └── web/                  # Vite + React + TS SPA
├── packages/
│   └── events/               # schemas (zod), types, generator, CLI. Used by web for types
├── data/
│   ├── working-bee-events-rrule.json   # source series (hand/bot curated)
│   └── generated/events.json            # generator output, committed
├── infra/
│   ├── bootstrap/            # Terraform state bucket (local state)
│   ├── modules/static-site/  # S3 + CloudFront + ACM + DNS records
│   └── envs/
│       └── prod/             # uses the module; staging/ added later
├── docs/
└── .github/workflows/
```

---

## What the source data looks like today

Notes from profiling `data/working-bee-events-rrule.json`. These shape steps 5–8.

- **311 series. Only 100 have `schedules`.** The other 211 produce no events, because they have no published or inferable dates. v1 shows about 100 series. The rest are a backlog for future discovery work.
- **Schedules come in several shapes:** `rrule` (103), `rdates` (18, explicit dates), `label` (36, for example "Open day" or "3rd Sunday"), `duration_days` (5, multi-day events), and some `start_time`/`end_time` set to `null`. 17 series have more than one schedule. That's why an occurrence ID can't simply be series + date (see step 7).
- **No RRULE has `DTSTART`, `UNTIL`, `COUNT` or `INTERVAL`.** Every RRULE is "every Nth weekday" or "weekly on X", so the generator can anchor them at the start of the window. Fortnightly events with no anchor date were left without a schedule, which is the right call.
- **`region` has 18 free-text values that don't match the planned filter list.** Of the 100 scheduled series, 40 are just "Adelaide metro", and the North/South/East/West split can only come from `location`. Many scheduled series are also in regions the planned list doesn't have, such as Fleurieu Peninsula (13). See step 6.
- **`category` has 242 free-text values** and `type` is `volunteering` or `exercise` (4). These need to map to `kinds[]`.
- **`application_required` has 171 free-text values**, but the scheduled series cluster cleanly into: register or contact first (56), not found (17), none (16), membership/form required (11).
- **`census_flags` is internal provenance.** A few records say things like "redirects to an unrelated site; do not link". These need a structured field so the site never links to them.

---

## Plan

### Phase 0 — Foundations

**1. ✅ Register domain**

**2. ✅ Create GitHub repo**

**3. Scaffold the monorepo**
- ✅ Pin Node in `.nvmrc` (Node 26 LTS) and add a `packageManager` field for pnpm.
- ✅ Add `pnpm-workspace.yaml` covering `apps/*` and `packages/*`.
- ✅ Create `apps/web` with `pnpm create vite apps/web --template react-ts`.
- Create `packages/events` (`"name": "@pitchin/events"`) with TypeScript, Vitest, and `zod` and `rrule` as dependencies.
- Shared root tooling: a `tsconfig.base.json`, ESLint (flat config), Prettier, and an `.editorconfig`.
- Root scripts: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm generate`.
- Add a README with a short project description and a link to this plan, and an MIT licence.
- **Done when:** `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` passes locally.

**4. CI workflow (no deploy yet)**
- `.github/workflows/ci.yml` runs on pull requests and on pushes to `main`. It does checkout, set up pnpm and Node with caching, `pnpm install --frozen-lockfile`, lint, typecheck, test and build.
- Turn on branch protection for `main` and require CI to pass. From here on, work goes through PRs.
- **Done when:** a PR shows a green CI check.

### Phase 1 — Data

**5. Source schema and validation**
- In `packages/events`, write a zod schema for the source file as it is today: series fields, and a `schedules[]` union of rrule, rdates, label, duration_days and nullable times.
- Add `pnpm validate:data`, which parses the source file and fails with readable errors. Run it in CI.
- **Done when:** the current file validates, or the schema exposes real problems, which we then fix in the data.

**6. Normalise the fields the filters depend on**
These move from "Future" into v1. Each new field gets added to the schema, then backfilled, then made required.
- **`regions: Region[]`** (an array). A series near a boundary can be in two regions, so it isn't excluded from either search. Region values are a fixed enum, and region *groups* such as "All Adelaide" and "All South Australia" are defined in code, not stored on events. See the open question on the region list below.
- **`kinds: Kind[]`** (an array). The enum is `bushland-parks | community | wildlife | heritage`. Mapped from `category` and `type`.
- **`registration`**, an enum: `none | required | membership | unknown`. The original free text is kept as `registration_note` for display.
- **`last_checked_at`** (ISO date) and **`last_checked_by`** (`bot | human`). Backfilled with the date of the bot run that produced the data (about 2026-11-19, to be confirmed) and `bot`.
- **`link_ok: boolean`**, or a structured `source_status`. Lets us suppress bad links that `census_flags` currently records as prose.
- **Method:** a one-off script proposes values, using Claude with `location`, `region` and `category` as input. It writes a review CSV, you check it by hand, and the approved values are written back to the source file. Use **snake_case** in the JSON to match the existing data, so `date_basis` and not `dateBasis`.
- **Done when:** every scheduled series has non-empty `regions` and `kinds` and a `registration` value, and validation enforces this.

**7. Decide on IDs** *(design decision, record it in `docs/decisions/`)*
- The series `id` already exists (`E001`, `E003a` and so on), is unique, and is stable as long as nobody renumbers it.
- An occurrence ID needs to tell apart several schedules on one date, such as a morning and an afternoon shift. Candidates:
  - `seriesId + date + start_time`
  - `seriesId + scheduleIndex + date`, which is fragile if schedules are reordered
  - give each schedule its own stable `schedule_id`, then use `seriesId + scheduleId + date`
- Choose one. The IDs only need to stay stable from the point where something external refers to them (feedback, cancellations, links). Until then, a reasonable default is enough.

**8. Generator**
- `pnpm generate --from 2026-11-21 --days 90` reads the source file, validates it, expands occurrences, and writes `data/generated/events.json`.
- Expansion rules:
  - `rrule`: expand within the window, anchored at the window start.
  - `rdates`: include the dates that fall in the window.
  - `duration_days`: show it as one occurrence spanning several days. Don't create one occurrence per day.
  - `null` times: keep them null, and the UI says "Time not listed".
  - `label`: pass it through. For example, "Open day" can display next to the event name.
- Each occurrence gets `date_basis: "explicit" | "recurrence"` (rdates are explicit, rrules are recurrence).
- Output shape: a top-level `{ generated_at, window: {from, to}, series: {...}, occurrences: [...] }`. Occurrences stay small (id, series_id, date, start, end, date_basis, label) and point to series details instead of repeating them in every row.
- Times are local South Australian wall-clock strings. Timezone handling is deferred, because everything is in SA.
- Vitest tests cover each rule shape: last weekday of month, `BYMONTH` exclusions, multiple schedules, rdates outside the window, duration_days and null times.
- **Done when:** tests pass and a generated file is committed and validated in CI against its output schema.

**9. Plain-text page (walking skeleton)**
- `apps/web` fetches `/events.json` and renders a plain list: date, time, name, organisation, region and a source link. No styling and no filters.
- Getting `events.json` into the site: a small prebuild script copies `data/generated/events.json` into `apps/web/public/`. The copy is gitignored.
- **Done when:** `pnpm --filter web dev` shows the list, and `pnpm build` produces `apps/web/dist` with `events.json` in it.

### Phase 2 — AWS, by hand (learn it)

**10. Isolate Pitch In in its own AWS account**
- In the existing account, enable **AWS Organizations**. The existing account becomes the management account.
- Create a member account, `pitchin-prod`. Later add `pitchin-staging`, which gives you staging without any changes here.
- Enable **IAM Identity Center** and create your user and a permission set (AdministratorAccess to start with). Assign it to `pitchin-prod`.
- Check that MFA is on for your root user, and turn it on for the Identity Center user.
- Locally, run `aws configure sso` to create a `pitchin-prod` profile, then `aws sso login --profile pitchin-prod`. Never use long-lived access keys.

**11. Billing alert**
- In `pitchin-prod`, create an AWS Budget (for example $5/month) with email alerts at 50%, 80% and 100% of forecast. Optionally add an org-wide budget in the management account.

**12. S3 bucket and manual upload**
- Create a bucket in `ap-southeast-2` with *Block all public access* on, versioning on, and SSE-S3 encryption.
- Upload `apps/web/dist` with `aws s3 sync`. **Learning step, cache headers:** upload in two passes:
  - hashed `assets/*` with `Cache-Control: public, max-age=31536000, immutable`
  - `index.html` and `events.json` with `Cache-Control: no-cache`
- Inspect the uploaded objects to see the metadata on each.

**13. CloudFront**
- Create a distribution with the bucket as origin, using **Origin Access Control**. Apply the bucket policy it generates, which lets only this distribution read the bucket. Set `index.html` as the default root object, and redirect HTTP to HTTPS.
- **Learning step, cache policy:** use the managed `CachingOptimized` policy and check that it respects your `Cache-Control` headers. Look at the `x-cache` response header (Hit or Miss) in browser dev tools.
- **Done when:** the site works at `https://dxxxx.cloudfront.net`, and direct S3 URLs return 403.

**14. Route 53 hosted zone**
- Create a public hosted zone for `pitchin.au` in `pitchin-prod`.
- Change the nameservers at Namecheap to the 4 Route 53 NS records.
- Check with `dig NS pitchin.au +short`. Propagation can take hours.
- This zone is **kept permanently** and imported into Terraform later, so the nameservers only change once.

**15. ACM certificate (must be in us-east-1)**
- CloudFront only accepts certificates from **us-east-1**, whatever region the rest of the site is in. Switch the console to N. Virginia for this step.
- Request a certificate for `pitchin.au` and `www.pitchin.au` with DNS validation. Use "Create records in Route 53" and wait until its status is *Issued*.

**16. Connect the domain**
- On the distribution, add the alternate domain names `pitchin.au` and `www.pitchin.au`, and attach the certificate.
- In Route 53, create `A` and `AAAA` alias records for the apex and `www` pointing at the distribution.
- Choose a canonical host (suggestion: the apex) and redirect `www` to it with a small CloudFront Function.
- **Done when:** `https://pitchin.au` serves the plain list.

**17. Invalidation (learning step)**
- Change `events.json`, upload it, and see what CloudFront serves. Then run an invalidation for `/events.json` only, and compare. Because of the cache headers from step 12, you should rarely need this.

### Phase 3 — Terraform

**18. Bootstrap the state backend**
- `infra/bootstrap/` holds a small Terraform config with *local* state. It creates the state bucket (versioned, encrypted, public access blocked) in `pitchin-prod`. Commit the config, but not its local state. It's tiny and rarely changes, and the README says how to recreate it.

**19. Main config**
- `infra/envs/prod/backend.tf`: S3 backend with `use_lockfile = true`. This is native S3 locking, so no DynamoDB table is needed.
- **Provider alias for ACM.** A Terraform AWS provider works in one region. Define the default provider for `ap-southeast-2` and a second one for `us-east-1`:
  ```hcl
  provider "aws" { region = "ap-southeast-2" }
  provider "aws" {
    alias  = "us_east_1"
    region = "us-east-1"
  }
  ```
  Then create the certificate with `provider = aws.us_east_1`. When this is inside a module, pass it in through `providers = { aws.us_east_1 = aws.us_east_1 }` and declare it with `configuration_aliases`.
- `infra/modules/static-site/` contains: bucket, OAC, bucket policy, CloudFront distribution, redirect function, ACM certificate and validation records, alias records, and the budget. Inputs include `domain_name` and `environment`, so staging can reuse it later.

**20. Rebuild from Terraform**
- **Import the hosted zone** with an `import` block (`to = aws_route53_zone.main`, `id = "<zone id>"`). The nameservers stay the same.
- Tear down the hand-built bucket, distribution and certificate. **Gotcha:** an alternate domain name can only be attached to one CloudFront distribution at a time. Remove `pitchin.au` from the old distribution, or delete it, before applying. Expect a short outage, which is fine at this stage.
- `terraform plan`, then `apply`, then upload the site again and verify.
- **Done when:** `terraform plan` shows no changes and the site serves from the domain.

**21. Terraform in CI**
- Add `terraform fmt -check` and `terraform validate` to CI for changes under `infra/`. Running `terraform plan` on PRs comes later.

### Phase 4 — Deploy automation

**22. GitHub OIDC role (in Terraform)**
- Create an IAM OIDC provider for `token.actions.githubusercontent.com`, and a deploy role whose trust policy only allows this repo's `main` branch. Later, a `staging` GitHub environment can be allowed too.
- Least-privilege permissions: list, put and delete on the site bucket, and `cloudfront:CreateInvalidation` on the distribution.

**23. Deploy workflow**
- On push to `main`, after CI passes: build, then `aws s3 sync` in the same two cache-header passes as step 12 (with `--delete` on the assets pass), then invalidate `/index.html` and `/events.json` only.
- **Done when:** merging a PR updates pitchin.au with no manual steps.

### Phase 5 — UI v1

**24. Filters (in the URL query string)**
- **Region:** a single select with groups (*All South Australia*, *All Adelaide*, then each region). An event matches if any of its `regions` falls in the selection.
- **Kind:** *Any volunteering* or one kind. An event matches if any of its `kinds` matches.
- **When:** Today, This weekend, Next weekend, Next 7 days, Next 30 days (default).
- Example URL: `?region=adelaide-east-hills&kind=wildlife&when=this-weekend`. Defaults are left out of the URL.

**25. List**
- Single column, grouped by day (Today, Tomorrow, then dated headings).
- The data is already loaded, so for "Next 30 days" and longer ranges, **"Show more" renders the next block of days** instead of fetching anything.

**26. Event card**
- Name, organisation, time (or "Time not listed"), location, registration, and an **"Official page →"** button (hidden when `link_ok` is false).
- A trust line built from `date_basis` and `last_checked_at`, for example *"Repeats monthly · last checked 19 Nov. Confirm on the official page before you go."*
- An expandable "More details" section for experience needed, what to bring, and what you'll be doing, where the data has it.

**27. Polish**
- Basic accessibility: labelled selects, focus states, colour contrast. Check it works on a phone. Add a meta description and an Open Graph image.

---

## Future

- Daily scheduled regeneration with GitHub Actions, plus a staleness alarm
- Timezone-aware expansion (needed for national expansion)
- Hide events that have already ended today
- Day-of-week filter ("on Wednesdays")
- Handling long-running and recurring series in the UI, once real usage shows what's needed
- User feedback: "I did this!" and "It's cancelled" (a "Report a problem" link first)
- Rewriting descriptions in our own words, and removing personal contact details picked up by scraping
- Building confidence in the data: AI agents re-checking sources and updating `last_checked_*`, manual checks, and later organisers confirming their own events
- AI agent discovery of new series, and filling in the 211 series that have no schedule
- Admin or approval flow
- Staging environment (`pitchin-staging` account plus `infra/envs/staging`)
- `terraform plan` on PRs
- Observability: CloudFront logs, uptime and staleness alarms, maybe CloudWatch RUM
- SEO and prerendering (for example Astro)
- Expansion beyond South Australia

## Open questions

1. **Region list.** The planned list has no regions for scheduled series in Fleurieu Peninsula (13), Eyre Peninsula (3), Adelaide Plains (1), Kangaroo Island, Flinders Ranges or Far North, and it doesn't cover "Statewide / roving". Proposed enum:
   - Adelaide: CBD & Inner Metro, North, North-East, East & Hills, South, West
   - Regional: Adelaide Plains, Barossa & Mid North, Fleurieu & Kangaroo Island, Murraylands & Riverland, Limestone Coast (South-East), Yorke Peninsula, Eyre & Western, Flinders & Outback
   - "Statewide / roving" series appear only under *All South Australia*.
2. **Backfill date** for `last_checked_at`: is 2026-11-19 the right date for the current bot run?
3. **Exercise:** the 4 series with `type: "exercise"`. Keep them under a kind, or drop them from v1?
