# Ticket 01 Midday Migration Contract

## Reference Compared

Target inspected:

- `apps/storefront/src/app/r/[token]/page.tsx`
- `apps/storefront/src/app/request/[token]/page.tsx`
- `apps/storefront/src/middleware.ts`
- `apps/dashboard/src/components/customer-channels/entry-point-card.tsx`
- `packages/db/src/queries/customer-channels.ts`
- `packages/service-commerce/src/customer-channels.ts`
- `packages/utils/src/domain.ts`

Reference inspected:

- Midday feature, API/database/jobs, state/routing, and package-boundary
  standards.
- The current EwaTrade Customer Channels workspace remains the closest domain
  reference. The Midday invoice table/sheet pattern is reserved for Ticket 04,
  where a navigable queue and detail workspace actually require it.

## Migration Principle

Preserve the existing stable opaque entry capability and current request/
WhatsApp projection. Make the shared chat origin a reusable package-owned URL
contract, keep the public route a thin safe projection, and retain the old
Storefront `/r/[token]` adapter until the later Store-cohort switch.

## Filesystem Plan

- Add `packages/utils/src/customer-chat.ts` with canonical chat-origin helpers,
  keeping customer-surface URL policy separate from Tenant-domain resolution.
- Add behavioral tests in `packages/utils/src/customer-chat.test.ts`.
- Add a small Storefront host-policy module and test if middleware composition
  cannot remain explicit without it.
- Update the Storefront middleware, Customer Channels entry card, environment
  examples/contracts, and public compatibility page.
- Do not add or change Prisma models in Ticket 01.

## Route/Page Plan

- Keep `/r/[token]` as a dynamic server route.
- Resolve only the digest-backed current public projection.
- Render the existing allowed web/Prescription/WhatsApp actions with a clearer
  Store-identified compatibility experience.
- Unknown, revoked, unpublished, foreign, or ambiguous entries continue to
  resolve through the safe not-found boundary before any write.
- Permit the configured shared chat hostname in Storefront middleware without
  treating it as a Tenant storefront.

## Header And Open Button Plan

- Customer-facing hierarchy is Store identity, one direct help question, then
  currently authorized channel actions.
- The signature is a compact Store monogram and status rail derived only from
  the allowlisted Store name/current action projection.
- Newly published links and QRs use the shared chat origin. Existing links keep
  rendering through the unchanged route adapter.

## Sheet Plan

Not applicable to the public compatibility page. Customer Channels continues
to own its existing global sheet; Ticket 01 changes only the generated public
link origin.

## Form-To-Sheet Plan

No form moves in this slice. Existing Product and Prescription intake routes
stay authoritative.

## Filter/Search/URL State Plan

- The opaque path token remains the only entry state.
- No Tenant, Store, sender, customer, or content data enters search params.
- Direct reload and browser history remain ordinary URL navigation.

## Table Plan

Not applicable. The Store conversation queue is Ticket 04.

## Columns And Row Actions Plan

Not applicable in Ticket 01.

## Bottom Bar / Bulk Actions Plan

Not applicable in Ticket 01.

## API/Data Plan

- Reuse `getPublicCustomerEntryPoint`; do not introduce a second public source
  of truth.
- Preserve current digest lookup, policy evaluation, attendant readiness,
  Store scope, ambiguous WhatsApp suppression, and safe projection.
- The public route receives no caller-authoritative Tenant or Store id.
- No database or provider write is added.

## Testing And QA Plan

- Red/green package tests for canonical production and Portless chat origins,
  encoded token paths, trailing-slash normalization, and exact chat-host match.
- Existing Customer Channels repository tests prove digest scope, stable token,
  ambiguous sender suppression, safe projection, and no identifier leakage.
- Storefront/dashboard/utils typechecks plus focused Biome.
- Desktop and compact-mobile browser QA on the port-free configured chat host
  after the source slice is green.

## Open Questions

None. Production DNS/domain connection and a traffic switch remain separately
authorized release operations; source code only prepares the shared host.
