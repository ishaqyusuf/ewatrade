# ADR: Business Profiles Personalize Recommendations Without Runtime Branching

## Status

Accepted

## Context

New merchants benefit from familiar setup suggestions for businesses such as
animal feed sales, laundry, apparel, or professional services. The platform
previously removed Store-level business templates because they made industry
examples responsible for Catalog, Inventory, navigation, and Service runtime
behavior. The accepted item-level model requires Stores to remain neutral and
derive operational capability from actual Product and Service Items.

## Decision

- Capture a versioned Business Profile during owner signup and Store setup as
  descriptive Store onboarding metadata.
- Keep the shared profile library static, JSON-backed, validated, searchable,
  and limited to recommendation metadata: copy, tags, suggested Product/Service
  kinds, and Catalog helper keys.
- Use the profile to rank relevant editable Catalog quick setups and tailor
  introductory copy. Do not use it for authorization, feature gates,
  navigation availability, inventory semantics, or Service workflows.
- Continue deriving Product/Service capabilities from actual Catalog Items and
  preserve mixed businesses as a normal Store state.

## Alternatives

- Restore Store business templates that select different runtime modules. This
  was rejected because it conflicts with the generic Catalog and mixed-business
  architecture.
- Infer the business solely from created Catalog Items. This remains useful for
  runtime capability discovery but cannot personalize the merchant's first
  empty-state setup.
- Keep an unconstrained free-text industry field. This was rejected because it
  cannot safely drive deterministic recommendations or analytics.

## Consequences

- Signup can feel category-aware before the first Catalog Item exists.
- New categories and helper mappings can evolve without schema migrations.
- Profile metadata may become stale or incomplete; clients must treat missing
  or invalid keys as neutral and keep every generic setup available.
- Any future capability that requires new runtime behavior still needs its own
  domain decision rather than being smuggled into a Business Profile.

## Implementation Notes

- `@ewatrade/utils/business-profiles` owns the versioned profile library and
  selectors.
- `Store.metadata.retailOps.onboarding` owns the Store-scoped profile snapshot.
- Tenant context exposes only a validated profile key for client ranking.
- No Prisma model, migration, industry-specific API namespace, or permission
  branch is introduced.
