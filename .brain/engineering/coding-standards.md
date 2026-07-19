# Coding Standards

## Purpose
Shared engineering rules for future implementation work.

## How To Use
- Update when new code conventions become standard.

## Standards
- Keep domain logic out of UI components.
- Use service and repository layers to isolate business logic and persistence.
- Keep tenant authorization explicit at API and repository boundaries.
- Prefer shared types/contracts instead of copy-pasted shapes.
- Update Brain docs in the same change set when architecture or data contracts change.

## Local QA And Dev Commands

- Reuse an already-running development stack when available. If dev is
  required and no suitable stack is running, start the required root
  `bun run dev` profile in a dedicated managed terminal session and retain the
  session for logs and shutdown.
- The root profile-aware `bun run dev` router is the development entrypoint.
  Supported profiles are `bun run dev --local`, `bun run dev --remote` or
  `bun run dev --remote-dev`, and `bun run dev --prod`. The default is local.
- `bun run dev --filter <targets>` accepts exact package names such as `@ewatrade/dashboard`, bare workspace shorthands such as `dashboard`, and Turbo selectors. Use this instead of app-specific scripts when multiple surfaces need to run together.
- `-f` is the supported short alias and accepts multiple bare workspace names.
  Use `bun run dev --local -f mobile api jobs dashboard` for focused mobile
  operations QA. Include `api`; the Turbo `dev` task does not automatically
  start workspace dependencies.
- Use
  `bun run dev --local -f mobile api jobs dashboard marketing storefront pos`
  for full local mobile and website QA. Keep the single managed root session
  running for logs and shutdown.
- Website QA must use Portless hostnames without explicit ports. The canonical local website URLs are `http://ewatrade.localhost` for marketing and `http://ewatrade-dashboard.localhost` for dashboard; use the corresponding repository Portless app names for storefront, POS, and API flows.
- A named Portless URL with an appended port, including `ewatrade.localhost:1441`, is a broken configuration. Stop website QA, diagnose and fix the Portless bug, and verify the port-free URL before proceeding.
- Do not add separate `dev:portless` root or workspace scripts. Workspace `dev` scripts are already Portless-backed, and the root `bun run dev --filter ...` router should remain the only development entrypoint.
- Workspace Portless scripts should not set `PORTLESS_PORT`; leaving the proxy on the standard HTTP/HTTPS port keeps local named-host URLs portless, matching the Halalvest setup. They may set `PORTLESS_WILDCARD=${PORTLESS_WILDCARD:-1}` and `PORTLESS_SYNC_HOSTS=${PORTLESS_SYNC_HOSTS:-0}`.
- Raw localhost ports may be inspected only while diagnosing Portless itself; they are not valid website QA URLs and do not allow work to proceed past a broken named host.
- Expo mobile development defaults to `EXPO_PORT=3096`, which is the next local 309x port after storefront `3091`, marketing/web `3092`, POS `3093`, dashboard `3094`, and API `3095`.
- `bun run kill:ports` discovers numeric env variables ending in `_PORT` and ignores names containing `PORTLESS`, matching the SchoolClerk kill-port convention. Keep every project-owned dev port declared as an individual `*_PORT` env variable instead of adding aggregate kill lists.
- After every Prisma schema/database update, run the repository-required migration workflow and then run `bun run db:push --local` and `bun run db:push --prod`; also attempt `bun run db:push --remote`, which aliases the remote-development profile.
- All three DB push profiles must be attempted for Prisma updates. Preserve the repository's destructive-change safeguards, never force data loss without approval, and report any profile that could not be updated.
- The jobs workspace exposes `bun --filter @ewatrade/jobs dev`, which loads the local workspace env and forwards `TRIGGER_PROFILE` through `scripts/with-trigger-profile.mjs`.
- Jobs deployment follows the same pattern through `bun run jobs:deploy`, which loads the production workspace env and forwards `TRIGGER_PROFILE` to `trigger deploy`.
- Keep env files organized with labeled groups. Trigger.dev job envs belong under `# ── Trigger.dev Jobs ──` with `TRIGGER_PROJECT_ID`, `TRIGGER_PROFILE`, and the environment-specific `TRIGGER_SECRET_KEY`.
- Email provider envs belong with the email group. `RESEND_API_KEY` enables the Resend transport while `EMAIL_FROM`, `EMAIL_REPLY_TO`, and `MARKETING_INBOX_EMAILS` define sender/reply/admin routing. `TEST_EMAILS` is the primary comma-separated exact `@test.com` safety recipient list, with `TEST_EMAIL` kept as a single-recipient fallback.
- Use `bun run email:test` for a provider smoke check; the command must fail closed when `RESEND_API_KEY` or `EMAIL_FROM` is missing, or when neither `TEST_EMAILS` nor `TEST_EMAIL` is configured.
- Keep application env names short and product-neutral. Do not add the `EWATRADE_` prefix to repository env keys; prefer names such as `API_URL`, `STOREFRONT_URL`, `PLATFORM_DOMAIN`, `GOOGLE_LIVE_*`, and `SHARED_LINK_*`.
- Development and preview environments must not bypass mobile OTP; use exact `@test.com` addresses plus configured test recipients for safe OTP delivery.

## Midday Implementation Standard
- Web UI and dashboard implementation must strictly follow Midday architecture, UX composition, filesystem naming, state management, validation, and QA patterns. This is non-negotiable for every dashboard, marketing, POS, storefront, and shared web UI change.
- Before editing a web UI/dashboard feature, inspect the closest analogue in `/Users/M1PRO/Documents/code/_kitchen_sink/midday` and copy the local pattern for route composition, components, hooks, params, schemas, queries, mutations, loading/error/empty states, and tests.
- For any page, route, table, sheet, modal, or feature migration/rebuild, use the Midday migration-planner workflow first: compare the target to the closest Midday reference and produce or follow a file-level teardown/rebuild checklist before implementation.
- Pages, tables, modals, sheets, forms, onboarding, sidebar, sign-out, and shared dashboard components must follow Midday architecture, file naming, and coding patterns.
- Tables should follow the Midday domain table pattern: `components/tables/core`, `components/tables/<domain>/columns.tsx`, `data-table.tsx`, `table-header.tsx`, `skeleton.tsx`, `empty-states.tsx`, and `bottom-bar.tsx` or `action-menu.tsx` when needed.
- Sheets should follow the Midday global sheets pattern: `components/sheets/global-sheets.tsx`, `components/sheets/global-sheets-provider.tsx`, and domain sheet files under `components/sheets/`.
- Forms must follow Midday validation, error handling, and mutation patterns.
- Data fetching and mutations must use the standard Midday tRPC patterns, including invalidation, loading states, errors, and caching behavior.
- Do not accept dashboard/web UI shortcuts that skip Midday details such as URL params, open buttons, global sheet ownership, table headers, column definitions, skeletons, empty states, action menus, bottom bars, mutation invalidation, or browser QA when those patterns exist in the Midday reference.
- Prisma schema changes must be followed by the repository Prisma migration/deploy workflow and the local, production, and attempted remote DB pushes defined above. Do not manually create migration files.

## Global Personal Coding Rules
<!-- BEGIN Global Personal Coding Rules -->
- Canonical global coding-standard source: `/Users/M1PRO/.me/coding-standards/`.
- Always read `/Users/M1PRO/.me/coding-standards/global.md` before meaningful implementation work.
- Read `/Users/M1PRO/.me/coding-standards/nextjs.md` for Next.js, App Router, React web, API route, or browser-facing work.
- Read `/Users/M1PRO/.me/coding-standards/expo.md` for Expo, React Native, mobile UI, native navigation, or app-store-facing work.
- Do not use legacy skill-local `references/*.md` compatibility symlinks as canonical coding-standard references.
<!-- END Global Personal Coding Rules -->
