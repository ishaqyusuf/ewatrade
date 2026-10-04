# Oversight read integration

The separate Hono app in apps/oversight-api exposes authenticated read endpoints at /api/oversight/v1. Shared routes live in @ewatrade/oversight; project queries live in @ewatrade/db/oversight. The existing API can mount the same contract during its own reviewed release.

OVERSIGHT_READ_KEY must be a unique secret of at least 32 characters. Requests are server-to-server and responses have no-store caching. Summary periods use UTC; business/order reads exclude QA and purging tenants. Users include accounts without memberships and accounts with a live tenant membership, excluding QA-only memberships. Directories use cursor pagination with 50 records per page.

The read service is proposed for Vercel project ewatrade-oversight in ishaqyusufs-projects. It requires a separately approved SELECT-only PostgreSQL login, limited to Tenant, Membership, User and CommercialOrder, with schema USAGE, database CONNECT, read-only transactions and a 15-second statement timeout. No production credential should be transferred until approved.

The separate service uses a pool capped at three connections, read-only session settings and a 15-second statement timeout. It does not reuse the main API pool.

The read client initializes only after a request passes authentication and input validation. Health checks and rejected requests never initialize it. `/health` reports process availability; it does not certify database connectivity. Missing or unavailable database configuration produces a sanitized 503 response for an authorized data request.

No schema migration is required. Build-time Prisma generation does not connect to a database. Mutable business status and campaign delivery capabilities remain false until enforcement and consent integration are verified.
