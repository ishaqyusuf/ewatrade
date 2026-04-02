# ADR-0002: Use Midday-Inspired Monorepo Architecture As The Default Repository Pattern

## Status
Accepted

## Context
The project needed its first real code scaffold. A clear repository structure is required so future web, mobile, API, and shared packages grow in a predictable way. The user explicitly requested that ewatrade should follow the architecture used in the `midday` project, while also using the latest Next.js and a Tailwind CSS setup informed by the `gnd` project.

## Decision
- Use a `midday`-inspired workspace layout with `apps/*` and `packages/*` as the primary repository structure.
- Keep applications isolated from each other and move shared code into `packages/*`.
- Start with a minimal app surface and shared packages, then expand into separate storefront, marketing, POS, and dashboard apps as the platform grows.
- Treat `~/Document/code/_kitchen_sink/midday` as the architectural reference for future package boundaries and workspace organization unless a later ADR intentionally changes that direction.
- Use the `gnd` project as the styling/setup reference for shared Tailwind CSS wiring.

## Consequences
- New apps and shared libraries should fit the existing monorepo shape instead of being added ad hoc at the repository root.
- Tailwind and shared UI concerns should continue to live in shared packages rather than being duplicated across apps.
- If ewatrade needs to diverge materially from the `midday` structure later, that change should be documented in a new ADR before the repo shape drifts.
