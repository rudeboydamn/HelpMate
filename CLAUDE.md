# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

HelpMate is a multi-tenant project management / support platform (Linear-style issues,
cycles, modules, kanban, pages, analytics) built as a **server-rendered HTMX app** on
Node.js + Express, backed by **Supabase (Postgres)**, deployed to **Vercel** as a
serverless function.

There is no client-side framework, no bundler, and no build step. HTML is produced two
ways: file templates in `src/views/` for full pages, and inline template literals inside
route handlers for HTMX fragments.

## Commands

```bash
npm install          # install deps
npm run dev          # node --watch src/server.js  (http://localhost:3000)
npm start            # node src/server.js
npm run build        # no-op, exists for Vercel
npm run db:setup     # BROKEN - see "Known broken things"
```

There is **no test suite, no linter, and no formatter**. Do not invent
`npm test` / `npm run lint` invocations — they do not exist. Verify changes by starting
the server and exercising the affected route.

Requires Node 20 (`engines.node: 20.x`). ESM only (`"type": "module"`), so **relative
imports must include the `.js` extension**.

## Environment

Copy `.env.example` to `.env`. The server **throws at import time** if `SUPABASE_URL` or
`SUPABASE_SERVICE_ROLE_KEY` are missing (`src/db/supabase.js:9`) — nothing will boot
without them. `SESSION_SECRET` silently falls back to the literal `'helpmate-secret'`,
which is fine locally and unacceptable in production. Stripe vars are optional; billing
routes degrade to an error banner without them.

## Layout

```
src/
  server.js            Express app: middleware, session, res.render patch, route mounting
  db/
    supabase.js        Supabase service-role client (`supabase`) + unused `db` helper wrapper
    setup.js           Legacy better-sqlite3 schema bootstrap - dead code, see below
  middleware/auth.js   authMiddleware, tenantMiddleware, adminMiddleware, ownerMiddleware
  lib/template.js      Hand-rolled {{ }} template engine
  routes/*.js          One Router per feature area
  views/               Full-page .html templates + partials/
public/                Static assets (favicon only)
supabase/migrations/   Numbered .sql files, applied by hand in the Supabase SQL editor
vercel.json            Routes everything to src/server.js via @vercel/node
```

## Request lifecycle

1. `express.urlencoded` + `express.json` + static files.
2. `cookieSession` — session state lives entirely in a signed cookie named
   `helpmate_session` (chosen for serverless; there is no session store). Only
   `req.session.userId` is ever stored. Logout is `req.session = null`.
3. A middleware in `server.js:51` monkey-patches `res.render(template, data)` to call
   `renderTemplate()` and `res.send()` the result. It injects `user` and `org` into every
   template's data automatically. It is `async` but handlers call it without `await` —
   follow that existing pattern rather than changing it piecemeal.
4. Public routes (`authRoutes`) mount at `/`. Everything else mounts behind
   `authMiddleware, tenantMiddleware`, which populate `req.user` and `req.org`.
5. A terminal error handler returns a red Tailwind `<div>` with a 500.

`server.js:95` guards `app.listen` behind `process.env.VERCEL !== '1'` and the app is
`export default app` for the serverless runtime. Keep both.

## Auth and roles

- Passwords are bcrypt hashes in the app's own `users.password_hash` column. Login
  compares with `bcrypt.compare`. **Supabase Auth is not used**, despite the `auth_id`
  column added in migration 003 and the comments referring to it.
- Roles are `owner | admin | member | guest` on `users.role`. `adminMiddleware` allows
  owner+admin; `ownerMiddleware` allows owner only. Both are imported per-route, not
  mounted globally.
- `src/routes/admin.js` defines its own local `instanceAdminMiddleware` checking the
  `instance_admins` table — a separate "god mode" concept from org roles.

## Data access

All server code uses the **service role key**, which bypasses Row Level Security. That
makes **explicit tenant scoping the only thing protecting tenant isolation**:

```js
// Every query touching tenant data MUST filter by org (or join through something that does)
const { data } = await supabase.from('issues').select('*').eq('org_id', req.org.id);
```

Never write a tenant-table query without an `org_id` (or project→org) constraint.

The idiomatic pattern in migrated code is the Supabase JS client directly, destructuring
`{ data, error }`, logging `error` and falling back to `|| []` / `|| 0`. Nested relations
are pulled with PostgREST embedding and then flattened onto the parent for the template:

```js
const { data: issues } = await supabase
  .from('issues')
  .select('*, states(name, color, state_group), projects(name, color, identifier)')
  .eq('org_id', req.org.id);

for (const issue of issues) {
  issue.state_name = issue.states?.name;   // templates only read flat keys
}
```

`src/db/supabase.js` also exports a `db` object (`get/all/insert/update/delete/count/rpc`)
meant to smooth the SQLite→Supabase migration. **Nothing imports it.** Prefer the raw
`supabase` client for consistency with the migrated routes; don't expand the wrapper
unless you are converting the whole codebase to it.

### Schema

Postgres, UUID primary keys with `gen_random_uuid()`, `TIMESTAMPTZ` timestamps, defined
in `supabase/migrations/001_initial_schema.sql` (~33 tables). Core chain:

`organizations → users / projects → states, labels, boards → columns → issues`

with `issues` linked M2M to assignees, labels, cycles, and modules, plus
`issue_comments / issue_activity / issue_relations / issue_attachments`. Billing lives in
`organizations.plan` (`free | pro | whitelabel`), `max_users`, `stripe_customer_id`,
`stripe_subscription_id`, and an `invoices` table.

Two enum-ish CHECK constraints matter constantly:
- `issues.priority`: `urgent | high | medium | low | none`
- `states.state_group`: `backlog | unstarted | started | completed | cancelled`

Note `issues.name` is the title column — the create form posts `title` and the handler
maps it. There is no `issues.assignee_id`; assignment goes through `issue_assignees`
(some unmigrated SQL in `kanban.js` still joins a non-existent `assignee_id`).

### Migrations

Plain numbered `.sql` files. There is no Supabase CLI config, no `config.toml`, and no
migration runner — **they are pasted into the Supabase SQL editor by hand**. Add new ones
as `00N_short_description.sql` and write them idempotently (`IF NOT EXISTS`,
`DROP POLICY IF EXISTS`, `ON CONFLICT DO NOTHING`) since re-running is the norm.

Migration 004 replaced the original `USING (true)` policies (which exposed every table to
the `anon` role) with `TO authenticated` policies keyed on `auth.uid()`. Because the app
authenticates with its own cookie session and queries as the service role, `auth.uid()` is
never populated for app traffic — 004 is defense-in-depth against direct API access, not
the app's authorization layer. App-level authorization is the middleware plus `org_id`
filtering.

## HTMX conventions

- Handlers return **HTML fragments, never JSON** (the Stripe webhook is the one exception).
- Redirects for HTMX requests use the `HX-Redirect` response header with an empty body,
  not `res.redirect`. Middleware branches on `req.headers['hx-request']` to pick between
  the two — preserve that branch when adding auth-sensitive routes.
- Errors render as an inline Tailwind banner
  (`<div class="p-3 bg-red-100 text-red-700 rounded-lg">…</div>`), usually with HTTP 200 so
  HTMX swaps it in.
- On failure, the login handler re-renders the entire form (`renderError()` in
  `routes/auth.js`) because the swap target is the form itself.
- Modals are fragments fetched into `#modal-container`, a div living in `partials/nav.html`.

## Templates

`src/lib/template.js` is a ~90-line regex engine, not Handlebars. Supported syntax only:

| Syntax | Meaning |
| --- | --- |
| `{{# include:name }}` | inline `views/partials/name.html` |
| `{{#if cond}}…{{/if}}` | truthiness of a top-level key; **no `{{else}}`** |
| `{{#each items}}…{{/each}}` | item properties, `{{ this }}`, `{{ @index }}`; **no nesting** |
| `{{ var }}` | top-level scalar |
| `{{ obj.prop }}` | dotted path lookup |

Everything is HTML-escaped, and any unmatched `{{ … }}` is stripped at the end, so typos
fail silently as empty output. Full pages start with `{{# include:head }}` and
`{{# include:nav }}` (head opens `<html>`/`<body>`; `footer.html` closes them).

Fragments built with template literals in route handlers bypass this engine entirely and
are **not** escaped for you. `escapeHtml` is defined locally at the bottom of both
`routes/issues.js` and `routes/org.js`; interpolate user-controlled values through it.
Several existing fragments interpolate raw DB values — don't copy that.

Tailwind is the CDN build (`cdn.tailwindcss.com`) and HTMX is 1.9.10 from unpkg, both in
`views/partials/head.html`. There is no CSS pipeline; style with utility classes inline.

## Known broken things

Read this before assuming a bug is yours. The repo is a **partially completed
SQLite → Supabase migration**.

1. **10 of 12 route modules are non-functional.** Only `auth.js`, `dashboard.js`, and
   `issues.js` were converted. `admin.js`, `analytics.js`, `billing.js`, `cycles.js`,
   `kanban.js`, `modules.js`, `org.js`, and `pages.js`/`views.js` still call
   `db.prepare(...)` (better-sqlite3) while importing only `supabase` — `db` is undefined
   in those files, so every one of those handlers throws `ReferenceError` on first request.
   Their handlers are also still synchronous. Converting a file means: make the handler
   `async`, replace each `db.prepare(...).get/all/run(...)` with the equivalent `supabase`
   query, add `.eq('org_id', req.org.id)` scoping, and switch integer flags (`is_active = 1`)
   to booleans.
2. **`npm run db:setup` fails.** `src/db/setup.js` imports `better-sqlite3`, which is no
   longer in `package.json`. The file is dead code kept as a schema reference; the live
   schema is `supabase/migrations/`.
3. **`README.md` is stale.** It describes SQLite/better-sqlite3 and `express-session`. The
   app uses Supabase and `cookie-session`. Trust this file and the source over the README.
4. **Stripe webhook signature verification cannot succeed.** `express.json()` runs globally
   in `server.js`, so `req.body` is a parsed object by the time
   `stripe.webhooks.constructEvent` needs the raw buffer. Fixing it requires a raw-body
   parser mounted on `/billing/webhook` ahead of the JSON parser.
5. **Route-ordering shadowing.** `pages.js` declares `/:pageId` before `/create-modal`;
   `cycles.js` and `modules.js` declare `/:projectId/:cycleId` and `/:projectId/:moduleId`
   before their `/:projectId/create-modal` siblings. The literal routes are unreachable.
   Put literal paths before parameterized ones.
6. `dashboardRoutes.get('/stats')` runs the same unfiltered count three times, so open and
   completed issue counts equal the total.
7. Migration 004's header comment contains a hardcoded Supabase project dashboard URL.

## Conventions to follow

- One `Router` per feature file, exported as a named `xxxRoutes` const, mounted in
  `server.js` with its middleware chain.
- `uuid`'s `v4` is imported in several files as a holdover from SQLite; Postgres generates
  ids by default, so **let the database assign ids** rather than passing one in.
- Timestamps written from JS use `new Date().toISOString()`.
- Log errors with `console.error('Context:', error)` and degrade to an inline HTML message —
  the app never returns stack traces to users.
- Comments are sparse and explain *why* (serverless constraints, migration state). Match
  that density; don't annotate obvious code.
- Never commit `.env`; add new config keys to `.env.example` with placeholder values.

## Git

Development happens on feature branches; `master` is the default branch. Commit messages
follow a short imperative summary, occasionally with a `type:` prefix
(`security: add RLS migration to fix publicly accessible tables`).
