# Manual banking MB-01 implementation contract

28 October 2026. Owner authorized implementation using multiple managed threads,
including unfinished base work, with exact Claude Opus 5.5/high for design
implementation and focused verification. Work in current main checkout; no
worktrees, push, deployment, real sends or provider activation.

## Design and requirements

Owner continuation/get-started accepts Banking02 v18 for implementation. Selection
recorded before edits: `9a15dd1d-5612-4d02-8835-e7547d0d6d8e`.
Canonical review: https://workshop.localhost/ewatrade/finance/business-banking/directions/02?rev=9a15dd1d-5612-4d02-8835-e7547d0d6d8e&screen=index.html
Engineering authority: manual-payment-receipt-assessment-plan.md, all eight
milestones.143 scenario IDs/16 groups retain baseline evidence and MB-01 delta
status. Design mocks are guidance; authoritative money/security contracts prevail.
Preserve implemented controls and previous accepted no-phone message draft flow.

## Ownership and implementation layers

| Worker | Exclusive implementation paths | Shared handoff |
| --- | --- | --- |
| Customer payment UI | apps/dashboard/src/components/public-payment/** | Payment backend DTO, customer proof/funds DTO |
| Merchant dashboard UI | apps/dashboard/src/components/business-banking/** and customer-ledger/** | Existing tRPC queries; no backend/schema edits |
| Mobile UI | apps/mobile/src/components/mobile/payment-links/** and customer-ledger/** | Existing thin routes, no shared UI redesign |
| Payment backend | apps/api/src/banking/**, schemas/business-banking.ts, trpc/routers/business-banking.ts; packages/db/src/queries/business-payment-links.ts and new manual-payment query files; new receipt assessment modules under packages/payments/src and jobs handlers/tasks | Publish DTO names/fields before consumer wiring; propose Prisma changes to root |
| Customer funds backend | packages/db/src/queries/customer-ledger/**; apps/api/src/schemas/customer-ledger.ts and trpc/routers/customer-ledger.ts; new funds-specific utility files | Publish credit/refund DTO and proof contracts; propose Prisma changes to root |
| Coordinator | All Prisma/schema/migration/generated changes, shared exports, assistant impact/coverage, cross-worker bridges, this contract and global Brain indices | Single schema and connected-check owner; serialized reviewed commits |

Routes/order pages outside exclusive ownership require a path claim in this
contract/Agent Chat before editing. Workers never stage/commit another worker's
files. Freeze and report owned changes; coordinator reviews and commits each
coherent slice serially. No Git resets/stashes/branch switches. Preserve unrelated
work. Local worker packets live in .brain/tasks/manual-banking-mb01/.

Managed UI threads are Codex supervisors launching the installed Claude CLI with
exact `claude-opus-5-5`, `--effort high`; verify stream init/model and command
settings. Do not call these native Claude managed threads. Do not silently
substitute a model. Keep live process/session handles and avoid duplicate launches.

## Shared domain contracts

- Currency amounts are integer minor units; returned JSON cannot contain bigint.
- paymentReference: saved per payment attempt, unique/stable across retries, separate
  from bankReference/validated transfer identity, never an authorization token.
- Receipt assessment has explicit pending/checking/complete/unavailable states,
  structured extracted fields with unknown values, deterministic findings and
  source/generation version. No model output mutates money or confirms settlement.
- Receipt digest alone is not a financial transfer ID. Re-upload/retry of a pending
  report must recover; strong transfer deduplication atomically prevents consuming
  a confirmed transfer twice across supported posting paths.
- Merchant confirmation binds report/version, actual received amount/account/date,
  verified identity and allocation. Payment verified appears only for canonical
  saved funds confirmation, never for a receipt/reference match.
- A single receipt R conserves R=A+E. Existing-credit application is allocation of
  previously held money, not new cash. Preserve Customer/business/currency/source.
- Public link possession is insufficient customer identity for credit disclosure,
  spending or refund destination control. Use existing canonical proof/session
  mechanisms, otherwise add a narrow purpose-bound proof. No token in metadata.
- Customer credit is positive available held funds excluding refund reservations.
  Known zero hides the row; loading/error/unverified is not zero. Explicit review
  binds the current credit/order snapshot before debit.
- Refund request, approval/reservation and actual return are distinct. Finance
  Owner/Admin only initially; encrypted/minimized destination and source-aware
  mixed tender; no double restoration/cash refund. Cancellation releases reserves.
- Provider-neutral adapters preserve manual financial identities; disabled/unset
  AI or transport provider degrades truthfully to manual workflow. No fake analysis
  or UI-only financial success. Never send live customer receipts to a provider
  without the separately approved processor/data admission policy.

## First wave and dependencies

1. Publish API/DTO and schema proposal packets; preserve current consumer behavior.
2. Implement base no-phone WhatsApp number entry/draft, references and business
   confirmation provenance first. UI workers may independently fix base gaps.
3. Assessment, deduplication, excess/credit/refund modules can be prepared in
   parallel. Wire consumers only to real server contracts; never temporary `any`,
   browser-owned balance or model-owned settlement.
4. Coordinator applies agreed schema through normal local migrate and push once
   per coherent schema change, generates normal client; then workers wire modules.
5. Verify each integrated money path and record exact scenario/commit/evidence.

## UI/Midday conformance

Retain original bank/copy/inline payer reveal/confirmation footer/WhatsApp draft.
Dashboard workers compare nearest Midday invoice/customer/transaction patterns:
thin route prefetch/hydration, domain components, URL-owned sheet/table state,
forms and mutation invalidation, loading/error/empty states. Existing EwaTrade
payment-review sheet and customer-ledger command runner are integration anchors.
Public payment is a narrow token page, not a new merchant table. Native uses
existing full-screen forms/keyboard-safe sheets and shared search footer; no
copy of web HTML. Each worker records exact source/reference comparison in packet.

## Verification budget and outstanding base acceptance

Offline doctor and test:quick --plan passed at start. Workers run only owned
format/type checks and meaningful local regression tests. Coordinator runs one
integrated focused source check; don't repeat full monorepo tests/builds, deploys,
matrices or DB scans. Required money/permission/replay/concurrency proof remains.
One representative rendered flow per changed platform; native receipt opening,
share cancellation and foreground refresh remain owner manual acceptance unless
current tool capability actually exposes that device. Earlier passing external
partial/reject/final settlement/reload and notification SQL proof is reused when
source invariants are unchanged. No fixtures/live payments to manufacture smoke.
Live alert transport/policy/socket target and release readiness are tracked pending;
provider activation and deployment require their own authorization.

## Progress

- [x] Baseline and ownership/contract established; exact Workshop selection recorded.
- [x] Six managed workers used; Opus settings verified and remaining Codex UI explicitly authorized.
- [x] Base no-phone/draft implementation completed; manual/provider acceptance remains tracked.
- [x] References/confirmation increment integrated and committed.
- [x] Receipt checks/deduplication source integrated; provider admission remains disabled.
- [x] Excess/credit/refunds integrated with canonical money/proof invariants.
- [x] Focused source/types/money checks, assistant impact and Brain evidence recorded.
- [x] Workshop implementation receipt recorded against final source commit e54f51ccb.
- [ ] Provider/hosted/native manual acceptance before a separately authorized release.

This coordination checklist is not the feature milestone denominator. Original
planning4/4/design5/5; eight product milestones are now in progress, none accepted
complete until its recorded exit criteria passes. Global Finance progress is not
recomputed from these local milestones.

## Narrow Order balance bridges, 28 October 2026

Dashboard UI additionally owns orders/overview/order-overview.tsx only as a bridge
to its customer-ledger balance component. Native UI additionally owns
mobile/order-detail/order-detail-screen.tsx and, only where necessary, classic
order-detail-content.tsx/order-detail-screen.tsx for the matching narrow prop.
Positive available customer credit is shown on the Order before a new payment
link; zero/no account remains hidden. Read uses Finance-only orderCustomerFunds,
derives scope from Order server-side, subtracts holds, and never creates accounts.

## Parallel mixed-source Order-return UI ownership

Managed supervisor01a182ec-521b-72d1-afc7-69d56793407e owns only dashboard
orders/overview/order-money-dialogs.tsx RefundDialog bridge plus new
customer-ledger/order-returns/**; native order-detail/order-change-sheet.tsx
refund bridge plus new customer-ledger/order-returns/**. Existing UI workers
retain their other paths. Actual Finance-only orderReturnReview supplies canonical
source eligibility; returnOrderFunds composes original-credit restoration and
ordinary cash return through the existing durable command runner. Exact Opus5.5/
high CLI implementation, no redesigned shell or duplicated financial command.

## Explicit remaining-UI model authorization, 28 October 2026

After verified Opus5.5 quota429/reset18:00Lagos, owner explicitly answered:
“Let Codex finish the remaining UI.” Completed Opus source/history is retained;
remaining public pre-submit/refund fields, mixed Order returns and final review
corrections may be completed by Codex in the same selectedv18 design. This changes
only the remaining implementation model, not ownership/schema/commit/release
boundaries. Mixed native UI worker also owns thin app/order-return/[orderId].tsx.

Owner communication preference,28October2026: after every major milestone provide
a checklist and percentage progress breakdown, distinguishing source implementation
from provider/acceptance/release gates. Estimates are not measured test coverage.

## Recorded source handoff

Final integrated UI source commit: `e54f51ccb`. Exact Workshop revision remains
`9a15dd1d-5612-4d02-8835-e7547d0d6d8e`; implementation evidence record
`7980e734-6846-4d6b-96b0-99b661dfe7ee` reports source/local implementation and
explicitly excludes live/provider/native device acceptance.143 updated design
scenarios and80 unchanged scenarios retain their history. Local scenario tracker
links each case to the candidate commit; no individual runtime verification is
inferred from source presence or the Workshop badge. Overall delivery estimate81%;
committed source work complete, provider evaluation/admission and release checks
remain separate. No push, deployment, real receipt/model processing or payout.
