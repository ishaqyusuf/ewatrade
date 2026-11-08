# Website and dashboard payment audit — 8 November 2026

Current owner decision: **Paystack only**, with the USD domiciliary account deferred.
[Current implementation/setup packet](paystack-only-2026-11-08.md). The earlier
provider audit/preparation below is retained as historical evidence.

## Confirmed continuation

The owner confirmed **Polar** for international web payments and reaffirmed the
existing pricing plan; no new pricing decision is requested. Nigeria remains
NGN5,000/15,000/30,000 monthly; other Africa uses comparable baseline prices;
outside Africa uses NGN6,000/18,000/36,000 as the +20% conversion reference.
The canonical policy is in `docs/billing/mobile-free-launch-2026-11-06.md`,
Confirmed commercial policy / Regional pricing walkthrough. Its free-first
launch choice is superseded; its commercial policy is retained.

Paystack/Polar transport clients, strict product configuration, price-reference
checks and signed-webhook authenticators are now prepared in
`@ewatrade/payments/web-subscriptions`. They are **not connected to the dashboard
API or entitlement fulfillment**. No server/provider activation occurred and
zero working dashboard subscription checkouts remain the current runtime result.
Read [provider preparation](web-provider-preparation-2026-11-08.md) for code,
checks, existing Polar account findings and the remaining implementation boundary.
The initial audit below describes the starting source state.

Status: navigation repaired locally; direct subscription payment remains unfinished.
Owner request: inspect both expected providers, replace paid-plan Contact links,
and prepare everything possible before returning for missing account details.
No push, deployment, provider configuration, real payment or entitlement change.

## Provider inventory

| Provider | Present source | Website subscription readiness |
| --- | --- | --- |
| Paystack | `packages/payments/src/index.ts` hosted checkout/refund adapter; separate domain and prescription webhooks | Not connected to dashboard software subscriptions. No subscription checkout, owner receipt/coverage integration or renewal lifecycle in this path. |
| Stripe | Billing enum, normalized internal provider-event schema and DB mapping | Placeholder only. No Stripe API client, hosted checkout or signed Stripe webhook integration found. This does not establish that Stripe is the international provider the owner remembers. |
| Apple App Store | Native purchase verification and notification code | Separate mobile billing; not a website checkout provider. Paid acceptance remains in the existing Apple packet. |
| Google Play | Native purchase verification and notification code | Separate mobile billing; not a website checkout provider. Paid acceptance remains in the existing Android packet. |

Therefore there are **zero payable dashboard subscription integrations** today,
one existing general hosted web payment adapter (Paystack), and no implemented
international web checkout found in this checkout. Manual customer transfer
confirmation is another business flow, not software subscription checkout.

The local root profiles contain no Paystack/Stripe/Polar/Paddle/Flutterwave/Dodo
credential entries. Read-only `vercel env ls production --format json --cwd apps/api`
lists 70 project environment entries, none named for those providers. Only names
were retained; no secret values were exported or changed. Project inventory is
not a provider-account probe or proof about separately managed secrets.

## Reproduced causes and local repairs

1. The rendered launch pricing buttons used `/contact` for every paid tier.
   Both pricing helpers now direct existing account holders to the canonical
   dashboard `/settings/billing` route. Free signup retains its existing gate.
   Labels say Choose Starter/Growth/Pro; copy describes checkout availability
   without promising an enabled payment service. A browser click preserves
   `/settings/billing` through login and reaches the existing plan screen.
2. The dashboard mutation previously only toasted `intent.message`. It now
   navigates to a valid absolute HTTPS checkout URL when one is returned,
   rejects malformed/insecure destinations, prevents overlapping upgrade clicks,
   and retains errors in an accessible on-page notice. Opening checkout never
   grants a plan or claims a payment completed.
3. The backend still deliberately returns `provider: none`, `checkoutUrl: null`
   and `provider_not_configured`. Its message now states that online checkout is
   unavailable and no payment has been taken, instead of sending web users to
   mobile store billing. Existing intent persistence and authorization are intact.

These are handoff repairs. They do **not** implement the absent provider checkout,
verified subscription fulfillment, billing management or renewal/refund lifecycle.
The dashboard's existing free-during-launch copy and grants are not a paid cutover.

## Work remaining and owner handoff

Four task milestones are retained: audit, direct checkout, focused verification,
and live setup/acceptance. Audit and focused local verification are complete
(2/4, 50% milestone progress, not coverage); direct checkout and live acceptance
remain open. The committed handoff repairs are a partial step toward checkout.

- [x] Identify provider code, reproduce the Contact path and inspect configuration names.
- [ ] Implement direct owner-wide website subscription checkout and fulfillment.
- [x] Verify this local handoff change with source checks and one focused browser session.
- [ ] Configure and accept both intended providers on the reviewed target.

When the owner returns:

1. Completed: owner confirmed Polar. Stripe remains an unused placeholder.
   The accessible Polar organization is Zeroes and One Hi-Tech; its active catalog
   contains AfterService products, with no active EwaTrade product observed.
2. Make the EwaTrade Paystack test/live account credentials available through
   approved secret configuration. Confirm account eligibility for subscription
   billing; do not paste secret keys into chat. Provide the international account
   access/credentials through the same secure route.
3. Apply the existing approved regional policy above to EwaTrade's provider
   products and retain their actual currency/price/territory mapping. This is
   provider configuration work, not a request to decide the prices again.
   Keep Apple price-point exports separate from Polar offers and retain grants.
4. Finish server-selected provider checkout, owner-account purchase binding,
   explicit business coverage, duplicate-purchase protection and signed event
   reconciliation for paid activation, renewal/failure, cancellation, expiry,
   refund and replay. Reuse owner-wide authority rather than selling legacy
   Tenant-bound checkout as coverage for 1/3/10 separate businesses.
5. Verify an exact non-production candidate using provider sandbox success,
   failure/cancel, signature/replay, wrong owner/amount/currency and lifecycle
   cases. Keep native Apple/Play purchase and conflict protections intact.
6. Review the deployment/activation candidate and obtain the required target
   authorization before rollout. This task did not authorize a deployment.

## Focused verification

- `bun run qa:doctor --offline`: pass; profile isolation/dependencies/client presence.
- Local service doctor initially failed without the Portless CA; using the existing
  `NODE_EXTRA_CA_CERTS=$HOME/.portless/ca.pem` passes API/dashboard/marketing.
- Rendered pricing regression: initially 0 pass / 2 fail (`/contact` instead of
  dashboard billing); repaired version passes.
- Final focused checkout/navigation/Paystack/subscription, rendered analytics and
  QA provider-boundary tests: 59 pass / 198 assertions across seven files.
  Paystack requests use a stubbed HTTP transport, not a processor account.
- Marketing TypeScript passes. Dashboard's default 4 GB compiler exhausted its
  heap; the normal full check passes with `NODE_OPTIONS=--max-old-space-size=12000`.
- Payments package full TypeScript remains blocked by four existing `typeof fetch`
  fixture casts in `paystack-banking.test.ts` (56, 75, 130, 153). No diagnostic is
  in the added Paystack checkout contract test; these unrelated fixtures are retained.
- Standard existing-data web smoke passes after granting browser process
  permissions. The first sandboxed run failed before recording checks. Receipt:
  `.scratch/qa-release/smoke-035e2c9ff5800e3c473c05418e1d452d2a7968b6-local-web.json`.
  It is dirty local evidence with `runtimeVerified: false`, not release acceptance.
- Focused actual local browser: Choose Growth → sign-in with a preserved billing
  destination → existing Jawdah QA OWNER → Plan and billing. Upgrade returns a
  persistent refusal; current Growth plan stays unchanged. Source identifies the
  existing QA provider boundary for `createSubscriptionCheckoutIntent`; no guard
  was bypassed. The UI's generic conflict text does not prove the processor was
  reached. Final QA sign-out was observed. No sale/payment/fixture was created.

- Owned-path fast smoke: 284 pass / 1,813 assertions across 56 files, plus QA
  TypeScript and changed-file Biome. Explicit owned paths exclude concurrent work;
  the plan has zero unmapped files. This is source smoke, not application acceptance.
- H01 coverage regeneration and H02 assistant impact pass with no capability or
  procedure changes. Full Dashboard TypeScript was rerun after the inline error
  notice and passes with the stated heap setting.

Source hashes and commands are in
`docs/verification/2026-11-08-web-billing-handoff.md`. Tests here do not certify a
working live provider.

## Primary provider references

- [Paystack transaction initialization](https://paystack.com/docs/api/transaction/)
  documents minor-unit amounts, callback URLs and hosted checkout responses.
- [Paystack subscriptions](https://paystack.com/docs/payments/subscriptions/)
  describes monthly plans and distinct payment/subscription lifecycle events.
  An existing one-off hosted payment adapter is insufficient subscription proof.

Brain impact: feature, API contract and in-progress task pointers updated locally.
Assistant access stays form-only through the existing manager-gated billing API;
no assistant tool, permission, payment authority, schema or entitlement changed.
