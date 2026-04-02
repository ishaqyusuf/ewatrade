# AI Workflow

## Purpose
Standard workflow for AI collaborators working in this repository.

## How To Use
- Read `brain/BRAIN.md` and relevant focused docs before making changes.
- Update Brain files whenever architecture, data, APIs, or priorities change.
- Use `TODO:` markers instead of guessing when implementation details are missing.
- When deciding repo shape, app boundaries, or shared package placement, inspect `~/Document/code/_kitchen_sink/midday` first and treat it as the default structural reference.

## Workflow
1. Review `brain/SYSTEM_OVERVIEW.md` and the relevant domain/module docs.
2. Check `brain/system/`, `brain/database/`, and `brain/api/` for current constraints.
3. For code structure decisions, review `~/Document/code/_kitchen_sink/midday` before introducing new app/package patterns.
4. Implement or document changes.
5. Update impacted Brain files in the same turn.
6. Record decisions in `brain/decisions/` when a choice affects long-term architecture.

## Documentation Triggers
- Architecture change -> update `brain/system/architecture.md` and add ADR if needed.
- Database change -> update `brain/database/*.md`.
- API change -> update `brain/api/*.md`.
- Feature addition -> add/update `brain/features/*.md`.
- Progress change -> update `brain/tasks/*.md`.
