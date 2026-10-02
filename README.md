# ewatrade

Minimal monorepo scaffold for ewatrade.

## Workspace
- `apps/storefront`: storefront application
- `apps/marketing`: platform marketing website
- `apps/pos`: point-of-sale application
- `apps/dashboard`: tenant operations dashboard
- `packages/db`: Prisma v7 database package with PostgreSQL migrations and generated client
- `packages/ui`: shared Tailwind CSS and UI-level styling primitives
- `packages/utils`: shared utility functions, including reusable tenant/domain routing helpers
- `packages/tsconfig`: shared TypeScript configs

## Commands
- `bun install`
- `bun run dev` - shared local-infra startup for all dev apps
- `bun run dev:storefront` - fixed dev port `3091`
- `bun run dev:marketing` - fixed dev port `3092`
- `bun run dev:pos` - fixed dev port `3093`
- `bun run dev:dashboard` - fixed dev port `3094`
- `bun run dev:api` - fixed dev port `3095`
- `bun run kill:ports`
- `bun run db:generate`
- `bun run db:migrate` (local default)
- `bun run db:migrate --dev`
- `bun run db:migrate --preview`
- `bun run db:migrate --prod`
- `bun run db:sync` (production → local by default)
- `bun run db:sync --to-preview`
- `bun run db:sync --from-local --to-preview`
- `bun run build`

Development uses the sibling `local-infra-kit`, following Halaalvest and GND.
The EwaTrade adapter retains strict Neon/profile validation and automatically
includes API when an exact mobile filter is selected. The shared runner resolves
Turbo filters, removes matching static Portless aliases, clears selected app
ports, starts required infrastructure, then launches Turbo. Startup does not
implicitly generate Prisma clients or apply migrations; use the explicit database
commands after schema changes.

```sh
bun run dev --local --f dashboard marketing jobs email mobile api
bun run dev --preview -f dashboard api
bun run dev:services
bun run kill:ports --dry-run
```

`jd ewatrade dev --f dashboard marketing jobs email mobile api` uses this same
entrypoint. `dev:api` and the other app shortcuts also route through it.
Filtered cleanup uses `<PACKAGE_NAME>_PORT`: `API_PORT=3095`,
`DASHBOARD_PORT=3094`, `MARKETING_PORT=3092`, `MOBILE_PORT=3096` and
`EMAIL_PORT=3003`. Mobile keeps `EXPO_PORT` as a compatibility fallback.
Turbo passes port and Portless settings to workspace scripts, so startup and
cleanup use the same env values. Standalone `kill:ports` clears all configured
app ports; `--mode preview` selects another env profile.

The root environment contract has one base file and four explicit profile files:

- `.env` provides shared defaults.
- `.env.local` is selected by the default `--local` profile.
- `.env.dev` is selected by `--dev` for hosted development.
- `.env.preview` is selected by `--preview`.
- `.env.production` is selected by `--prod`.

Each command loads `.env` followed by exactly one profile file. Every profile file owns its local-tooling `EWATRADE_DATABASE_URL`; database commands do not inherit that value from `.env` or another profile. Platform-injected process values remain available when no local profile file is present. The generic `DATABASE_URL` key is rejected and never used as a fallback.

Configure `EWATRADE_DATABASE_URL` before running database or app commands:

```bash
EWATRADE_DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
```

## Portless

App dev scripts use `portless` for stable local hostnames while preserving fixed backing ports.

```sh
bun run dev --local -f marketing dashboard api
```

Use `https://ewatrade.localhost`, `https://ewatrade-dashboard.localhost` and
`https://ewatrade-api.localhost` without explicit ports. Direct Portless launches
use local-infra's lock retry and interactive live-owner conflict handling after
EwaTrade database validation.

Install the CLI once if needed:

```bash
npm install -g portless
```

### Product category suggestions

The mobile Product name blur requests suggestions shown inside Category.
`SystemConfiguration` key `catalog.categorySuggestions` controls enablement and
provider/model. Seed the initial enabled DeepSeek Flash config on development:

```sh
DEV_PROFILE=local bun run db:seed:category-suggestion-config
```

The seed preserves existing admin choices. Server credentials resolve
`CATEGORY_SUGGESTION_DEEPSEEK_API` → `DEEPSEEK_API`. OpenAI resolves
`CATEGORY_SUGGESTION_OPENAI_API` → `OPENAI_API` → `OPENAI_API_KEY`. Configure keys in
root `.env` plus the selected profile; never use public/mobile-prefixed variables.
Missing keys leave the manual category picker available. Master-admin config UI
is planned; implementation and deferred testing are tracked in
[the Brain checklist](.brain/plans/2026-10-02-catalog-ai-category-suggestions-implementation.md).
