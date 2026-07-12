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

## Midday Implementation Standard
- Pages, tables, modals, sheets, forms, onboarding, sidebar, sign-out, and shared dashboard components must follow Midday architecture, file naming, and coding patterns.
- Tables should follow the Midday domain table pattern: `components/tables/core`, `components/tables/<domain>/columns.tsx`, `data-table.tsx`, `table-header.tsx`, `skeleton.tsx`, `empty-states.tsx`, and `bottom-bar.tsx` or `action-menu.tsx` when needed.
- Sheets should follow the Midday global sheets pattern: `components/sheets/global-sheets.tsx`, `components/sheets/global-sheets-provider.tsx`, and domain sheet files under `components/sheets/`.
- Forms must follow Midday validation, error handling, and mutation patterns.
- Data fetching and mutations must use the standard Midday tRPC patterns, including invalidation, loading states, errors, and caching behavior.
- Prisma schema changes must be followed by the repository Prisma migration/deploy workflow. Do not manually create migration files.

## Global Personal Coding Rules
<!-- BEGIN Global Personal Coding Rules -->
- Canonical global coding-standard source: `/Users/M1PRO/.me/coding-standards/`.
- Always read `/Users/M1PRO/.me/coding-standards/global.md` before meaningful implementation work.
- Read `/Users/M1PRO/.me/coding-standards/nextjs.md` for Next.js, App Router, React web, API route, or browser-facing work.
- Read `/Users/M1PRO/.me/coding-standards/expo.md` for Expo, React Native, mobile UI, native navigation, or app-store-facing work.
- Do not use legacy skill-local `references/*.md` compatibility symlinks as canonical coding-standard references.
<!-- END Global Personal Coding Rules -->
