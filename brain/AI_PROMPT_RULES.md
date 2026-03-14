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
