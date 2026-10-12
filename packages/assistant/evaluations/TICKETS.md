# Assistant ticket status — 12 October 2026

Snapshot of the canonical 45-ticket roadmap. Web/dashboard acceptance only.

**Accepted: 13/45 (28.9%). Pending acceptance: 32/45 (71.1%).**
Of the 32 not yet accepted: 11 are partial, 20 are pending implementation, and
1 is deferred (A04, mobile, at the owner's request).
No mobile implementation/testing or hosted rollout is certified here.

Legend: ✓ complete for the current web scope; ◐ partially implemented/verified;
○ pending; ⏸ deferred; 🔖 accepted milestone. A partial pass does not complete
its parent ticket. Unbookmarked tickets are not accepted yet. Pending means no
accepted milestone is recorded; it does not assert that no related source exists.

| ID | Ticket | Implementation | Acceptance |
|---|---|---|---|
| A01 | Capability inventory and manifest | ✓ Complete | 🔖 Accepted |
| A02 | Execution adapter boundary | ✓ Complete | 🔖 Accepted |
| A03 | Dashboard GENERAL chat | ✓ Complete | 🔖 Accepted |
| A04 | Native acceptance and parity | ⏸ Deferred | Deferred |
| A05 | Controlled availability and read baseline | ✓ Complete | 🔖 Accepted |
| B01 | Customer create/update | ✓ Complete | 🔖 Accepted |
| B02 | Product editing | ✓ Complete | 🔖 Accepted |
| B03 | Catalog selling configuration | ✓ Complete | 🔖 Accepted |
| B04 | Operational lookups | ✓ Complete | 🔖 Accepted |
| B05 | Simple sale and receipt | ✓ Complete | 🔖 Accepted |
| C01 | Stock receive | ✓ Complete | 🔖 Accepted |
| C02 | Stock count | ✓ Complete | 🔖 Accepted |
| C03 | Adjust, waste and correct | ✓ Complete | 🔖 Accepted |
| C04 | Store transfer | ◐ Partial | Pending |
| C05 | Inventory closeout | ✓ Complete | 🔖 Accepted |
| D01 | Order amendment and cancellation | ◐ Partial | Pending |
| D02 | Fulfilment and status | ◐ Partial | Pending |
| D03 | Returns and payment corrections | ◐ Partial | Pending |
| D04 | Simple service work order | ○ Pending | Pending |
| D05 | Work lifecycle | ○ Pending | Pending |
| E01 | Accounts and money reads | ◐ Partial | Pending |
| E02 | Customer funds | ◐ Partial | Pending |
| E03 | Internal transfers and owner funds | ◐ Partial | Pending |
| E04 | Expenses and bills | ◐ Partial | Pending |
| E05 | Suppliers and purchasing | ◐ Partial | Pending |
| S01 | Staff directory and history | ○ Pending | Pending |
| S02 | Staff invitations and lifecycle | ○ Pending | Pending |
| S03 | Suspend/reactivate staff | ○ Pending | Pending |
| S04 | Roles, Store assignments and handover | ○ Pending | Pending |
| S05 | Daily staff activity history | ○ Pending | Pending |
| F01 | Collection source contract | ○ Pending | Pending |
| F02 | Payment link and settlement | ○ Pending | Pending |
| F03 | Payout feasibility and domain | ○ Pending | Pending |
| F04 | Payout approval and dispatch | ○ Pending | Pending |
| F05 | Settlement and recovery | ○ Pending | Pending |
| G01 | Business reporting | ○ Pending | Pending |
| G02 | Cash count and close day | ○ Pending | Pending |
| G03 | Quotes, bookings and delivery | ○ Pending | Pending |
| G04 | Advanced inventory and catalog | ○ Pending | Pending |
| G05 | Settings and communications | ○ Pending | Pending |
| H01 | Coverage CI gate | ◐ Partial | Pending |
| H02 | Brain and feature change gate | ○ Pending | Pending |
| H03 | Evaluation and observability | ◐ Partial | Pending |
| H04 | Media and controlled multi-step use | ○ Pending | Pending |
| H05 | Operational acceptance and rollout | ○ Pending | Pending |

Current implementation focus: E05. Purchase fact reversal now passes signed rollback/stale refusal,
full saved web confirmation/history/reload and concurrent recovery for invoice and ownership;
three canonical procedures remain. [Latest evidence](runs/2026-10-12-purchase-fact-reversal-web.md).
[Payment reversal evidence](runs/2026-10-12-purchase-payment-reversal-web.md). Supplier creation and purchase registration
have focused database and saved receipt Open/Close evidence. Invoice, ownership and
physical receipt now pass actual dashboard Edit/re-review/Confirm and global receipt
Open/Close, with exact saved posting/stock/valuation readback. Full two-line assistant
receipt confirmation reaches forced completion rollback in 28.8s within the existing
30s budget; saved facts are unchanged. Completed receipt replay and duplicate-stage
refusal pass. **E05 remains partial and unbookmarked.** Supplier
advances/allocation and partial payment now pass full proposal rollback, actual chat
Edit/re-review/Confirm, saved receipt Open/Close and exact journal/balance/stock
readback with concurrent completed recovery. Three actions are source-available.
Supplier/purchase discovery is now source-available: name/code search resolves the
canonical Book, 12 real read checks pass and saved statement/invoice overlays retain
the assistant. Supplier creation and agreement registration are now source-available
and pass actual Edit/re-review/Confirm/Open/Close with exact saved effects and
completed recovery. Fresh stock preparation now batches 1–10 original goods; ten mixed sources prepare
in3.11s with saved financial/stock facts unchanged. Ten-line posting/valuation now passes canonical19.50s and signed assistant completion
rollback23.15s with100 category links; signed stale-stock refusal preserves all facts.
Advisory stock previews now batch; full GENERAL Edit review11.56s passes with rollback.
Maximum dashboard Edit/re-review/Confirm/Open/Close/reload and exact saved ten movements/
values/100 category links pass; concurrent completed recovery adds no effects. Broader
operational acceptance remains open. Nine real signed receipt refusal probes now pass
with all saved facts unchanged: changed token, old revision, revoked role, expired
session, closed period, archived posting account, retired configuration, changed
category label and changed valuation pool. Evidence:
[signed receipt guards and acceptance audit](runs/2026-10-12-supplier-acceptance-audit.md),
[maximum receipt web report](runs/2026-10-12-ten-line-receipt-web.md),
[ten-line receipt batch report](runs/2026-10-12-ten-line-receipt-batch.md),
[stock preparation bounds report](runs/2026-10-12-stock-bounds-preparation.md),
[supplier creation/registration web report](runs/2026-10-12-supplier-registration-web.md),
[supplier discovery report](runs/2026-10-12-supplier-discovery.md),
[supplier settlement web report](runs/2026-10-12-supplier-settlement-web.md) and
[physical receipt proposal/web report](runs/2026-10-11-receipt-proposal-web.md).
D02/D03 financial source performance and E02 credit-release web acceptance also
remain open; E03/E04 full browser confirmation remains open.

Canonical procedure checklist within E05 (the parent remains partial):

- [ ] `finance.recordPurchase` — direct purchase recording.
- [ ] `finance.recordSupplierOpening` — supplier opening balances.
- [x] `finance.releaseSupplierAllocation` — signed completion rollback/stale refusal, actual dashboard Edit/re-review/Confirm/Open/Close/reload and saved concurrent recovery verified. [Evidence](runs/2026-10-12-allocation-release-web.md).
- [x] `finance.reversePurchasePayment` — exact original-payment correction, signed rollback/stale refusal, actual dashboard Edit/re-review/Confirm/Open/Close/reload and saved concurrent recovery verified. [Evidence](runs/2026-10-12-purchase-payment-reversal-web.md).
- [x] `finance.reversePurchaseRecognition` — signed invoice/ownership completion rollback/stale refusal, actual dashboard Edit/re-review/Confirm/Open/Close/reload, exact saved original/correction history and concurrent completed recovery verified. Physical receipt correction remains refused. [Evidence](runs/2026-10-12-purchase-fact-reversal-web.md).
- [ ] `finance.reverseSupplierEntry` — supplier entry reversal.

The three pending procedures require assistant review/confirmation, owning receipts and relevant refusal,
rollback/recovery and web evidence. Existing registered-purchase flows do not accept
these separate procedures. E05 keeps its ◐ mark and has no 🔖 bookmark.

H01 has the coverage generator/check groundwork; complete CI acceptance is pending.
H03 has versioned fixtures and deterministic/manual-web reports; complete evaluation
and observability acceptance is pending. H04's separate media workstream does not
establish acceptance of the whole ticket.

Canonical definition/evidence: `.brain/plans/2026-10-09-assistant-business-operations.md`.
Detailed run reports: [evaluation catalog](README.md). Implementation completion,
acceptance, runtime availability and deployment are separate states.
