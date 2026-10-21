# Nightly Check-In

A clinical, minimal nightly data-collection tool for a school research study. Two class
arms — **Intervention** (AP Statistics: wellbeing core + nightly planning) and **Control**
(Data Management: wellbeing core only) — check in once per school night for a full school
year. The app stores **no student names, emails, or school IDs anywhere**; identity lives
only on the sponsor's offline paper sheet.

Stack: Next.js (App Router) + TypeScript + Postgres + Drizzle. No third-party analytics,
trackers, or runtime CDN assets (Geist Sans is self-hosted).

## Setup

```bash
npm install
cp .env.example .env        # then fill in values (table below)
npm run icons               # generate PWA icons (already committed; safe to re-run)
npm run db:migrate          # create tables
npm run seed -- --slots     # presets + staff accounts + 15/30 claim slots
npm run dev
```

### Environment variables

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Neon/Supabase pooled endpoint in production; `postgres://postgres:postgres@localhost:5432/nightly` for local dev. |
| `APP_SECRET` | Long random string; peppers PIN/password hashes. `openssl rand -base64 32` |
| `APP_TIMEZONE` | IANA timezone of the school (default `America/Toronto`). All check-in dates, windows, and countdowns use it; the DB stores UTC. |
| `SCHOOL_NIGHTS` | Weekdays of nights that are school nights, `0`=Sun…`6`=Sat (default `0,1,2,3,4`). |
| `APP_BASE_URL` | Public origin, used in claim URLs on printed strips and QR codes. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push keys. `npx web-push generate-vapid-keys` (put the public key in both public vars). Optional — without them reminders are simply unavailable. |
| `VAPID_SUBJECT` | `mailto:` contact for the push service. |
| `CRON_SECRET` | Long random string; Vercel Cron sends it as a Bearer token. |
| `SEED_*` | Initial sponsor/teacher emails + passwords, used only by `npm run seed`. Change after first login via the DB (no self-service staff UI by design). |
| `CHECKIN_WINDOW_OVERRIDE` | **Never set in production.** When `true`, `/api/today` and `/api/checkin` honor an `x-test-now` header so the window/Sunday logic can be smoke-tested out of hours. |

## Daily operations

### Generate and print claim strips

1. Sign in as sponsor → **Claim slots** → pick arm + section + count → **Generate**
   (or use `npm run seed -- --slots` for the initial 15 intervention + 30 control).
2. Open **Print strips** (or `/admin/slots/print?section=AP%20Statistics`), print, cut
   along the dashed lines.
3. Hand one strip to each student. Each student writes their **short code next to their
   name on your paper roster**. That sheet is the only identity mapping in existence —
   it never enters the app.
4. Students open the claim URL (QR or link), set a 4-digit PIN, and they're in.
   `/admin/slots` shows claimed vs unclaimed codes so you can chase onboarding.

### Adding a second device (student)

Settings page → scan the QR or enter short code + PIN on the login page. The claim URL
keeps working as a login link after claiming.

### Lost credentials

Verify the student against your paper sheet, then `/admin/slots` → **Rotate** next to
their code. This invalidates the old link and all sessions (and clears any PIN lockout),
and gives you a fresh claim URL to write on a new strip. There is no self-service
recovery — the app holds no identity to recover against.

### Running an export

`/admin/export` → pick a date range (blank = everything) → download **All tables (JSON)**
or per-table CSV. Exports contain `checkins`, `weekly_supplements`, `plans`,
`test_dates`, and `confirmations` (submission timestamps + late flags — your fallback
completion dataset). The query itself filters to codes with consent status `CONSENTED`
that are not excluded; unconsented rows are never read. Study lead-time is derived, never
entered: earliest `plans.local_date` per course minus that course's `test_date`. Every
export is written to the audit log.

### Processing a withdrawal

1. Verify against the paper sheet.
2. `/admin/consent` → set the code to `WITHDRAWN` (signs them out immediately).
3. `/admin/data` → enter the code twice → **Permanently delete**. This removes every row
   for the code across check-ins, supplements, plans, confirmations, test dates, courses,
   push subscriptions, and sessions. The consent row stays as `WITHDRAWN` so exports keep
   excluding the code, and the deletion itself is audit-logged.

### Changing a preset course list mid-study (deliberate action only)

`course_presets` is frozen at seed time and has no admin UI on purpose: a mid-October
addition makes students' longitudinal rows messy. If a change is genuinely required, do
it as a documented, one-off migration: connect to the database, `insert into
course_presets (class_section, course_name) values (...)` (or delete the row), note the
date and reason in your study log, and record it in the audit log (`insert into
audit_log (actor_role, action, meta) values ('SPONSOR', 'presets.change', '...')`). Never
rename a preset after students have enrolled in it — add the new name and leave the old.

## Backups (24-month retention)

The IRB commits you to retaining the data for 24 months. Two layers: **(1)** confirm your
Postgres host's automated backups are on — on Neon this is the built-in point-in-time
restore / branch history, on Supabase it's the scheduled physical backups on paid tiers
(or daily logical backups on the free tier); check the console once at setup and note the
retention window. **(2)** As a belt-and-suspenders copy under school control, take a
weekly encrypted dump, e.g. a cron on a school machine:
`pg_dump "$DATABASE_URL" | gpg --symmetric --cipher-algo AES256 > backups/nightly-$(date +%F).dump.gpg`,
kept on school-controlled storage. Test a restore once per term (`gpg -d` then `pg_restore`/
`psql`). A hosted project with no verified backup is one bad Tuesday away from losing a
term of panel data.

## What the app does, mapped to the ethics application

Hand this section to your ethics reviewer or any parent who asks.

| Commitment in the application | How the app enforces it |
| --- | --- |
| No identifying information collected | No name/email/ID columns exist in any table. Students are `participant_code` only; the code↔name mapping is the sponsor's offline paper sheet. Free text is a schema violation: every API payload is validated by strict schemas that reject unexpected fields, and no free-text input exists anywhere in the UI. |
| Data used only from consenting participants | The export endpoint's SQL filters to `consent.status = 'CONSENTED' AND excluded_from_study = false` at the query layer, so unconsented or excluded rows are never even read. Consent defaults to `NOT_CONSENTED` until the sponsor sets it from the paper sheet. |
| Participants may withdraw and have their data deleted | Withdrawal is a hard `DELETE` across all data tables (not a flag), performed by the sponsor with a type-to-confirm safeguard, and recorded in the audit log. |
| Teachers see completion only, never answers | The roster endpoint reads only the `confirmations` table (code, date, timestamp, late). No response content is selectable on that code path, and no names exist anywhere to join against. |
| Responses never affect grades | The only teacher-facing artifact is completion counts; the student-facing footer states this on every form screen. |
| Access is controlled | Students: one-time claim links + 4-digit PIN (bcrypt-hashed with a server-side pepper), httpOnly SameSite=Lax session cookies, per-IP and per-code rate limits, lockout after 10 failures, token rotation for lost credentials. Sponsor/teacher: separate staff auth with the same hashing, rate limiting, and audit logging of all actions and auth failures. |
| Data kept secure in transit and at rest | HTTPS everywhere (Vercel), encrypted-at-rest managed Postgres (Neon/Supabase), no third-party scripts or cookies beyond the session cookie, restrictive Content-Security-Policy, no response data in `localStorage`. |

## Deploying to production (Vercel + Neon)

1. Create a Neon project; copy the pooled connection string.
2. `vercel login && vercel link` in this directory.
3. Set env vars: `vercel env add DATABASE_URL` (and each var from the table above; use
   `openssl rand -base64 32` for `APP_SECRET` and `CRON_SECRET`). Set `APP_BASE_URL` to
   your production origin. `vercel env pull .env.production` if you want them locally.
4. Run migrations against production: `DATABASE_URL=<prod-url> npm run db:migrate`.
5. Seed: `DATABASE_URL=<prod-url> npm run seed -- --slots` (edit the preset lists in
   `scripts/seed.ts` first — they freeze afterwards).
6. `vercel deploy --prod`.

`vercel.json` registers two cron jobs: `remind` (scheduled at both UTC hours that can be
7:30pm in `APP_TIMEZONE`; a local-time guard makes exactly one fire, so DST is handled)
and `verify` (checks the reminder ran, records the result, and is surfaced by
`/api/health`). On the Vercel Hobby plan each cron runs at most once per day — upgrade to
Pro for exact twice-daily scheduling; the app degrades gracefully either way (missed
reminders are acceptable by design, and `verify` records the miss).

## Local development & verification

```bash
docker run -d --name nightly-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:17
docker exec nightly-pg createdb -U postgres nightly
npm run db:migrate && npm run seed -- --slots
CHECKIN_WINDOW_OVERRIDE=true npm run dev   # in one shell
npm run smoke                              # in another: full end-to-end test
```

The smoke test exercises claim → setup → check-in → resubmit → Sunday supplement → late
window → closed states → roster → consent-filtered export → withdrawal → PIN lockout →
token rotation. Remember `CHECKIN_WINDOW_OVERRIDE` is for local use only.
