# 03 - Migrate Service Requests To Commerce Quotes

**What to build:** Move the existing Service Request quote, customer approval, and order-conversion journey onto the Commerce-owned Quote model without changing its supported user experience or weakening current permissions and audit behavior.

**Blocked by:** 02 - Expand Commerce-Owned Quote Model

**Status:** implemented-source; migration reconciliation pending

- [ ] Creating or revising a Service Request quote writes immutable Commerce Quote versions linked through a typed Service Request source.
- [ ] Existing dashboard quote drafting and customer quote pages read the Commerce Quote contract.
- [ ] Service quote approval remains idempotent and produces the same Commercial Order behavior as before migration.
- [ ] Existing public tracking links, expiry behavior, decline paths, notifications, permissions, and audit events remain operational.
- [ ] A safe migration/backfill path handles existing Service Quote records without losing historical versions or accepted-order links.
- [ ] Compatibility code is isolated and explicitly marked for removal by ticket 10.
- [ ] Regression tests cover the complete existing Service request-to-order lifecycle before and after migration.
