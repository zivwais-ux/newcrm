# Business OS — Phase 1

A modular Business Operating System for small and medium-sized businesses.

> Don't adapt your business to your software. Build software around your business.

You start with an empty workspace, import your existing data (Excel / CSV) or add records by hand, and the system maps it to a canonical business model. Then you add the **Components** you need: Customer Hub, Revenue Intelligence, Customer Risk, Sales Pipeline and so on. The AI Business Analyst answers questions from your own data.

## Stack

Next.js 15 (App Router, Server Components, Server Actions) · TypeScript · Tailwind CSS v4 · shadcn-style UI on Radix · Supabase (Auth, Postgres, Storage, RLS) · OpenAI (server-side only) · Recharts · dnd-kit · Vitest · Playwright.

## Getting started

1. **Install:** `pnpm install`
2. **Create a Supabase project** and apply the migrations in order: `supabase/migrations/*.sql` (SQL editor, or `supabase db push`). They create:
   - every table
   - row level security on all of them
   - the analytics functions
   - a private `imports` storage bucket
3. **Auth:** for a frictionless local demo, disable *Confirm email* (Authentication → Providers → Email). With it enabled, sign-up sends a confirmation link that returns to `/auth/callback`.
4. **Environment:** copy `.env.example` to `.env.local` and fill in:

   | Variable | Where it's used |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server, user-scoped (RLS applies) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Only `scripts/seed-demo.ts`. ESLint blocks importing it from app code |
   | `OPENAI_API_KEY`, `OPENAI_MODEL` | Server only. Optional (see below) |

5. **Run:** `pnpm dev` → http://localhost:3000. Until Supabase is configured, every route shows a `/setup` page with these steps.

**Without an OpenAI key** the product still works end to end. Column mapping uses the built-in heuristic engine, and the analyst and the daily brief answer from the same database queries using deterministic templates. The UI says when AI isn't connected. It never shows hard-coded answers.

### Demo data

- **In the app:** on an empty workspace, choose *I don't have data yet → Explore with sample data* during onboarding, or *Load sample data* under Data / Settings. It loads a dataset that matches the business type.
- **Pre-seeded accounts:** `pnpm seed:demo` (needs the service-role key) creates:
  - `demo-service@businessos.dev`: **Sparkle & Shine Cleaning** (≈550 customers, ≈3,000 transactions, 12 services)
  - `demo-sales@businessos.dev`: **Northwind Digital** (520 companies, ≈1,900 transactions, 140 leads, 72 deals)

  Password: `demo-password-123`, or set `DEMO_PASSWORD`.
- **Import file:** `samples/customers_and_sales.xlsx` (and `.csv`) is a realistic service-business export. It has human column names, 17 duplicates, 8 rows missing a name and one malformed amount, so the validator has something to report. Regenerate it with `pnpm generate:sample`.

The generated data tells a story: steady growth with seasonal peaks, and a drop last month caused by regular customers who stopped booking. That gives "Why is revenue down?" a real, discoverable answer.

## The Phase 1 flow

```
Sign up → create organization → Service / Sales / Both → where is your data?
  → Import (Upload → Analyze → Map columns → Validate → Import)
  → canonical customers / transactions / services / leads / deals / activities
  → recommended Components → Add Recommended → live Components on Home
  → AI Business Brief + AI Business Analyst
  → "View affected customers" → select → Create Follow-up Tasks → confirm → tasks created
```

## Architecture

```
app/
  (auth)/login, signup        auth pages
  onboarding/                 business type + data source
  setup/                      shown until Supabase is configured
  (dashboard)/                home, components, components/[id], data, data/import,
                              customers, customers/[id], leads, deals, transactions,
                              activities, tasks, ai, settings
  api/ai/                     analyst, map-columns, brief (server-only AI calls)
components/
  ui/                         design-system primitives (Radix + Tailwind)
  layout/                     sidebar, top bar, ⌘K search, workspace context
  business/                   tables, forms, pipeline board, profile, task lists
  components-system/          registry views, workspace grid, store, config sheet
  data-import/                import wizard
  ai/                         analyst chat, brief
lib/
  supabase/                   server/browser clients, middleware, org context
  data-mapping/               canonical schema, heuristics, validation, transform (pure, tested)
  components/                 registry (metadata), loaders (server data), types
  analytics/                  typed RPC wrappers, date ranges, daily brief
  ai/                         OpenAI client, analyst tools + orchestration, column mapping
  actions/                    server actions (org, components, records, import, search, demo)
  demo/                       seeded dataset generator
supabase/migrations/          schema + RLS, analytics functions
```

### Multi-tenancy & security

- Every business table has `organization_id`. RLS policies use `is_org_member()` / `has_org_role()`, which are `SECURITY DEFINER`, stable and use a fixed `search_path`. A user only ever sees rows for organizations they belong to.
- Roles:
  - Members read and write business data.
  - Owners and admins manage Components, settings and deletions.
  - Activities and tasks can be deleted by any member.
- Organizations are created only through `create_organization()`, which atomically inserts the org, makes the caller its owner and selects it.
- The analytics functions are `SECURITY INVOKER`, so RLS still applies inside them.
- Uploaded files go to a private bucket under `{org_id}/…`, and storage policies check membership on that folder.
- The app never uses the service-role key. Server actions validate all input with zod and return human-readable errors. Raw database errors are logged server-side and never shown to users.

### Semantic data model

`lib/data-mapping/canonical-schema.ts` is the single source of truth for the business fields an import can map to. Each field has a type and English/Hebrew synonyms. The pipeline:

```
raw rows ─▶ column mapping (AI + heuristics, user-confirmed)
         ─▶ validation (counts, duplicates, issues — nothing silently dropped)
         ─▶ canonical records ─▶ customers / transactions / services / leads / deals / activities
```

Repeated customers are merged by email, then phone, then normalized name, both within the file and against existing records. Unrecognized columns are kept in `custom_fields`, never discarded. Components read only canonical tables, never spreadsheet column names.

### Component system

A Component is a business capability. It has metadata, required data, a server loader, a client view, configuration and actions.

- `lib/components/registry.ts`: definitions (name, description, category, `requiredEntities`, `recommendedFor`, `configFields`, actions, permissions, empty state).
- `lib/components/loaders.ts`: one server loader per id; it reads the canonical data layer.
- `components/components-system/views.tsx`: one client view per id.

The Store, Home grid, configuration sheets, recommendations and search all discover Components from the registry. **To add a Component:**
1. Add a definition.
2. Add a loader.
3. Add a view.

No core changes are needed. Business type only influences *recommendations*, which are scored from type plus available data. No Component is hidden because of business type.

Installed Components live in `components` with `config` (settings and size) and `position`. Owners and admins can reorder (drag), resize, configure and remove them on Home.

### AI

- **Analyst:** OpenAI tool calling over a fixed set of read-only analytics tools (revenue comparison, trends, top customers, overdue regulars, at-risk customers, stalled deals, pipeline). The model never writes SQL and has no write tools.
  - Follow-up actions ("View affected customers", "Create follow-up tasks") are derived from tool results, not chosen freely by the model.
  - Creating tasks always goes through a confirmation dialog.
- **Column mapping:** structured output validated against the canonical schema, merged with heuristics, and shown with confidence scores for the user to confirm.
- **Daily brief:** facts are computed in SQL, then OpenAI phrases them (or a template does). Cached per org per day and refreshable.

## Scripts

| Command | |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm typecheck` / `pnpm lint` | TypeScript and ESLint |
| `pnpm test` | Unit tests (mapping, validation, transform, registry and recommendations, analyst fallback) |
| `pnpm test:e2e` | Playwright end-to-end scenario and org-isolation test (needs a configured backend) |
| `pnpm seed:demo` | Create the two demo workspaces (service-role key) |
| `pnpm generate:sample` | Regenerate `samples/customers_and_sales.*` |

## Phase 1 scope

Deliberately **not** included: external integrations (WhatsApp, Gmail, Calendar, Stripe, Shopify), automations, billing, a mobile app, an external marketplace, autonomous agents.
