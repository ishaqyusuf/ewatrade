# ADR-0011: Shared Dashboard And Storefront Subdomains

## Status
Accepted

## Context
EwaTrade signup asks a business to choose a slug. The implementation previously
used that slug to create storefront, POS, and dashboard hostnames, including
`<business>-dashboard.ewatrade.com`. This couples an authenticated platform app
to a public business address and makes business switching depend on host
changes.

The chosen business subdomain is product identity for the merchant's future
public storefront. Dashboard tenant context already comes from the
authenticated membership and active-tenant selection.

## Decision
- The dashboard is one shared platform surface:
  `https://dashboard.ewatrade.com` in production and
  `http://ewatrade-dashboard.localhost` in local development.
- Signup and login return the configured shared dashboard URL.
- New tenant registrations do not create internal or custom dashboard hostname
  records and do not provision dashboard domains.
- Business switching updates the active-tenant cookie and refreshes the shared
  dashboard instead of changing hosts.
- `<business>.ewatrade.com` is reserved for the business storefront. Storefront
  publication remains gated by the storefront publishing workflow.
- Legacy tenant-dashboard hostname parsing may remain temporarily for backward
  compatibility, but no new flow may generate or depend on those hostnames.

## Consequences
- Authenticated dashboard routing is stable across all businesses.
- Business selection is session/cookie context, not DNS context.
- Storefront slug availability remains globally unique.
- Existing tenant dashboard hostname rows may be cleaned up separately; they
  are not required by new signup, login, or tenant-switch flows.
