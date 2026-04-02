# ewatrade Brain

## Purpose
Central index for ewatrade product, architecture, engineering, database, API, decisions, bugs, and task documentation.

## How To Use
- Start here before making product or engineering changes.
- Update linked Brain docs when architecture, schema, APIs, or priorities change.
- Preserve existing domain docs under `brain/modules/`, `brain/architecture/`, and `brain/workflows/`.
- Use `~/Document/code/_kitchen_sink/midday` as the default source of inspiration for code structure, workspace boundaries, and app/package organization unless a newer ADR overrides that direction.
- Use `~/Documents/code/_turbo/gnd` as a reference for shared styling, package wiring, and monorepo app/package ergonomics when relevant.
- Use `~/Documents/code/plot-keys` as a reference for notifications, email, jobs, and tenant/domain utility patterns when relevant.

## Current State
- Repository currently contains Brain documentation only.
- Application code structure is not present yet in this workspace snapshot.
- `ewatrade` is the working project name for this platform.
- Core platform direction: multi-tenant commerce, logistics, merchant tooling, and website builder workflows.

## Key References
- [System Overview](./SYSTEM_OVERVIEW.md)
- [Project Index](./PROJECT_INDEX.md)
- [AI Workflow](./AI_WORKFLOW.md)
- [System Overview Doc](./system/overview.md)
- [System Architecture Doc](./system/architecture.md)
- [Tech Stack](./system/tech-stack.md)
- [Repo Structure](./engineering/repo-structure.md)
- [Database Schema](./database/schema.md)
- [API Endpoints](./api/endpoints.md)
- [Tasks Backlog](./tasks/backlog.md)
