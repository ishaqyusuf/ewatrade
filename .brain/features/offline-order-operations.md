# Offline Order Operations

## Purpose

Allow a business owner to decide whether staff may work offline while keeping
the offline surface limited to the minimum checkout workflow.

## Owner Policy

- `offline.settings` returns the tenant policy to authenticated commercial/POS
  roles.
- `offline.updateSettings` is restricted to the `OWNER` role.
- The policy is stored in
  `Tenant.metadata.offlineOperationsEnabled`; absence means enabled for
  existing businesses.
- The mobile Sync & offline screen lets the owner enable or disable staff
  offline access and prevents a device from entering offline mode when the
  cached policy is disabled.
- An authenticated app-level reconciler refreshes the policy every 30 seconds
  while foregrounded and resets offline mode when the active business changes.
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

## Queue And Conflict Behavior

- Commands retain stable client ids, payload hashes, event version, device,
  tenant, Store, and conflict state.
- Unsupported persisted mobile command shapes are discarded at queue schema
  version 3.
- Replay still applies normal role, Store, Offering, stock, price, revision,
  idempotency, payment, and tenant validation.
