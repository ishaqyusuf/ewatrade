# Owner plan limits and non-destructive downgrade

Implemented 7 November 2026 for the paid-owner launch. This source change does
not enable billing, deploy a service or configure Play products.

| Plan | Separate businesses | Products per business | Orders per UTC month per business | New staff allowance per business |
| --- | ---: | ---: | ---: | ---: |
| Free | 1 | 10 | 50 | 0 |
| Starter | 1 | 100 | Unlimited | 2 |
| Growth | 3 | 1,000 | Unlimited | 10 |
| Pro | 10 | Unlimited | Unlimited | 50 |

Shared and mobile catalogs agree. Pro products use JSON/TypeScript `null` for
unlimited; no arbitrary large number or legacy cap is substituted. Monthly
NGN 5,000/15,000/30,000 labels are the approved reference baseline; native checkout
still displays actual store-returned territory prices and renewal terms.

## Versioned signup and grant preservation

With the existing owner-billing runtime enabled, newly created owner businesses
receive `Tenant.metadata.retailOps.billingPolicy = "owner-subscriptions-v1"`
before their first Store is created. Their baseline is Free. Completing signup
records the chosen tier as a request, not a paid grant. Retrying that cohort's
signup while the runtime is disabled cannot turn it into a free paid-tier grant.

Existing explicit launch, metadata and durable/manual grants are preserved. No
existing Tenant or `limitsSnapshot` is migrated or rewritten. Unmarked historical
businesses retain the legacy default/grant precedence; adopting an existing
business into this cohort requires a separately reviewed data migration. Missing
owner billing tables or a failed read do not create a grace period or grant.

Additional-business signup uses the verified allowance, keeps excess requested
businesses pending, and cannot raise capacity by selecting Pro in a form. All
owner business creation paths serialize on the same owner creation lock, then
the billing account lock when present. They count active OWNER memberships in
active Tenants. Existing explicit grants can independently supply a higher
allowance. Store counts and `limitsSnapshot.businesses` are not repurposed into
counts of separate Tenants. Coverage enrollment retains its own 1/3/10 cap and
existing account/tenant ownership locks.

## Expiry, grace and retained access

Capacity follows verified store state. Play `IN_GRACE_PERIOD` keeps paid capacity
through the verified expiry; equality with expiry downgrades to Free. A verified
hold, expiry or revocation also removes paid capacity. Cancellation with a paid
period remaining keeps capacity through that period. Renewal restores the saved
coverage. Neither an API outage nor a missing notification creates extra days.

The intended Play grace duration is five days, configured on the actual monthly
base plans. The existing verifier already consumes the provider's expiry; the
app must not append another five days. Actual base-plan configuration and signed
failed-renewal acceptance remain release prerequisites.

For a versioned cohort with saved coverage and a verified historical subscription,
ordinary operational features and report history remain available after lapse.
This implements the owner's choice to keep existing records usable. Historical
access is **not paid capacity**: new products, orders, staff and businesses use
the current admission allowance. The billing snapshot shows Free; synchronous
navigation/operation readers may use a retained access tier. Do not use their
access tier to admit new records or coverage. Current membership, ownership,
account activity and environment checks still apply. Explicit coverage release
or ownership loss is not bypassed by retention.

No records are archived, deleted, made read-only or selected into a smaller
active subset; existing staff are not revoked for being over quota. Product
creation takes its existing per-business transaction lock before reading the
current plan and usage. Monthly-order admission retains the existing order-number
lock and UTC count. Staff invitation retains its Tenant lock and counts active
and invited staff. Existing-record updates do not use these creation guards.

See [verification](../verification/2026-11-07-owner-plan-limits.md). Deployment,
native activation, provider setup and signed release acceptance remain separate.
