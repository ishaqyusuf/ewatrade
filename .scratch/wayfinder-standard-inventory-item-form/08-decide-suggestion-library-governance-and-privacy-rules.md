# 08 - Decide Suggestion Library Governance And Privacy Rules

## Question

What rules should govern known variant suggestions, business-local custom suggestions, and cross-business suggestions?

**Type:** Research / product policy.

**Blocked by:** [Decide product, unit, variant, and sellable option language](03-decide-product-unit-variant-and-sellable-option-language.md).

## Resolve By

- Decide normalized matching rules for variant labels and values, including case, pluralization, punctuation, aliases, and spelling variants.
- Decide the credibility threshold for cross-business suggestions, starting with at least 2 businesses and allowing a later move to 5 or more.
- Decide what counts as a distinct business for credibility, and how tenant isolation/privacy is preserved.
- Decide whether suggestions include usage counts, popularity, business category, country/locale, or no metadata at all.
- Decide moderation and abuse handling for offensive, misleading, personally identifying, or spammy custom labels/values.
- Decide retention/deletion behavior when a tenant deletes a custom variant or product.

## Context

The user wants suggestions based on the merchant's past custom inputs and inputs from other businesses, with a credibility rule so one business cannot pollute everyone else's suggestions.

## Resolution

First implementation ships local known suggestions and typed creation only. Durable cross-business suggestions are deferred until a dedicated service can normalize labels/values, include a tenant-local history path, require at least two distinct businesses before cross-business suggestions appear, and later raise that threshold without changing the mobile form contract.
