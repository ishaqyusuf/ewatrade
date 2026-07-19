# AI Prompt Rules

## Purpose
Keep AI-generated work aligned with repository architecture and documentation standards.

## Rules
- Prefer factual, current-state documentation over speculative design prose.
- Preserve existing Brain context unless an explicit replacement is requested.
- Treat `Prisma` as the schema and migration authority for database design.
- Treat `Drizzle` as the runtime query/repository tool where SQL ergonomics are needed.
- Do not introduce Supabase assumptions unless the project explicitly adopts it later.
- Use `TODO:` for unresolved implementation details.
- Keep markdown concise, scannable, and easy for future agents to parse.

## Non-Negotiable Architecture Rules
- Midday is the primary standard for pages, tables, modals, sheets, sidebar, forms, onboarding, layouts, tRPC calls, loading states, error states, and caching patterns.
- Use shadcn standard components and patterns for UI. Never directly modify shadcn source components; create wrapper components for project-specific behavior.
- Use GND as the reference for the standard notification package system.
- Use Plot Keys as the reference for local URL handling, portless/proxy support, and generated links.
- Add `app/[...slug]/page.tsx` as a catch-all route that redirects to `/` unless the repository has an explicit reason to diverge.
- Reuse a running development stack when available. Otherwise start the required
  root `bun run dev` profile in a dedicated managed terminal session and keep
  that session available for logs and shutdown.
- Use port-free Portless URLs for website work: `http://ewatrade.localhost` and `http://ewatrade-dashboard.localhost`. Any explicit port on a named host is a Portless bug that must be fixed before proceeding.
- Prisma schema/database changes must use the repository Prisma workflow, followed by `bun run db:push --local`, `bun run db:push --prod`, and an attempted `bun run db:push --remote`. Do not manually create migration files or force destructive changes without approval.

## Global Personal Coding Rules
<!-- BEGIN Global Personal Coding Rules -->
- Canonical global coding-standard source: `/Users/M1PRO/.me/coding-standards/`.
- Always read `/Users/M1PRO/.me/coding-standards/global.md` before meaningful implementation work.
- Read `/Users/M1PRO/.me/coding-standards/nextjs.md` for Next.js, App Router, React web, API route, or browser-facing work.
- Read `/Users/M1PRO/.me/coding-standards/expo.md` for Expo, React Native, mobile UI, native navigation, or app-store-facing work.
- Do not use legacy skill-local `references/*.md` compatibility symlinks as canonical coding-standard references.
<!-- END Global Personal Coding Rules -->
