# Dashboard query override ledger — DP-201, 30 October 2026

Appendix to the [query lifetime policy](2026-10-29-dashboard-query-policy.md).
Source: root's offline AST inventory `.scratch/dashboard-performance-program-option-inventory.json`
(209 direct `staleTime`/`gcTime` assignments from 1140 scanned Dashboard files; `.test.`
files and declarations excluded, with one `.fixture.` row excluded below). Shared
factories and spreads were followed to their real owners in source. Browser reads
without an override inherit `trpc/query-client.ts:29` (60 s freshness, 5 min inactive
retention); their domain category still follows the owner contract. Inheritance
does not automatically make a live financial read an ordinary C1 directory. This ledger
classifies current owners only; it adds no criterion, TTL, test obligation or
acceptance claim. Program scope (27 tickets, 59 routes, nine families) is unchanged.

Categories follow the policy's Owner policy table: **C1** ordinary directories/
reference, **C2** current financial/stock presentation, **C3** access/proof/private
receipts/activity targets, **C4** snapshot statements/exports, **C5** optional
sheets/tabs, **C6** durable jobs/runs, **C7** counts/badges, **C8** public proof/
preview/clinical links. "Review" marks a read made immediately before a command
or confirmation. The policy already requires those checks to stay fresh (C2/C3);
the server command still re-checks authority. Retained display never authorizes action.

## Finance

| Owner (file:line) | Override | Cat. | Why correct | Activation / invalidation / authority |
| --- | --- | --- | --- | --- |
| `finance/account-statement.tsx:107`, `finance/supplier-statement.tsx:132` | stale ∞, `refetchOnMount: "always"`, no focus/reconnect | C4 | Key includes Book/account/range, `snapshotSequence` and cursor; a pinned page cannot change | Open revalidates; Finance completion keeps loaded pinned pages ([receipt](../verification/2026-10-30-dashboard-finance-read-effects.md)); not command authority |
| `finance/report-account-ledger.tsx:126` | stale ∞ (infinite) | C4 | Same pinned `snapshotSequence` identity | Visible report owner; latest/unknown keys still refresh |
| `finance/statement-export.tsx:87`, `finance/report-ledger-export.tsx:55` | stale ∞ via `fetchQuery` | C4 | Export walks one pinned snapshot, so already-read pages are reused, not re-requested | Export-owned with cancellation; identity is in the key |
| `finance/supplier-statement.tsx:168` | 0 | C2 | "Latest" view of a mutable statement | Refreshed by Finance completion |
| `finance/finance-reports.tsx:94` | 0, no focus refetch | C2 | Mutable current report; account metadata can change | Finance completion keeps reports refreshable |
| `finance/supplier-aging.tsx:108`, `finance/bank-statement-detail.tsx:83` | 0 | C2 | Live payable aging and statement detail | Visible owner; Finance invalidation |
| `finance/bank-match-history.tsx:47` | 0 (infinite) | C2 | Shows releasable active matches that drive Release | Command re-checks the match/snapshot revision |
| `finance/bank-import-form.tsx:309,339`, `bank-match-form.tsx:166,189,231`, `bank-owned-correction-form.tsx:150,175`, `bank-source-detail.tsx:98,177`, `cash-adjustment-reversal-form.tsx:117`, `money-reversal-form.tsx:84,119`, `period-form.tsx:150,157,165`, `supplier-entry-form.tsx:104,110,184,199`, `year-end-section.tsx:60` | 0 | C2 review | Current Book, period, source, history or preview read just before a financial command | Form-state enabled; server command re-checks Book/period/lock |
| `finance/bank-details-form.tsx:109-110` | 0 / gc 0, mount always | C3 review | Source comment line 103: alert eligibility and plan "now" | Form-open owned |
| `finance/finance-sheet-content.tsx:134,155,204,236`, `hooks/use-finance-command.ts:71,86,225,351` | 0 | C6 | Durable command status and completed-record recovery | Runner-owned; terminal stop |
| `finance/expense-receipts.tsx:190-191` (list), `:447,482,535,586,643,687,740,789` (get) | 0 / gc 0 | C3 | Private receipt files and metadata; fresh admitted read before upload, approval or view; zero retention drops private payloads | Expense-receipt access rules; refusal erases data |
| `sheets/finance-movement-details-sheet.tsx:20`, `purchase-bill-details-sheet.tsx:136`, `purchase-registration-details-sheet.tsx:95` | 0 | C2 | Live money detail that offers reversal or recognition | URL-sheet owned; Finance invalidation |
| `sheets/business-report-sheet.tsx:25` | 0 | C2 | Current business report target | Sheet owned |

## Customer ledger, banking and public payment

| Owner (file:line) | Override | Cat. | Why correct | Activation / invalidation / authority |
| --- | --- | --- | --- | --- |
| `customer-ledger/customer-ledger-statement.tsx:60` / `:111` | ∞ pinned / 0 latest | C4 / C2 | Pinned snapshot versus latest statement | `currentRevision` is informational; `accountDetail` owns command authority ([receipt](../verification/2026-10-30-dashboard-customer-ledger-read-effects.md)) |
| `customer-ledger/statement-export.tsx:42` | ∞ via `fetchQuery` | C4 | Pinned export pages | Export-owned |
| `customer-ledger/order-customer-credit.tsx:49`, `order-returns/order-return-sources.tsx:94`, `refunds/refund-request-detail.tsx:53`, `refunds/refund-request-form.tsx:66,149`, `hooks/use-customer-ledger-command.ts:60` | 0 | C2 review / C6 | Funds, return and refund review before commands; durable command status | Ledger runner and completion owner |
| `business-banking/payment-link-dialog.tsx:162` | 0 | C2 review | Current link candidates before a payment-link command | Dialog owned |
| `business-banking/payment-report-review.tsx:141` | 0 | C3 | Private payment-claim review (P16 helper checks visibility and budget) | Review-owned; refusal erases |
| `business-banking/payments-to-check.tsx:28` (`FRESH`, used at 52 and 81) | 0 / gc 0, mount always | C2 | Required financial queue; single shared first page ([receipt](../verification/2026-10-30-dashboard-payments-inbox-reads.md)) | 30 s visible poll; known refusal stops |
| `public-payment/payment-provider.tsx:18` (separate QueryClient), `payment-page.tsx:712`, `use-customer-credit.ts:68`, `use-receipt-preflight.ts:31`, `use-report-status.ts:76` | 0 | C8 | Public proof-token flows on their own client and transport | Proof, expiry and no-store rules; bounded preflight/status recovery |

## Catalog, Inventory, Orders and Services

| Owner (file:line) | Override | Cat. | Why correct | Activation / invalidation / authority |
| --- | --- | --- | --- | --- |
| `catalog-item/catalog-item-detail-modal.tsx:80-81`, `detail/activity.tsx:73-74`, `detail/orders.tsx:40-41` | 0 / gc 0 | C5 (scoped detail) | Key carries actor, Tenant, Store, role, generation and visit; visited panels are kept by mounted observers inside the open sheet, not by cache TTL ([receipt](../verification/2026-10-29-catalog-detail-performance.md)) | Close/scope/generation reset; reopen is fresh |
| `catalog-item/catalog-product-share-dialog.tsx:87-88` | 0 / gc 0 | C8 | Public share capability | Dialog owned |
| `catalog-item/catalog-storefront-settings.tsx:86-87` | 0 / gc 0, mount always, `mountOwnedRead` | C3 review | Storefront visibility policy before editing | Mount generation and abort on unmount |
| `catalog-item/form.tsx:283-284` | 0 / gc 0 | C6 | Product-chat conversation state (P13, error-gated 2.5 s chat poll) | Conversation/generation/visit key |
| `catalog-item/catalog-category-editor.tsx:45` | 300 s | C1 | Search category; the policy explicitly allows a 5 min search window | Debounced input |
| `inventory/closeout-details.tsx:14`, `stock-count-details.tsx:16`, `stock-count-form.tsx:107`, `sheets/stock-transfer-details-sheet.tsx:15` | 0 | C2 review | Stock review before closeout, count or transfer commands | Command re-checks stock/locks |
| `inventory/inventory-receipt-source.tsx:108` | 0 | C2 | Live offering availability | Form owned |
| `orders/overview/order-amend-dialogs.tsx:99,409,611` | 0 | C2 review | Metadata, replacement and cancellation reviews before commands | Order-change completion owner |
| `orders/overview/order-overview.tsx:183` | 60 s | C1 | Assistant availability flag; explicitly equals the default | API decides access |
| `receipts/receipt-content.tsx:43-44` | 0 / gc 0, no focus refetch | C3 | Generated private receipt PDF bytes; zero retention releases them | Sheet owned; ≤20 Orders; online gate |
| `service-commerce/booking/booking-appointments.tsx:266` | 0 | C2 | Live slot availability before a booking revision (same contract as stock availability) | `onStale` revise path; server re-checks capacity |
| `service-work/service-job-workspace.tsx:143`, `sheets/service-job-sheet.tsx:66` | 0 | C3 | Current job and its assignment/access scope | Sheet owned; job invalidators |
| `sheets/service-intake-receipt-sheet.tsx:18`, `sheets/service-work-original-sheet.tsx:30` | 0 | C3 | Immutable receipts/originals shown under current access | Sheet owned |
| `sheets/store-settings-sheet.tsx:53` (receipt 55, reminder 61, order visibility 67) | 0 | C3 review | Source comment lines 45-47: the sheet shows today's values, labelled current | Section-gated |
| `stores/store-contact-row.tsx:255` (`fetchQuery`) | 0 | C3 review | Reloads current contact before editing | Generation/mount guards |
| `storefront-requests/storefront-requests-inbox.tsx:60` (`FRESH`, used at 150, 288, 377, 1096) | 0, mount always | C3 (required queue) | Private customer-request inbox; P25–P27 live queue | 30 s visible poll; known refusal stops ([receipt](../verification/2026-10-30-dashboard-inbox-polls.md)) |
| `store-conversations/use-store-conversation-realtime.ts:94` | 0 / gc 0 | C6 | Imperative cursor recovery (T04) | Scope-owned cancellation ([receipt](../verification/2026-10-30-dashboard-conversation-recovery-lifetime.md)) |

## Staff, access, Activity and notifications

| Owner (file:line) | Override | Cat. | Why correct | Activation / invalidation / authority |
| --- | --- | --- | --- | --- |
| `dashboard/activity-page.tsx:30-36` (used at 74, 81), `activity/activity-person-picker.tsx:16-19` (used at 105), `sheets/activity-sheet.tsx:88-89` | 0 / gc 0, mount always, abort | C3 | Source comment line 29: never joined across user, Business or Store | Mount generation |
| `sheets/staff-access-sheet.tsx:46`, `staff-activity-sheet.tsx:168-169,190-191`, `staff-directory-sheet.tsx:19`, `staff-history-sheet.tsx:16`, `staff-invitation-sheet.tsx:17`, `staff-member-sheet.tsx:58`, `staff-status-sheet.tsx:55`, `hooks/use-staff-access.ts:30`, `hooks/use-staff-invitation-actions.ts:31` | 0 (gc 0 at 168-169, 190-191) | C3 | Staff roles, status, invitations, receipts and activity are access data | Sheet/URL owned; staff commands invalidate |
| `hooks/use-business-notification-reads.ts:13-16` (seven hooks plus `business-notification-center.tsx:163`) | 0 / gc 0 | C7 | Fresh scoped counts and open previews | 30 s/60 s active intervals; known refusal stops ([receipt](../verification/2026-10-29-dashboard-notification-polling.md)) |
| `notification-center/business-notification-settings.tsx:54-55`, `settings/business-notification-settings-page.tsx:41-44` (used at 122, 269, 278, 296, 455) | 0 / gc 0 | C3 | Personal preferences and the audience policy | Page/sheet owned |
| `open-assistant-read-record.tsx:30-31` | 0 / gc 0 | C3 | Private record links (P14; hidden owner unmounts) | [Receipt](../verification/2026-10-30-dashboard-assistant-read-lifetime.md) |

## Assistant, WhatsApp, Setup and QA

| Owner (file:line) | Override | Cat. | Why correct | Activation / invalidation / authority |
| --- | --- | --- | --- | --- |
| `assistant-whatsapp/connect-whatsapp.tsx:46-47,63-64,83-84`; mutation retention `:95,98` | 0 / gc 0 | C8 | Link context, availability and short-lived link status; mutation results that contain link codes are not retained | 2 s link poll until confirmed/cancelled/expired; refusal stops |
| `assistant-whatsapp/whatsapp-connections.tsx:50-51,69-70`; `:57` mutation | 0 / gc 0 | C3 | Actor's linked identities and selected chat context | Refusal-stopped 15 s/30 s polls |
| `assistant-whatsapp/whatsapp-scope-picker.tsx:54-55,78-79,105-106`; `:109` mutation | 0 / gc 0 | C3 | Businesses, Stores and chats offered for scope selection | Picker owned |
| `general-assistant/assistant-links.tsx:63`, `product-assistant/assistant-allowance.tsx:15` | 0 | C3 | Product capability and billing allowance | 30 s refusal-stopped poll (P18, P22) |
| `general-assistant/assistant-composer.tsx:107` | 30 s | C3 (capability) | Source comment line 106: the voice gateway can come and go; a bounded shorter window, not authority | Active-only; 60 s refusal-stopped poll |
| `general-quote-decision-editor.tsx:33,51`, `general-service-intake-editor.tsx:62,71,80`, `general-service-work-editor.tsx:43,59,102,115`, `general-staff-access-editor.tsx:46,70`, `general-staff-removal-editor.tsx:36,58`, `general-staff-status-editor.tsx:42,64`, `general-stock-custody-editor.tsx:66-69` (used at 76, 89) | 0 (gc 0 at 66-69) | C3 review | Current `tenant.current` scope and review before an assistant-confirmed command | Scope-keyed reviews; server re-checks |
| `sheets/assistant-booking-sheet.tsx:37`, `assistant-quote-approval-sheet.tsx:37`, `assistant-service-request-sheet.tsx:40-41`, `assistant-manual-message-sheet.tsx:44-45`, `assistant-cash-count-sheet.tsx:28`, `assistant-day-close-sheet.tsx:30,57` | 0 (gc 0 where listed) | C3 | Assistant object targets under current access (paused-cache proof) | Sheet owned |
| `setup-assistant/setup-assistant.tsx:131`, `use-setup-attachments.ts:231` | 0 / gc 0; 0 | C6 | Setup run state and attachment processing (P28, 120 s window) | [Receipt](../verification/2026-10-30-dashboard-attachment-status.md) |
| `dashboard/command-search.tsx:64` | 60 s | C1 | Setup entry visibility once search opens; equals the default; the API decides role/Store/flag (comment line 60) | Observer-level freshness, independent of Setup's 0/0 observer |
| `customer-messages/order-message-panel.tsx:86`, `use-order-message-action.ts:66` (`PREVIEW_STALE_MS = 60_000`) | 60 s | C1 | Message preview; equals the default | Order-change completion refreshes the current Order's preview ([receipt](../verification/2026-10-30-dashboard-order-change-read-effects.md)) |
| `qa/qa-quick-fill.tsx:64` | 5 min | QA-only (not a product read) | Fixture context for QA tooling, gated by the current QA policy; non-QA builds alias this module to its production stub (`next.config.ts` resolveAlias/webpack replacement) | `enabled: policyEnabled` |

## Studio

| Owner (file:line) | Override | Cat. | Why correct | Activation / invalidation / authority |
| --- | --- | --- | --- | --- |
| `storefront/storefront-canvas-preview.tsx:62-63` | 0 / gc 0 | C8 | Preview session with expiry | Session-owned |
| `storefront/storefront-canvas-preview.tsx:108-109` | ∞ / gc 0 | C8 | Enabled only while the session is unexpired; the key carries the pin set; zero retention releases it on unmount | `keepPreviousData` while pins change |
| `storefront/storefront-preview.tsx:34-35` | 0 / gc 0 | C8 | Private preview page | Middleware no-store rules |
| `storefront/storefront-proposals.tsx:116` | ∞, no focus refetch | C4 | READY generation result keyed by `runId` and site is immutable | Enabled only when READY and open |
| `storefront/use-storefront-content.ts:125` | 30 s, no focus refetch | C5 | Open-gated editor context | `enabled: props.open` |
| `storefront/storefront-catalog-items-field.tsx:94,106` | 30 s / 60 s | C1 | Picker search results (shorter while typing) and item-name lookups | Studio picker owned |

## Excluded rows

- `trpc/query-client.ts:29`: the 60 s default itself.
- `sheets/assistant-object-paused-cache.fixture.tsx:148`: test fixture. The scan excluded `.test.` but not `.fixture.`; not a production read.

## Contact-target decision and explicit notes

1. **`sheets/customer-details-sheet.tsx:17`, `customers.getById`, `staleTime: 0`: C3 private contact target.**
   Engineering classification preserves the existing behavior: a URL-owned
   contact record reads freshly on open; the protected procedure checks current
   `assertCanUseCustomers`/POS role, and `getCustomerById` bounds the ID by the
   admitted Tenant. Target changes alter the key; a refusal renders an error
   instead of contact values. Current inactive retention is unchanged, and no
   first-open or revisit speed claim is made. This records an explicit rationale,
   not a new access rule or TTL decision. The current response also reads commercial
   order history unused by this contact-only sheet; a lean projection is a DP-404
   follow-up, not a reason to relax freshness.
2. Three overrides explicitly equal the 60 s default (`order-overview.tsx:183`,
   `PREVIEW_STALE_MS`, `command-search.tsx:64`). They are harmless and documented;
   no change.
3. Booking slots use C2's live-availability contract although the policy wording
   says "financial/stock". This is recorded as wording precision, not a new category.
4. No ordinary directory override forcing a demonstrated wasteful refetch was
   found. Directory-category hydration is proven by the Catalog, Sales, Services,
   Inventory and Finance mounted tests (DP-102); those owners inherit the default.

No production change is proposed. Mechanical reconciliation covers all209 inventory
rows with zero ambiguous references:207 production override assignments, the
explicitly excluded global default and one test fixture. The two Settings factory
property lines43–44 are included (not just the factory declaration at41). Private
receipt: `/tmp/ewatrade-dashboard-program-20261029/override-ledger-reconciliation.json`.
Shared factory consumers remain source-reviewed; this is not proof of every indirect
query site. Newly added overrides need an owner classification.


## DP-201 acceptance — local source policy

All209 rows reconcile mechanically with zero ambiguous/missing references, including
207 production override assignments and the two explicit exclusions. Each explicit
owner has its category, retention/freshness, activation/invalidation and sensitive-
read rationale; shared factories were traced to their consumers. Ordinary defaults
remain inherited at the proper domain owners. No production behavior or TTL changed.
The contact-target decision above resolves the only unspecified rationale while
preserving current protected admission and display/refusal behavior. This accepts
DP-201 policy application locally; revisit, post-command and lifecycle acceptance
remain DP-202/203/204 and the domain tickets. No global performance target is accepted.

Verification: source/guard review plus numeric ledger reconciliation. The existing
Docs QA subset is reused from the valid237/1533 source run with unchanged QA code;
new Markdown paths have an explicit quick-plan mapping with zero unknowns. No live
read, service restart, schema/provider action or deployment for this documentation.
Program **7/27 (25.9%)**,20 criteria remain open.
