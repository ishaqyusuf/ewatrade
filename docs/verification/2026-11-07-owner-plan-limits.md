# Owner plan limits and downgrade verification — 7 November 2026

Scope: shared/mobile limits, server admission checks, versioned owner signup,
retained operation access after lapse, and verified Play grace projection.

- Offline QA doctor passed; root local profile isolation was checked without a
  connection. Existing foreign `AGENT_CHAT.md` and staged explainer edits remain
  excluded from this task.
- Focused source tests passed: 67 tests / 270 assertions across six files. They
  cover catalog parity, nullable Pro limits, legacy grant preservation, cohort
  retries, paid cap enforcement, expiry and renewal, held/revoked provider state,
  preserved operational access, blocked new staff/products/orders, ownership loss,
  release, and separate-business allowance.
- One bounded guarded-Neon integration test passed (2 assertions, about 8 seconds):
  concurrent first-business admission uses one Free slot. It used a newly created
  QA user and at most one empty QA Tenant and cleaned up those exact records.
  Root profile loading and production-target isolation ran before the test; the
  documented `ewatrade_qa_v1` target and expected Neon host were checked. No sale,
  payment, provider receipt or customer record was created. This is PostgreSQL
  lock evidence, not signed checkout or provider lifecycle acceptance.
- Earlier source runs correctly failed old 2-product/30-order/free-launch-label
  expectations. They were updated to the owner's approved contract; substantive
  expiry/admission/grant regressions were added. No failing check was suppressed.
- Final types, owned-path fast smoke and H01/H02 results are recorded below after
  execution. Mobile types already passed after the core integration.

No schema changed, so no Prisma migration/push was required. Existing record
update and staff membership paths were reviewed: quota guards remain on new
admissions. No bulk migration, feature-flag activation, deployment or store form
change occurred. Existing higher legacy/manual grants deliberately remain valid.

Live Play five-day base-plan configuration, signed renewal/hold/refund tests and
native paid UI acceptance remain open. Android A01–A08 remains 1/8 accepted.
