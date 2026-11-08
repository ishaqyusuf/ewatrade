# EwaTrade Paystack sandbox setup — 8 November 2026

Status: real test merchant/catalog prepared; web checkout and receipt activation
remain disabled. No customer, charge, subscription, refund, deployment or live
financial setting was created/changed. This follows source commit `70effe0b5`.

## Merchant and company identity

The initial signed-in account showed only Plotkeys 1778537. The owner chose a
separate EwaTrade merchant and personally submitted its creation. The browser then
showed EwaTrade 2096714, Nigeria, Test Mode, Starter Business, compliance 0/5. Plotkeys
was not renamed, reconfigured or used for the integration. No agreement, bank,
identity or registration document was submitted by the agent.

Owner asked whether Zeroes and One can remain the parent. Paystack supports
separate products/websites/brands under the same legal company and distinguishes
trading from legal names. EwaTrade's current legal source identifies
ZEROES AND ONE TECH HUB NIG LIMITED (RC9264386) as operator. Before live approval,
use the registered-company compliance route, matching company registration and
corporate settlement account. The current Starter selection is not accepted as
proof of company compliance. USD settlement remains deferred until Zenith/Paystack
approve the domiciliary account; no USD price was invented.

## Real provider setup

- Used the existing visible EwaTrade test secret, without generating/rotating keys.
  It is stored in ignored `.env.local` under the scoped
  PAYSTACK_SUBSCRIPTION_SECRET_KEY name with mode 0600; the generic key name is not
  retained after setup; neither key
  nor fingerprint was printed, included in command arguments or committed.
- Initial authenticated test plan inventory:0. Created the six approved NGN monthly
  plans below, one POST each, and fetched each saved plan afterward. Every fetched
  offer matches integration2096714, domain test, currency NGN, monthly interval,
  approved amount and invoice_limit0 (unlimited). No automatic POST retry.
- A private in-flight setup journal is saved before each provider mutation; an
  uncertain outcome requires inventory reconciliation instead of blind creation.
- Browser Plans view independently lists all six as Active/Monthly, with0
  subscriptions and NGN0 revenue. Private proof screenshot:
  `/private/tmp/ewatrade-paystack-test-plans.png` (not committed).

| Saved test plan | NGN / month | Paystack plan code |
| --- | ---: | --- |
| EwaTrade Starter Africa NGN Monthly | 5,000 | `PLN_6luva4xxltk8y2v` |
| EwaTrade Growth Africa NGN Monthly | 15,000 | `PLN_cckxvnyalh1gsze` |
| EwaTrade Pro Africa NGN Monthly | 30,000 | `PLN_u3ot2si0a7f58w0` |
| EwaTrade Starter International NGN Monthly | 6,000 | `PLN_esdtm4l6lhaf72k` |
| EwaTrade Growth International NGN Monthly | 18,000 | `PLN_s6yqt43hbj3jpa0` |
| EwaTrade Pro International NGN Monthly | 36,000 | `PLN_y65lckbq62btzso` |

The validated private product mapping covers the application's89 supported country
choices:54 Africa choices at the approved base,35 others at +20%. Country binding
remains server-reviewed per owner; there is no locale/IP fallback or new country
support decision. Actual USD plans are not created.

The local profile has the real test key/catalog and sandbox mode, while
WEB_BILLING_ENABLED, WEB_BILLING_RECONCILIATION_ENABLED,
WEB_BILLING_RELEASE_APPROVED, PAYSTACK_INTERNATIONAL_ENABLED and
PAYSTACK_USD_ENABLED are all false. OWNER/STORE flags are unchanged. No owner
territory binding was invented. Local configuration was parsed through the existing
root environment loader and pricing schema;6 mappings pass and both checkout and
reconciliation refuse activation.

Read-only Vercel API Preview inventory:73 environment variables, no existing
Paystack/WEB_BILLING names. No hosted environment values were exported or changed.
Paystack Test Callback/Webhook fields were blank and remain unchanged. Test-mode
Preferences showed NGN/Card and other channels but did not establish live
international-payment approval. No account channel, security, payout or logo
setting was changed.

## Safety regressions and fixes

1. Before the follow-up, a valid provider key plus global owner billing enabled
   could enable reconciliation without a dedicated web-receiver activation. A
   source regression reproduced this. New checkout and reconciliation now require
   WEB_BILLING_RECONCILIATION_ENABLED=true independently of the native flags.
   Turning off only new checkout afterward can still leave verified receipts
   processing, once the receiver has explicitly been enabled.
2. A refunded/cancelled paid period did not imply Paystack stopped future billing.
   The old code allowed another web checkout; a source fixture reproduced it.
   Preparation now retains that billing reservation until provider non-renewal is
   verified, even while paid access is cancelled.
3. The same cancelled/expired-but-renewable Paystack state could admit a fresh
   native receipt. A pure policy test reproduced the missing conflict. A shared
   purchase-slot projection now drives native catalog/provider conflict checks,
   separately from paid access. The canonical mapper reads the existing
   cancelAtPeriodEnd column; no schema change. Refunded access remains Free;
   provider reservation is not an entitlement grant. Existing native active,
   suspended, expired and reviewer-environment rules retain their behavior.

The canonical release configuration treats dormant generic/scoped Paystack keys and
WEB_BILLING_ENVIRONMENT as dormant-provider optional names, with default-off
runtime checks remaining mandatory. This permits an Apple-only rollout without
fake credentials, disabling env checks or activating Paystack. The Apple coordinator
owns its separate reviewed global OWNER/STORE settings, API rollout and archive.
No deployment or source freeze is implied by this receipt.

4. Subscription credentials are scoped to PAYSTACK_SUBSCRIPTION_SECRET_KEY. They
   neither activate existing domain/collection gateways through their generic key
   nor inherit a different merchant's PAYSTACK_SECRET_KEY. A source regression
   verifies generic-key refusal and correct scoped test/live mode matching.

## Verification

- Both initial guard regressions failed against the preceding implementation;
  the native refunded-slot regression independently failed before the shared fix.
- Full payments 81 tests/516 assertions pass; includes sandbox and Production modes
  with OWNER_BILLING_ENABLED=true and STORE_BILLING_ENABLED=true. Even with valid
  fixture keys/new-checkout/release flags, web receipt processing and checkout stay
  denied until the independent receiver flag is true. No live/provider call in
  these source tests.
- Owner policy/review environment/checkout journal and actual Hono webhook fixture:
  43 tests/188 assertions pass. Delegate serialization is not PostgreSQL locking
  acceptance. Actual saved-plan GET verification above is real provider evidence,
  not a charged transaction or subscription lifecycle acceptance.
- Final type/source/assistant checks are recorded below when complete. Earlier
  unchanged Dashboard/ordinary local smoke evidence remains in the `70effe0b5` receipt;
  no frontend source changed here and no extra ordinary UI matrix is run.

## Remaining acceptance and boundaries

Hosted matching API/web code and private Preview configuration; a real owner billing
country/account binding; end-to-end hosted checkout and signed receipt delivery;
real DB concurrency, lifecycle/dispute/courtesy/recovery acceptance; company
activation and international approval remain open. The owner submits any test
payment directly; the agent does not submit a sale/payment or manufacture a QA
fixture. USD and live activation remain separate and deferred. The original task
remains 2/4 accepted (50%): audit and focused local verification, with accepted
hosted checkout/provider readiness still open despite the completed test catalog.

## Sources

- [Separate businesses/products under one registered company](https://support.paystack.com/en/articles/10643330).
- [Trading versus legal business names](https://support.paystack.com/en/articles/10264642).
- [Registered-company bank and activation requirements](https://support.paystack.com/en/articles/2125506).
- [Paystack plan contract](https://paystack.com/docs/api/plan/).
- Company identity: `packages/utils/src/legal-documents.ts`.

## Final checks and Brain impact

Final scoped fast plan/run used exactly the14 owned paths below, excluding the
concurrent account-privacy implementation:284 tests/1813 assertions pass. Full
payments and API types pass after the scoped credential change; DB full types
passed on unchanged owned runtime source before the concurrent privacy work.
`git diff --check` passes. The canonical private readiness check confirms the
scoped key/catalog configured, generic key absent, and checkout/receiver/USD/
international activation all false, including with global native flags enabled.

H01 coverage and H02 impact passed before concurrent privacy implementation.
The final shared-worktree rerun reports stale coverage and a missing schema
documentation decision from that separate implementation. No schema/RPC changed
in this follow-up. Those shared failures are preserved and handed to the privacy
owner; no snapshot or schema impact was regenerated on its behalf. These results
are source verification, not hosted or paid acceptance.

Brain impact checked and updated (local-only, ignored):
- `.brain/BRAIN.md`
- `.brain/tasks/in-progress.md`
- `.brain/features/owner-wide-billing.md`
- `.brain/features/retail-ops-subscription-packaging.md`
- `.brain/api/contracts.md`
- `.brain/api/permissions.md`
- `.brain/database/schema.md`
- `.brain/decisions/2026-11-08-web-paystack-only.md`

Owned source byte identity for the checks above:

| Source | SHA-256 |
| --- | --- |
| `release.config.ts` | `097cbbf191203bea22c78510dd74e0ee0af6ae6c11b0d085deb64fad493b7bb6` |
| `packages/payments/src/web-subscriptions/config.ts` | `f56edbe1863ceb1775976de11009e6a3ea34dadc71404e43a7d004e3dae35bba` |
| `packages/payments/src/web-subscriptions/web-subscriptions.test.ts` | `c5e54978f7fbaae68e73eb40f5c7081affa902aca69789af9b5dcb1b6faeafb7` |
| `packages/db/src/queries/owner-billing/policy.ts` | `05324d322b28e36eb8a059e3dad38e1c13345eb8cbf46d825689be4a339632de` |
| `packages/db/src/queries/owner-billing/prisma-repository.ts` | `3713dc00368001a074132802e56179f566e4322db25194a7d05f4b7805791058` |
| `packages/db/src/queries/owner-billing/purchases.ts` | `59f810f7cc2e7b5e2f07f01c7066f7273243541e9da6418aed7d08e228d4f02a` |
| `packages/db/src/queries/owner-billing/owner-billing.test.ts` | `69ea55e61e0ccdeeb4e59e17019ea200b03f650193df8c64bcb6e4018c93e9be` |
| `packages/db/src/queries/owner-billing/web-checkout.ts` | `4099c42ff4d4387d9dde3034fe91dd93b0e5ecad7439dd6aefbfb9d5e282e604` |
| `packages/db/src/queries/owner-billing/web-checkout.test.ts` | `3eb7d68a424ff8520b8e60004aeaeb3460bf4558e03963311c57e90a042d0662` |
| `apps/api/src/billing/web-subscriptions.ts` | `7916d9efe89bf9dbc00529579a8f93031d5b6769a71859e30e44f1f2a18aef77` |
| `apps/api/src/billing/paystack-subscription-webhook.ts` | `7ec0ddf49edef1c25f7fb926d2965be6449febe8ccb2f96481897231dbe0afaa` |
