# 03 - Migrate Service Requests To Commerce Quotes

**What to build:** Move the existing Service Request quote, customer approval, and order-conversion journey onto the Commerce-owned Quote model without changing its supported user experience or weakening current permissions and audit behavior.

**Blocked by:** 02 - Expand Commerce-Owned Quote Model

**Status:** implemented-source; migration reconciliation pending

**Verification note (2026-08-09):** Service Request issue, list, public-read,
and acceptance paths now use the Commerce Quote aggregate. A synthetic two-version
legacy Quote proves that immutable lines, the current version, acceptance identity,
token digest, and accepted Order link survive the backfill, and an identical rerun
is idempotent. A profile-attested Neon test also creates a current Service Offering
and public Request Form, replays the public submission, issues and reads the
Commerce Quote, replays acceptance, and verifies the converted Request and exact
Commercial Order. The verified Neon development dataset contains no legacy rows,
so production reconciliation remains open; ticket 10 owns compatibility removal
after that rollout.

- [x] Creating or revising a Service Request quote writes immutable Commerce Quote versions linked through a typed Service Request source.
- [x] Existing dashboard quote drafting and customer quote pages read the Commerce Quote contract.
- [x] Service quote approval remains idempotent and produces the same Commercial Order behavior as before migration.
- [x] Existing public tracking links, expiry behavior, decline paths, notifications, permissions, and audit events remain operational.
- [x] A safe migration/backfill path handles existing Service Quote records without losing historical versions or accepted-order links.
- [x] Compatibility code is isolated and explicitly marked for removal by ticket 10.
- [x] Regression tests cover the complete existing Service request-to-order lifecycle before and after migration.
