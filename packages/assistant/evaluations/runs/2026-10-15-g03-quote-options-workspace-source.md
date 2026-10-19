# G03 Quote options and pure workspace source checkpoint

15 October 2026, 16:28 UTC source observations. Source-only checkpoint; **full G03
remains open and parent acceptance remains 13/45 (28.9%)**. Root independent review
of these final repaired source hashes and integration checks remains pending.
This packet records bounded canonical work, not an accepted Quote issue/revise action.

Machine-readable companion:
`2026-10-15-g03-quote-options-workspace-source.json` in this directory.

## Delivered source seams

`commerce-quotes.ts` exports `ReadCommerceQuoteIssueOptionsInput` (native input
without trusted callbacks), `QuoteIssueSourcePreparationFact`, and
`readCommerceQuoteIssueOptionsInTransaction(tx,input)`. It returns current Store
currency, the existing source handler's `{alreadyQuoted}` fact, resolved options,
bounded suggestion coverage and semantic evidence. It does **not** assert complete
actor/source-operation authority, original current Quote/version identity, author
Terms, signed target digest, complete linked effects or overall release eligibility.
Protected callers must compose those before treating this as a confirmable review.

One private canonical resolver now supplies both the actual native issuer's new
version calculation and the pure read. Existing source preparation, normalized
options, immutable line/catalog/price snapshots and independent per-option totals
remain shared; alternatives are never added to included subtotals or other choices.
The writer still checks native exact replay and accepted current-version rules
before expensive new-version pricing. Existing payload hashes, prepared text proof,
private token and native wrapper behavior remain on their canonical paths.

The pure reader snapshots intent before awaiting, ignores wider native callback
fields, uses pure vertical policy evaluation and configured inventory reads. It
does not invoke trusted `authorize`/`protectActionId`, text screening, token creation,
nested transactions, policy audits, inventory upserts, Quote/source/approval writes,
messages or notifications. Nonclinical policy checks are retained; Pharmacy reads
refuse. It deliberately does not replace fresh membership/Store/attendant/compatibility
checks in an overall protected review.

The shared calculator checks exact whole-minor line products and nonnegative
integer unit/line/subtotal/adjustment/option amounts against the existing Prisma
Int32 storage maximum 2,147,483,647. No floating rounding or storage widening.
Full 20 options × 100 lines remain supported. Suggestion coverage explicitly names
all requested IDs, the first 100 unique evaluated IDs and unevaluated IDs. Evaluated
means the canonical helper's input window, not “has a suggested price”; missing
suggestions remain unknown. Evidence includes Offering kind/status/currency/scale/
Store availability, source-link/attestation/tracked-inventory facts and canonical
bounded price-suggestion snapshots. `catalogPriceEvaluationAt` is a read clock,
which a future stable digest must distinguish from meaningful effective dates.

The companion pure workspace seam exports
`getServiceCommerceWorkspaceAccessReadOnly` and
`evaluateServiceCommercePolicyBatchReadOnlyInTransaction`. Shared canonical workspace,
readiness and policy calculations now have a non-auditing branch. Ordinary callers
retain their existing policy READ audits. This preserves the workspace's existing
role/profile/provider/configuration/policy semantics; it does not newly verify
`Tenant.isActive` or scoped staff Store access. Those remain explicit outer authority
requirements. No workspace configuration, assignment or activation changed.

## Superseding Service source-line ownership repair

Initial options freeze `bd83def4…c7442` checked supplied Service source-line ownership
only during new-option preparation. Independent review found exact issuer replay
and pending approval release bypassed that resolver. Two focused actual-function
tests failed before the repair: replay resolved after supplied ownership disappeared;
pending approval released a historical version carrying a foreign Service source ID.

The final source factors the scoped check into Service `validateLines`, which those
existing paths already invoke. Distinct supplied IDs must belong to the exact
Request + Tenant + Store for every outcome, including unavailable/Offering-less rows.
Duplicates and valid substitutions on an owned source line remain allowed. Omitted
IDs do not cause the added ownership count; native same-Offering derivation is
unchanged, including its preexisting last-entry behavior with duplicate Offerings.
No claim that this fallback proves unique historical provenance is made.

After repair, removed/foreign supplied IDs refuse issuer replay before new writes;
restoring owned IDs permits exact replay without repricing. Invalid pending approval
uses the existing canonical superseded outcome before release/source/message effects.
Approved/rejected completed replay, public/customer original reads and every other
lifecycle path are not newly claimed to enforce this invariant.

Only two scoped `serviceRequestLine.count` stand-ins were added to the previously
frozen `commerce-quotes.test.ts` in this follow-up: prepared Service replay and pending
Service approval release. Comments explain the fresh reads; all prior coverage and
assertions remain. The old fixture failures were missing read delegates, not skipped
checks. Current source/test hashes below supersede the initial options freeze.

## Checks and provenance

Options owner ran the actual canonical functions with inert transaction stand-ins:

```sh
env -u APP_ENV -u DEV_PROFILE \
  STORE_CONVERSATION_TEXT_SAFETY_PROVIDER=qa-fixture \
  EWATRADE_DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:1/assistant_source_tests \
  bun --env-file=/dev/null test \
  ./packages/db/src/queries/commerce-quote-issue-options.test.ts \
  ./packages/db/src/queries/commerce-quotes.test.ts
```

Final **44 passed / 0 failed / 295 assertions**: new options 13/196 plus existing
issuance/invariant suite 31/99. The targeted pre-repair two-case run was 0 passed /
2 failed, establishing the replay/approval failures above. The new suite exercises
actual writer/read snapshot parity, legacy/default choices, independent alternatives,
all supported 2,000 rows, precise money/storage bounds, strict no-mutation readers,
pure policy/clinical refusal, source ownership/substitutions/duplicate fallback,
configured inventory versus ordinary upsert, exact manual attestations, private
Service source links, replay and pending supersession. Three changed code paths
pass scoped Biome; tracked source/test diff whitespace passes. No compiler was
started for this packet. Tool output is in this task history; no separate test log
file is invented here.

Workspace owner reported this independent scoped command:

```sh
EWATRADE_DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:1/assistant_source_tests \
  bun --env-file=/dev/null test \
  packages/db/src/queries/service-commerce-access.test.ts \
  packages/db/src/queries/service-commerce-policy.test.ts
```

Reported **27 passed / 0 failed / 242 assertions** (Bun printed four file sections
from two invoked paths). Four owned code/test paths pass scoped Biome. Cases compare
actual pure and audited calculations with mutation-denying transports: active/
disabled/suspended/missing profiles, inactive/missing Store, absent membership and
all seven existing roles, policy/provider/tracked-inventory readiness, Pharmacy
launch restriction, expired/revoked/jurisdiction policy and preserved ordinary audits.
The packager verified all four workspace file hashes against the owner's handoff,
inspected the pure branch and tests, and did not rerun that suite merely to refresh
numbers. This is attributed owner evidence, not root independent acceptance.

## Source hashes (SHA-256)

| Path under `packages/db/src/queries/` | Hash |
| --- | --- |
| `commerce-quotes.ts` | `d72e3f3375c689736dee9b189aa555af3b1b582ceeaf92b542add9cce4f93abb` |
| `commerce-quotes.test.ts` | `6c24dd9d2c5533bd6d3a4b1bc1b453195587510b932da89cb8d1a299377a5a6b` |
| `commerce-quote-issue-options.test.ts` | `29abd26344c1fae7df2fc4bd32f8231c67fedb72293bdc54aec3b920bbe237b1` |
| `service-commerce-access.ts` | `0f3a74d951397112379bb7c6f5066969e91071210db3e84316f46950f85e95ed` |
| `service-commerce-access.test.ts` | `828d53fd4daa1b5c9f708142bb5d513bf427203b59868290c443c41c60a909b8` |
| `service-commerce-policy.ts` | `51cc0b21a2d6226aaf1145ab7a13e066756a0b9de723c2510f6eb925e15e8c98` |
| `service-commerce-policy.test.ts` | `79bfb903512bcc878e2770f91571a0a1321f45bf0b13c2aa2c990506686c85ed` |

## Remaining work and unchanged gates

Root's full protected authority/current-Quote/Terms/release review and stable digest
module, strict GENERAL issue/revise contracts, server operation identity allocation,
outer confirmation preflight across entrypoints, secret-free receipt/exact original
and complete native/dashboard editor integration are **not delivered by this packet**.
The separate prepared issuer linked-label proof repair has its own evidence; existing
approval/no-proof paths still require their own outside-transaction moderation
composition. This packet cannot establish blanket provider-free execution for G03.

Source tests do not prove real PostgreSQL isolation/rollback/concurrency/collation,
HTTP transport, transaction duration for full 2,000-line cases, actual moderation,
provider notification/delivery, signed saved-chat recovery, native device journeys,
second-vertical acceptance or release. Synthetic writes never commit a real DB;
no fixture is represented as a connected business run. Root independent final
review/compiler/export/integration checks remain pending for these final hashes.

G01 connected QA stays human-paused; Paystack stays paused; D04's 12 conditional
cases remain unscheduled under the existing authorization fingerprint; E05 activation/
restart remains rejected; G04 deferred sections, S05 unscheduled retry and other
signed/target/client gates remain. No provider/model/DB/schema/runtime/browser/device/
activation/restart/deployment action occurred in these bounded source assignments.
Parent accepted count remains 13/45; neither source suite is a parent acceptance.

Brain/impact/checklist reconciliation belongs to root. This evidence packaging changes
only this new report pair; it does not release another owner's files or amend the
existing gates. Full G03 and phases 4–12 remain active.
