
# System Architecture

Stack:

Next.js - Web apps
Expo - Mobile apps
Hono - API server
tRPC - typed API layer
Prisma - schema and migrations
Drizzle - runtime query builder / repository access
Better Auth - authentication
Trigger.dev - background workflows

Architecture pattern:

Client
-> tRPC / HTTP
-> Hono API
-> service layer
-> repository layer
-> Drizzle runtime queries
-> database shaped by Prisma schema

Rules:
- Prisma is the source of truth for schema definitions and migrations.
- Drizzle is used in runtime data-access code, not as a second schema authority.
- No Supabase dependency in the current architecture.
