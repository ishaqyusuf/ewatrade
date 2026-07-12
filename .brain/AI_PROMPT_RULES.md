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
- Prisma schema changes must use the repository Prisma workflow. Do not manually create migration files.

## Global Personal Coding Rules
<!-- BEGIN Global Personal Coding Rules -->
- Canonical global coding-standard source: `/Users/M1PRO/.me/coding-standards/`.
- Always read `/Users/M1PRO/.me/coding-standards/global.md` before meaningful implementation work.
- Read `/Users/M1PRO/.me/coding-standards/nextjs.md` for Next.js, App Router, React web, API route, or browser-facing work.
- Read `/Users/M1PRO/.me/coding-standards/expo.md` for Expo, React Native, mobile UI, native navigation, or app-store-facing work.
- Do not use legacy skill-local `references/*.md` compatibility symlinks as canonical coding-standard references.
<!-- END Global Personal Coding Rules -->
