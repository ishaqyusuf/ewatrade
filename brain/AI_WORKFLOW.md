# AI Workflow

## Purpose
Standard workflow for AI collaborators working in this repository.

## How To Use
- Read `brain/BRAIN.md` and relevant focused docs before making changes.
- Update Brain files whenever architecture, data, APIs, or priorities change.
- Use `TODO:` markers instead of guessing when implementation details are missing.
- Important project reference: inspect `midday` at `/Users/M1PRO/Documents/code/_kitchen_sink/midday` first for repo shape, app boundaries, and shared package placement.
- Important project reference: inspect `gnd` at `/Users/M1PRO/Documents/code/_turbo/gnd` for shared frontend package structure, styling setup, and app ergonomics.
- Important project reference: inspect `school-clerk` at `/Users/M1PRO/Documents/code/school-clerk` for SaaS administration, school/tenant workflows, and operational dashboard patterns.
- Important project reference: inspect `plotkeys` at `/Users/M1PRO/Documents/code/plot-keys` for notifications, email, jobs, tenant-domain mechanics, package boundaries, and execution patterns.
- Important project reference: inspect `halaal-coperative` at `/Users/M1PRO/Documents/code/halaal-coperative` for cooperative commerce, member/account workflows, and finance-oriented product patterns.

## Workflow
1. Review `brain/SYSTEM_OVERVIEW.md` and the relevant domain/module docs.
2. Check `brain/system/`, `brain/database/`, and `brain/api/` for current constraints.
3. For code structure decisions, review `/Users/M1PRO/Documents/code/_kitchen_sink/midday` before introducing new app/package patterns.
4. Implement or document changes.
5. Update impacted Brain files in the same turn.
6. Record decisions in `brain/decisions/` when a choice affects long-term architecture.

## Documentation Triggers
- Architecture change -> update `brain/system/architecture.md` and add ADR if needed.
- Database change -> update `brain/database/*.md`.
- API change -> update `brain/api/*.md`.
- Feature addition -> add/update `brain/features/*.md`.
- Progress change -> update `brain/tasks/*.md`.
