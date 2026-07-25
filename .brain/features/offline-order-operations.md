# Offline Order Operations

## Purpose

Allow a business owner to decide whether staff may work offline while keeping
the offline surface limited to the minimum checkout workflow.

## Management Policy

- `offline.settings` returns the tenant policy to authenticated commercial/POS
  roles.
- `offline.updateSettings` is restricted to `OWNER` and `ADMIN`.
- The policy is stored in
  `Tenant.metadata.offlineOperationsEnabled` and
  `Tenant.metadata.offlineApprovalRequired`; absence means enabled and
  approval-off respectively.
- The mobile Sync & offline screen lets an owner/admin enable or disable staff
  offline access and turn approval of staff offline records on or off.
- An authenticated app-level reconciler refreshes the policy every 30 seconds
  while foregrounded, resets offline mode when the active business changes,
  and automatically submits pending commands when the device returns to online
  mode.
- Device registration and replay enforce the current server policy, so UI
  state is never the authorization boundary.

## Supported Offline Checkout

A queued `commercial_order` may contain:

- one or more existing Sellable Offering lines;
- immutable customer name, phone, and email snapshots;
- an optional initial cash, transfer, card, POS, or other payment.

Replay creates the Commercial Order idempotently, records the initial payment
inside the same Order transaction, and creates or reuses a tenant Customer
directory record when a customer name was captured. Contact-backed Customer
projection uses conflict-safe insertion so concurrent device replay reuses the
winning directory row.

When `offlineApprovalRequired` is on, staff commands are staged durably before
that transaction runs. Owner, Admin, and Manager offline Orders apply directly;
Cashier and Operator Orders wait for management approval.
Approval applies the original staff-authored command atomically, while
rejection discards it. A semantic failure during approval becomes a normal
typed conflict.

## Explicitly Online-Only

- Product or Service creation and configuration;
- stock receipt, count, adjustment, transformation, custody, and closeout;
- Staff invitation or membership changes;
- Service Intake, progress, assignment, notes, evidence, handoff, or customer
  messaging;
- standalone Customer directory creation;
- payment collection outside the newly queued Order checkout.

The strict API payload schema rejects these operations even if an older client
attempts to submit them.

Mobile also removes search inputs and disables Product/Service creation entry
points while offline. Cached operational lists may remain visible, but no
local search result is presented as authoritative.

## Queue And Conflict Behavior

- Commands retain stable client ids, payload hashes, event version, device,
  tenant, Store, and conflict state.
- Unsupported persisted mobile command shapes are discarded at queue schema
  version 3.
- Replay still applies normal role, Store, Offering, stock, price, revision,
  idempotency, payment, and tenant validation.
- A null-conflict `REVIEW_REQUIRED` command is a staged approval record. A
  non-null conflict code identifies reconciliation work.
- Replay preserves staged and conflict states until an explicit review action.
  Devices may reconcile existing review outcomes after new offline work is
  disabled.
- More contains an Offline section with the approval-policy summary and staged
  records. Owner, Admin, and Manager may approve or reject from management UI.
