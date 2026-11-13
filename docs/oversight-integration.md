# Oversight read integration

The separate Hono app in apps/oversight-api exposes authenticated read endpoints at /api/oversight/v1. Shared routes live in @ewatrade/oversight; project queries live in @ewatrade/db/oversight. The existing API can mount the same contract during its own reviewed release.

OVERSIGHT_READ_KEY must be a unique secret of at least 32 characters. Requests are server-to-server and responses have no-store caching. Summary periods use UTC; business/order reads exclude QA and purging tenants. Users include accounts without memberships and accounts with a live tenant membership, excluding QA-only memberships. Directories use cursor pagination with 50 records per page.

The read service is proposed for Vercel project ewatrade-oversight in ishaqyusufs-projects. It requires a separately approved SELECT-only PostgreSQL login, limited to Tenant, Membership, User and CommercialOrder, with schema USAGE, database CONNECT, read-only transactions and a 15-second statement timeout. No production credential should be transferred until approved.

The separate service uses a pool capped at three connections, read-only session settings and a 15-second statement timeout. It does not reuse the main API pool.

The read client initializes only after a request passes authentication and input validation. Health checks and rejected requests never initialize it. `/health` reports process availability; it does not certify database connectivity. Missing or unavailable database configuration produces a sanitized 503 response for an authorized data request.

The dedicated connection was approved on 2026-10-04. Role oversight_reader_20261004 passed verification: SELECT on the four named tables only, no inherited memberships, no application table writes and no schema CREATE rights. Use the direct Neon endpoint with TLS when supplying startup options; the pooled endpoint rejects those options. Search filters intersect account visibility rather than replacing it.

No schema migration is required. Build-time Prisma generation does not connect to a database. The build then bundles the shared routes, query helpers and Prisma runtime into a Node ESM entrypoint. Vercel's automatic tracing omitted raw workspace module paths, so deployment uses the self-contained bundle; source modules retain their package boundaries. Mutable business status and campaign delivery capabilities remain false until enforcement and consent integration are verified.

## Assistant usage (ledger) — 12 November 2026

`GET /api/oversight/v1/assistant-usage?start=YYYY-MM-DD&end=YYYY-MM-DD` (read key, inclusive UTC days, at most 92) returns billing-grade assistant counts from EwaTrade's own ledger. Behaviour metrics (adoption, latency, funnels, web vs mobile) come from Logly; Oversight labels each metric's source.

- `runs` (per day x channel), `runDays` (per day, all channels) and `runTotals` (per channel and `all` over the period): `AssistantRun` by status (running, completed, failed) with distinct active businesses and users. Distinct counts are computed in SQL per cell, so day rows must not be summed into period uniques.
- `tokens`: `AssistantUsageEvent` sums per day, channel, request class, provider and model. Events without a chat run (attachment transcription/vision, openings, storefront design, payment assessments) are `unattributed`. `eventsWithoutTokens` counts events whose provider reported no token total.
- `whatsapp`: outbox rows by state (`untenanted` = replies before a business is selected), delivery attempts by state (the policy's billing unit) and verified receipts by status. Usage buckets are not used: they expire and are deleted.
- `telegram`: outbox rows by state.

Channel attribution: a run is `whatsapp` or `telegram` when that channel's inbox row carries its `runId`, or its `requestId` within the bound conversation (channel turns reuse the inbox request id, which also covers runs still running). Everything else is `in_app`; the ledger cannot separate the web dashboard from the mobile app. Only LIVE, non-purging businesses count. The response is validated against a strict schema before it is sent; drift fails closed.

The read role needs SELECT on these columns. Not yet granted; requires owner approval and must be run by the database owner against the target database (role name as verified for that database):

```sql
GRANT SELECT ("id", "conversationId", "actorUserId", "requestId", "status", "startedAt") ON "AssistantRun" TO oversight_reader_20261004;
GRANT SELECT ("id", "tenantId") ON "AssistantConversation" TO oversight_reader_20261004;
GRANT SELECT ("runId", "tenantId", "createdAt", "requestClass", "provider", "model", "outcome", "inputTokens", "cachedInputTokens", "outputTokens", "totalTokens") ON "AssistantUsageEvent" TO oversight_reader_20261004;
GRANT SELECT ("id", "runId", "requestId", "bindingId") ON "AssistantWhatsAppInbox" TO oversight_reader_20261004;
GRANT SELECT ("id", "conversationId") ON "AssistantWhatsAppBinding" TO oversight_reader_20261004;
GRANT SELECT ("id", "inboxId", "runId", "state", "createdAt") ON "AssistantWhatsAppOutbox" TO oversight_reader_20261004;
GRANT SELECT ("id", "outboxId", "state", "startedAt") ON "AssistantWhatsAppAttempt" TO oversight_reader_20261004;
GRANT SELECT ("attemptId", "status", "providerOccurredAt") ON "AssistantWhatsAppReceipt" TO oversight_reader_20261004;
GRANT SELECT ("id", "runId", "requestId", "bindingId") ON "AssistantTelegramInbox" TO oversight_reader_20261004;
GRANT SELECT ("id", "conversationId") ON "AssistantTelegramBinding" TO oversight_reader_20261004;
GRANT SELECT ("inboxId", "state", "createdAt") ON "AssistantTelegramOutbox" TO oversight_reader_20261004;
```

Column grants keep message content, phone/sender identifiers and payloads unreadable. `Tenant` (`id`, `dataClassification`, `qaPurgeStartedAt`) is already in the reader's scope. Until the grant is applied the endpoint returns the sanitized 503, which Oversight must show as unavailable, never as zero.

## QA data (Oversight QA page) — 13 November 2026

`POST /api/office/qa` on the main API lists QA testers' businesses with counts and deletes one tester's QA businesses (all of them, or selected ones). Requests are signed with `OVERSIGHT_QA_KEY` (HMAC envelope, header `X-Oversight-Signature`, 60-second window); the key must be at least 32 characters and differ from the read and privacy keys. The route answers 404 on a production runtime: QA never runs in production.

Hosted setup: `OVERSIGHT_QA_KEY` is set on Vercel `ewatrade-api` for Preview (branch `preview`) only, and in the local `.env.preview`. Oversight's Production project holds the same value as `EWATRADE_QA_PREVIEW_KEY`, with `EWATRADE_QA_PREVIEW_URL=https://preview-api.ewatrade.com/api/office/qa`. Development has no hosted API, so hosted Oversight shows Development as not connected; a local Oversight can point `EWATRADE_QA_DEVELOPMENT_URL` at a local API.
