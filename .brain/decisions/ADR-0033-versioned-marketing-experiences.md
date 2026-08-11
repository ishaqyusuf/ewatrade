# ADR-0033: Versioned Marketing Experiences

## Status

Accepted on 2026-08-11. The first draft experience, `operator-v2`, is
implemented behind preview access and is not yet production-ready.

## Context

The marketing landing page needs a complete redesign while the public lead
capture and signup paths remain available. Replacing the root page in one step
would couple visual review, copy review, lead-capture regression risk, and
production rollout. It would also make later landing-page experiments likely to
accumulate conditionals inside one route.

Halaalvest already demonstrates a useful release boundary: stable marketing
experience ids, a thin registry, explicit production readiness, and a
non-indexed preview route. Midday's website route also keeps route ownership
thin and composes the actual landing experience from a dedicated component.

## Decision

- The marketing root route resolves one typed experience id and renders it
  through a registry. Page implementation does not live in the route.
- The initial ids are `legacy-v1` and `operator-v2`; unknown configuration
  falls back to `legacy-v1`.
- `MARKETING_EXPERIENCE` requests the active experience. A server-owned
  production-readiness map prevents an unapproved draft from becoming public
  even if the environment requests it.
- `/preview/marketing/[experience]` renders a valid registered experience with
  `noindex, nofollow` metadata. Non-production environments allow previews;
  production requires `MARKETING_EXPERIENCE_PREVIEW_TOKEN` through a
  constant-time comparison.
- Every experience receives the same small contract, currently whether public
  signup is enabled. Lead capture continues to use the existing shared client
  form and API routes.
- The legacy experience remains intact as the production fallback. The new
  `operator-v2` experience may be reviewed and tested independently before its
  readiness flag is changed.
- Marketing copy must describe implemented product behaviour. Draft or future
  marketplace, dispatch, payment-hardware, or regulated-work claims do not
  become true merely because an experience is previewable.

## Consequences

- Design work can be shared at a stable URL without changing the public page.
- Production activation requires both configuration and an explicit code-owned
  readiness decision, reducing accidental launches.
- Future experiences add a typed id and registry entry rather than branching
  the root route or mutating the previous version in place.
- Preview security is intentionally lightweight and suitable for visual review;
  it is not an authenticated product surface and must not expose private data.
- The legacy page can be removed only after a later decision confirms rollback
  is no longer required.

## Rejected Alternatives

- Replace the root page directly: this removes the safe rollback and couples
  implementation with launch approval.
- Select an experience only with a query string on `/`: public crawlers and
  shared links could expose draft content without an explicit preview boundary.
- Put all versions in one conditional component: styling and copy would remain
  coupled and the route would grow with every iteration.
- Treat the environment variable as sufficient production approval: a typo or
  stale deployment configuration could publish an unreviewed experience.

## References

- `.brain/features/marketing-lead-capture.md`
- `.brain/research/2026-08-11-marketing-landing-page-ui-references.md`
- Halaalvest marketing experience registry, readiness policy, and preview gate
- Midday website root route and composed start page
