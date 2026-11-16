# Kuda Business connection, payments and payouts in EwaTrade

Implementation plan prepared 16 November 2026. The merchant owns their Full
Kuda Business account, generates their own API key in Kuda, and connects that
account from the EwaTrade dashboard. Customers can pay into the merchant's
Kuda account. EwaTrade shows Kuda's available balance and bank activity. An
authorized merchant can send NGN to an eligible Nigerian recipient from that
account through EwaTrade. Kuda holds the funds and executes the transfer.
EwaTrade prepares, authorizes, tracks, records and reconciles it.

This is a 15-ticket implementation plan. A first pilot covers one connected
main account per business and one immediate transfer at a time. A recipient may
be a supplier, the business's own account, or another eligible bank account.
A supplier bill is optional. Selecting connected Kuda for an order or service
payment requires a bank-verified credit before marking it paid. Bulk payouts,
payroll, scheduling, automatic sweeps and wallet issuance are later work.

## Product flow and authority

1. The owner opens **Connect Kuda Business** in the dashboard. If they need an
   account or API access, EwaTrade guides them to Kuda for Full Business
   registration, verification and Business API onboarding. Returning owners
   connect the environment-specific key and business email through a protected
   settings form. EwaTrade verifies the main account with read calls and shows
   masked account details, connection status, Kuda's available balance and
   recent activity. A credit or debit initiated in Kuda appears after sync.
2. In the dashboard, mobile app or assistant, an authorized user starts
   **Send money**. EwaTrade verifies the recipient with Kuda and shows the
   source account, verified name and bank, masked account number, amount,
   fee and total debit. Users can choose an accounting purpose independently
   of where the money goes.
3. An owner or admin with current payout approval authority verifies their
   identity again in EwaTrade and approves that exact review. Reuse a supported
   sign-in method for the pilot so passwordless accounts can approve. A
   personal EwaTrade payment PIN is a future option. The Kuda transfer API
   documents server authentication and leaves user confirmation to the
   integrating application. [Kuda authentication](https://business-support.kuda.com/en/articles/15363774-how-to-authenticate-kuda-business-api-requests) · [Transfer guide](https://business-support.kuda.com/en/articles/15363775-making-a-transfer-with-the-kuda-business-api) · [Integration guide](https://business-support.kuda.com/en/articles/15363772-integrating-the-kuda-business-api)
4. EwaTrade queues the approved transfer once and checks its outcome with
   Kuda. The user sees **Sending**, **Pending bank confirmation**, **Sent**,
   **Failed**, or **Reversed** as appropriate. A timeout stays pending until
   reconciled. The ledger records provider-confirmed money movement exactly
   once. WhatsApp drafts continue into authenticated EwaTrade review.
5. When staff select connected Kuda on an order or service and press
   **Confirm payment**, the order shows **Checking payment** while EwaTrade
   looks for a matching bank credit. A verified, uniquely matched credit is
   applied automatically. An unavailable feed, a missing credit or an
   ambiguous match leaves the order unpaid. Cash and manually recorded bank
   accounts keep their existing confirmation flow.
6. The connected account's balance comes from Kuda. An order payment changes
   the accounting records and cannot change the Kuda balance tile. A Kuda-app
   payout leaves a bank debit that the merchant can classify or match to
   something already recorded.

| Action | Initial authority |
| --- | --- |
| Connect, replace or disconnect credentials and stop payouts | Business owner after fresh identity verification |
| Prepare a payout | Owner, admin or manager with current business and financial scope |
| Approve a payout | Owner or admin with explicit current payout authority, eligible connection and fresh identity verification |
| Submit an approved payout | Authorized server worker bound to a durable, scoped approval |
| Review transfer history | Existing financial read authority and its applicable business and store scope |
| Review or match account activity | Existing account and reconciliation permissions within the applicable business and store scope |
| Request a connected Kuda payment check | Existing permission to record a payment for the exact order or service |
| Apply a matched credit | Authorized server command consuming verified bank evidence for the scoped request once |

## Existing implementation to reuse

- [Payout rules](../../packages/payments/src/payout-intent.ts) already define
  approval roles, an exact review, step-up, stable references and state rules.
  Review provider assumptions before using their status mapping for Kuda.
- [Payout Prisma models](../../packages/db/prisma/models/collections-payouts.prisma)
  already preserve approval, provider events, and posting/correction evidence.
  Their required supplier, bill and provider recipient code reflect the earlier
  supplier-only Paystack shape. The general sending decision calls for validated
  optional purpose links, intact supplier references and compatibility with
  any earlier records. Kuda name enquiry and transfer use bank details.
- [Finance router](../../apps/api/src/trpc/routers/finance.ts) and
  [bill write layer](../../packages/db/src/queries/finance/bills.ts) provide
  established accounting entry points. Reuse source-aware settlement after
  verified payout success. The assistant's
  [existing record-a-transfer action](../../packages/assistant/src/general/prompt.ts)
  remains separate from live sending.
- Reuse EwaTrade's [statement normalization rules](../../packages/utils/src/finance-bank-statement.ts)
  and existing reconciliation concepts where they fit. Preserve distinct
  provider evidence and Finance entries, even when both refer to the same
  transaction.
- Reuse existing [manual payment and transfer consumption queries](../../packages/db/src/queries/manual-payment-transfer-consumption.ts)
  and the [manual banking contract](manual-banking-mb01-implementation.md)
  at the policy boundary. A connected Kuda attempt must obtain provider
  evidence before calling the existing payment/allocation writer.
- Keep the canonical money commands in the server domain. Follow EwaTrade's
  thin API route, Prisma query, shared payment logic and job boundaries.
  Dashboard, mobile and assistant share the same authorization and status
  contract. Use server-derived tenant, actor, book and store scope.

## Ticket order

| Group | Tickets | Exit |
| --- | --- | --- |
| Provider and product contracts | KBP-01, KBP-02, KBP-03 | Supported test flow, signed-off domain rules and exact design ready for implementation |
| Connection and transfer safety | KBP-04, KBP-05, KBP-06, KBP-07, KBP-08 | Vault-backed connection and test payout with once-only approval, dispatch and accounting |
| Bank balances, reconciliation and payment confirmation | KBP-09, KBP-10, KBP-11 | Freshness shown, bank activity reconciled, and the order marked paid only from a verified matching credit |
| Merchant surfaces and pilot | KBP-12, KBP-13, KBP-14, KBP-15 | Dashboard and mobile acceptance, assistant continuation and a separately authorized merchant pilot |

### KBP-01 — Verify Kuda API and pilot capabilities

**Dependencies:** None.

- Confirm the merchant-owned Full Business account path, test and live keys,
  main-account identification, production bank list, name enquiry, available
  balance, transfer submission and status query. Record which fields and
  responses prove source ownership, acceptance, final success and reversal.
- In Kuda's test environment, determine fee and tax disclosure, balance/limit
  checks, stable reference behavior, definitive not-found semantics, callback
  authentication and whether account team approvals or limits affect API calls.
  Verify balance fields and history coverage for credits and debits initiated
  outside EwaTrade, stable transaction references and pagination behavior.
  Confirm whether the merchant's approved use covers EwaTrade sending on their
  behalf. A separate per-key approval process is not assumed.
- **Acceptance.** Keep a sanitized provider evidence packet, exact test cases
  and an explicit list of unresolved live behaviors or commercial conditions.
  Test keys stay out of the packet. No real payment is required for this ticket.
  [Kuda go-live process](https://business-support.kuda.com/en/articles/17245261-kuda-business-api-testing-and-going-live) · [Status query](https://business-support.kuda.com/en/articles/15363780-checking-transaction-status-and-recovering-pending-payments)

### KBP-02 — Resolve payout permissions, purpose and Finance dependencies

**Dependencies:** None. Use KBP-01 findings as they arrive.

- Finalize banking entitlement, full Finance versus banking-only setup,
  verified source association, eligibility, store scope, and owner-only stop.
  Keep general domestic recipients as the scope. Resolve whether banking-only
  businesses use a minimal Finance Book or another approved posting contract.
- Define accounting for supplier bill settlement, a transfer between verified
  business-owned accounts, an expense, a personal withdrawal, and an outgoing
  payment whose purpose is still being classified. Decide which are enabled
  for the pilot. Do not turn an arbitrary payout into an expense or require a
  placeholder supplier or bill. Define fee treatment and who handles a mismatch.
- **Acceptance.** Review an action and role matrix, accounting posting matrix
  and examples for each supported purpose. Each example states how external
  success, fees, failure, reversal and manual records affect the balance or
  payable. Close open accounting, entitlement and risk-policy decisions
  before dependent behavior is enabled.

### KBP-03 — Design connection, review and history in Workshop

**Dependencies:** KBP-02 decisions required for review. Can begin alongside KBP-01.

- Start from the existing implemented Finance banking design and continue its
  established Workshop direction. Cover connection prerequisites, test/live
  distinction, masked credentials, reconnect/disconnect, verified recipient,
  transaction review, identity confirmation, pending/failure/reversal,
  receipts and transfer history. Use the existing app approval patterns.
- Design the dashboard and native flows and the WhatsApp handoff. Preserve
  the accepted surrounding design and stable WhatsApp case IDs. Use the
  existing private Site mirror in the same authorized WhatsApp design delivery.
- Show the distinct connected and manual payment options on orders and services.
  Design checking, not yet received, bank unavailable, ambiguous, partial and
  confirmed states with a clear return-to-order path.
- **Acceptance.** Record the exact owner-selected Workshop revision and
  affected case versions before product UI implementation. Follow the project's
  Workshop model, review, and approval rules in force when this ticket starts.

### KBP-04 — Store merchant keys in an encrypted vault

**Dependencies:** KBP-02.

- Use a managed encrypted secrets vault with a restricted payments-service
  identity. Store an opaque vault reference, source identity, environment,
  connection version and lifecycle metadata in the application database.
  Authorize before accepting the secret and isolate test from live. Request
  body capture, logs, analytics, model input, browser storage and ordinary
  support tooling must exclude secrets and access tokens.
- Prefer a narrow write path for setup and a narrow read path for execution.
  Route vault selection through server-derived business scope. Bind cached
  access tokens, if needed, to that business, environment and connection
  version. Implement replacement, disconnect, race recovery and orphaned
  secret cleanup. Document the effects of Kuda key rotation on other integrations.
- **Acceptance.** Demonstrate that another business, an unauthorized user and
  the assistant cannot read or select a vault secret. Replace and disconnect
  under concurrency, invalidate stale credentials, and prove structured audit
  events omit secret material. [Secrets management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

### KBP-05 — Implement the Kuda adapter and verified connection

**Dependencies:** KBP-01, KBP-04.

- Build the server adapter for token exchange, source account and balance
  readback, bank list, name enquiry, transfer and status query. Use bounded
  timeouts and stable error descriptions. Scope credentials per business and
  environment, mask account data in public responses, and treat a successful
  balance read as account verification only. Track payout readiness separately.
- Provide protected connect, verify, read status, replace and disconnect
  commands. Enforce one active Kuda main-account connection per tenant and
  environment for the pilot. Do not silently attach a new key to another
  business's verified bank source.
- **Acceptance.** Test disabled and invalid credentials, revoked and replaced
  keys, a cross-tenant account attempt, environment mismatch, unavailable
  provider and successful masked readback without moving money.

### KBP-06 — Build verified recipients, payout review and durable intents

**Dependencies:** KBP-02, KBP-05.

- Extend the existing payout contracts for general recipients while preserving
  historical supplier references. Keep a verified, versioned recipient view
  and only the protected bank details Kuda needs for execution. Store masked
  details for normal reads. Require exact recipient selection if a name is
  ambiguous and a new review after edits.
- Persist the exact tenant, source, recipient version, amount in kobo, fee
  or permitted maximum, currency, purpose, expiry and source connection
  version. Check available balance and in-flight obligations. For a linked
  bill, reserve the payable against concurrent payout or manual settlement.
  Use short transactions and avoid provider calls under DB locks.
- **Acceptance.** Review works with and without a supplier bill. It refuses an
  unverified recipient, stale bank details, insufficient funds, a disabled
  source, a duplicate obligation, and cross-tenant or wrong-book input. The
  exact fee or approved maximum is explicit, with reapproval for any increase
  beyond it.

### KBP-07 — Bind approval to one payment and dispatch once

**Dependencies:** KBP-06.

- Add fresh server-verified identity confirmation for the authenticated
  approver. Bind a short-lived, single-use approval to the exact review
  digest and actor. Recheck permissions, connection version, stop state and
  eligibility when approval is consumed and before dispatch.
- Atomically persist approval, stable provider reference and work to dispatch.
  Use the existing job runner for a single claimed submitter. Handle worker
  crashes before or after the network call and reconciliation of uncertain
  submissions. Stop or disconnect blocks new approvals and unsubmitted work.
  Already submitted payments retain a reconciliation path even after the
  connection is disconnected. Define how existing authorized evidence or
  business-provided bank proof resolves pending work when access is gone.
- **Acceptance.** Double tap, concurrent approvals, expired challenges, stale
  role changes, connection replacement, stop races and lost responses never
  create duplicate transfers. Record when an already submitted payout can no
  longer be prevented. A client timeout does not start a new payout.

### KBP-08 — Reconcile Kuda outcomes and post Finance entries

**Dependencies:** KBP-01, KBP-02, KBP-07.

- Map provider responses to explicit payout states. Authenticate callbacks
  using Kuda's documented webhook credentials, bind the event to the
  connected account and query Kuda for final-state evidence. Deduplicate
  provider events and enforce allowed state transitions so delayed events
  cannot erase a final result. [Kuda webhook guide](https://business-support.kuda.com/en/articles/17245267-handling-kuda-business-api-webhooks)
- Post confirmed success and fee once using the correct Finance command.
  Link receipt and journal evidence to the provider result. A reversal
  produces a linked correction and reopens any applicable paid amount.
  Match statement imports/manual recordings to the same provider identity.
  Give unresolved or unposted outcomes a recoverable operations queue.
- **Acceptance.** Prove convergence for timeouts, pending status, duplicate or
  out-of-order events, status disagreement, worker restart, partial failures,
  closed periods and confirmed reversal after success. Prove one confirmed
  external debit corresponds to one payout posting and linked corrections.

### KBP-09 — Read Kuda balances and sync account activity

**Dependencies:** KBP-01, KBP-05.

- Fetch the main account's available, ledger and withdrawable balances in
  kobo. Use available balance for **Available at Kuda** and confirm whether
  the withdrawable balance or additional limits apply to payout checks.
  Show the source and fetch time. The last verified value can be shown as
  stale with its timestamp. If there is none, show unavailable.
- Import paginated main-account history with bounded date windows, overlap
  and a durable checkpoint. Establish a verified provider transaction
  identity before deduplicating, and handle reversed or delayed activity.
  Use authenticated account notifications as refresh hints plus a bounded
  recovery job and explicit refresh. Choose a sync cadence after checking
  provider limits. Coalesce refreshes and scope private snapshots to the
  correct tenant, account and connection version.
- **Acceptance.** A credit and a debit made outside EwaTrade appear after
  sync, and the dashboard shows the amount Kuda reported independently of
  manual entries. Prove pagination, restart recovery, deduplication,
  disconnect behavior and a stale balance during a Kuda outage.
  [Kuda balances and transactions](https://business-support.kuda.com/en/articles/15363781-reading-balances-transactions-and-statements)

### KBP-10 — Reconcile Kuda activity with orders and Finance

**Dependencies:** KBP-02, KBP-08, KBP-09.

- Link a verified Kuda account to one existing bank ledger account, or use
  the approved banking-only flow. Preserve historical journal entries.
  Resolve the opening cutoff and differences explicitly. The account list
  and totals must avoid counting the same connected bank account twice.
- For a connected Kuda account, let the merchant match an incoming bank
  credit to an order payment, including eligible partial payments. For
  externally initiated debits, let them match an existing payment or classify
  the bank activity with the existing Finance command. Unmatched activity
  stays visible. A suggestion alone never marks an order paid or posts a
  second entry. Keep an explicit exception review for a previously recorded
  payment, a bank reversal or an ambiguous match.
- Save the source transaction and allocation identity durably. Reuse the
  same evidence when Kuda payout reconciliation, synced history or statement
  import reports a debit already known to EwaTrade. Pause matching when
  strong identity is missing, and prevent concurrent over-allocation.
- **Acceptance.** An order marked against a Kuda credit does not add that
  amount to the provider balance. A Kuda-app debit can match an existing
  ledger entry, and an EwaTrade payout also seen on the feed posts once.
  Verify unmatched and changed amounts, partial and duplicate matches,
  reversal, same-amount ambiguity and history before connection.

### KBP-11 — Verify connected Kuda order and service payments

**Dependencies:** KBP-01, KBP-03, KBP-09, KBP-10.

- When connected Kuda is selected, **Confirm payment** saves an idempotent
  verification attempt bound to the tenant, store, canonical order, selected
  verified account, expected amount in kobo, and relevant payment reference.
  A service maps to its actual payable Commercial Order. Preserve the attempt
  across reload and keep the order unpaid while checking. Retry by refresh
  and bounded background recovery using the existing status transport.
- Query Kuda for a successful credit to the selected account. Require evidence
  that ties it to the payment attempt, such as an available unique transfer
  reference or an approved per-order collection reference. Amount and timing
  alone cannot identify a payment. If the feed cannot expose an adequate
  reference, let an authorized merchant select a verified, unused bank
  credit for this order or leave it pending. A typed claim or receipt
  screenshot can help locate the transfer but cannot confirm the bank credit.
  Treat order-specific Kuda virtual accounts as a separate option only if
  approved for this use case. [Kuda transaction API](https://business-support.kuda.com/en/articles/15363781-reading-balances-transactions-and-statements) · [Kuda collection accounts](https://business-support.kuda.com/en/articles/15363777-getting-paid-with-dynamic-virtual-accounts)
- On a verified match, atomically consume the credit or its allowed
  unallocated portion and use the canonical payment command once. Reflect
  full or partial payment from the saved payable amount. Keep mismatched or
  excess amounts in the existing review rules. Disallow manual override of a
  connected Kuda attempt and preserve the distinct manual bank/cash path.
- **Acceptance.** Run order and service journeys for verified full and
  partial credit, delayed arrival after reload, unavailable feed, wrong
  account, same-amount ambiguity, consumed reference, simultaneous attempts,
  excessive payment, and a later bank reversal. Only verified credit can
  complete the connected path. Manual behavior continues for accounts without
  a connection.

### KBP-12 — Ship the merchant dashboard flow to the test environment

**Dependencies:** KBP-03, KBP-05, KBP-08, KBP-09, KBP-10, KBP-11.

- Add the owner walkthrough, masked connection panel, start-here help for
  API onboarding, verify/reconnect/disconnect, stop control and audit/history
  links. Show **Available at Kuda**, **Bank activity** and the accounting
  match action. Provide **Send money** and **Record a transfer** as separate
  actions. Render the review, identity challenge, status and receipt through
  the shared protected commands. Use the same verification status on both
  order and service payment screens.
- **Acceptance.** A test merchant connects without forwarding secrets
  through chat, returns after a failed connection, prepares and approves a
  payment, recovers pending status after reload, and can see when it is final.
  An unapproved user sees the available preparation or read access only.

### KBP-13 — Add mobile transfer approval and status

**Dependencies:** KBP-03, KBP-08, KBP-09, KBP-11, KBP-12's shared contract.

- Reuse the verified connection and payout APIs in the native app. Provide
  balance with freshness, recent activity, review, identity verification,
  approval, status and receipt.
  Route mobile setup to protected settings if the credential form launches
  on web first. Order and service checks recover their status after app
  restart and deep links. Offline recording cannot mark a connected Kuda
  payment as verified. Payouts require an active connection, server
  confirmation and online access.
- **Acceptance.** Verify a native test transfer across foreground, background
  and resume. App lock alone grants no server payout authority. Offline,
  repeated taps, cross-tenant links and expired approval cannot move money.
  Test actual device authentication for the supported native path.

### KBP-14 — Add assistant drafting and WhatsApp handoff

**Dependencies:** KBP-03, KBP-08, KBP-11, KBP-12. Native return path follows KBP-13.

- Add an explicit send-money capability with constrained intent and payee
  resolution. Ask whether to send or record when the request is ambiguous.
  The assistant can prepare and read status using scoped server commands.
  The proposal continues to an authenticated review. Tokens, bank credentials
  and identity challenges stay out of model input and WhatsApp messages.
  An order-payment request can start or read an authorized bank check through
  the same command. The assistant reports paid only from its saved result.
- Follow the WhatsApp lifecycle for stable case versions, Workshop and the
  private Site mirror. Record feature impact, channel support, exclusions and
  coverage. Keep **record a transfer** and its receipts behaving as before.
- **Acceptance.** Chat drafts a verified recipient for a request to send,
  never debits on chat text alone, and hands off the exact proposal. Prove
  wrong account/store/user, replay, changed amount, malicious instructions,
  and missing approval cannot submit.

### KBP-15 — Prove and run the first authorized merchant pilot

**Dependencies:** KBP-01 and KBP-04–KBP-14 for the relevant surfaces.

- Complete Kuda joint testing and the project release gates. Use a default-off
  allowlist for the named merchant. Before any live transaction, record the
  exact merchant, runtime, permitted account, recipient, amount, approver and
  requested action. Use the provider-supported or explicitly approved test
  path for money movement. Keep monitoring redacted and limited to operational
  needs. Define who handles a pending or reversed transfer and who can stop
  future submissions.
- **Acceptance.** First prove a test payout and its ledger match,
  out-of-band debit and credit, a verified order and service payment,
  an uncertain outcome, a reversal and cross-business isolation. For a
  separately approved live pilot, record proof for the exact release and
  transaction before broader rollout. Document Kuda support escalation,
  payment pause, credential rotation and reconciliation continuity.

## Implementation verification and evidence

Use the existing offline doctor, scoped source smoke plans, root launcher and
[testing workflow](../testing.md). Verify money, permissions, concurrency,
native behavior, production candidate evidence, provider callback safety, and
release rollback at their relevant tickets. Run scope-appropriate type checks
and the existing assistant coverage and impact gates. Guarded development
integration checks must prove concurrent transfer and accounting invariants.
Keep live test payments separately authorized from local/sandbox acceptance.
When changing Prisma, use the root migration and push scripts on an authorized
target as required by the project. Document future API, permission,
database, feature and release evidence in Brain with exact case links.

Planning completion and implementation progress are separate. All 15 tickets
start open. Cross-reference the existing merchant-money milestones for
authorization, account source, bank transfer and payroll. Do not count these
planning tickets as additional roadmap leaves or award implementation credit.
