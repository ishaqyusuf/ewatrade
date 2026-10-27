# Product preparation slice — local implementation evidence

25 October 2026. Owner authorized Product slice only, relevant checks only, no
deployment. Existing approved B02 shared review card and focused Product direction
02 layout are retained. Inputs and disclosure use the existing editors/card
sections; no replacement design or independent form save authority.

## Changed behavior

General, Setup and focused Product use shared preparation. Egg Crate/Tray30 is a
visible NGN default, overridden by supplied counts; Carton12Crate resolves exactly.
Big200Carton+10Crate becomes72300; Small100Carton+10Crate becomes36300. Stated prices
200/100 per egg and6000/5500 per crate remain; suggested cartons72000/66000 are
marked. Original counts and derived-price provenance survive corrections. Sparse
phone choices and Blue30/Red50 shirts do not invent combinations or sizes.
Category/subcategory suggestions map a pinned three-category Shopify subset to
existing local presets; neutral Clothing/T-shirts is added. Unknown prices/stock
stay unknown. Incomplete drafts stay editable and receive no confirmation token;
locked validation refuses them before catalog/database work. Canonical saves,
permission scope, freshness and retry ownership are reused.

Dashboard General and Setup editors expose category and pack counts, accept
missing prices, and preserve raw counts/derived markers. Focused handback carries
choices and variant prices/stock; existing advanced/manual form is retained.
Native General compatibility preserves raw counts and derived prices, exposes
pack counts and allows blank draft prices; no native device acceptance is claimed.

## Executed evidence

- Focused deterministic selection: 54 tests/222 assertions passed before the final
  category-revision fixture. Actual mounted Dashboard editor is exercised through
  real input/save handlers in an isolated runtime (two cases within its wrapper).
  Contract cases cover raw counts, correction, independent pricing, unknown/cyclic/
  zero conversions, sparse options, invalid choices, category, focused handback,
  setup staging and canonical command mapping. API tests prove partial draft
  validation and no confirmation token even on an otherwise signed pending row.
- Model check: explicit synthetic, in-memory draft tools; no database/customer
  writes or channel messages. `product-preparation-smoke.ts` uses configured
  DeepSeek model (exact identifier in JSON), bounded five steps/60 seconds, six
  cases: eggs/phone/shirts across focused Product and Setup. All final six pass.
  First draft2669–7011ms; full turn3736–8007ms. This is a bounded sample, not a
  production SLA or a claim of full General/WhatsApp runtime evaluation.
- Initial diagnostic exposed unnecessary optional crate confirmation and a Setup
  reply rendering minor units as major. v1 JSON retains that diagnostic output;
  it is NOT accepted evidence. Reply policy now points to the formatted card;
  v2 JSON records all six accepted samples. No stochastic rerun-until-green gate.
- Package typechecks: Assistant7 existing diagnostics; API8 existing diagnostics;
  Dashboard7 after repairing the newly exposed setup input/output default type
  mismatch. Remaining errors concern channel test typing, storefront/service
  fixtures and general allowance nullability, outside this change. No diagnostic
  remains in changed product source. Mobile whole-project tsc exhausted its4GB
  heap; not retried with a larger unrelated check. Source review is the native
  compatibility evidence. Do not report any full-project typecheck as passing.
- Scoped Biome fixes applied. Existing native order editor array-index-key finding
  remains outside changed product lines; no unrelated repair. Final product files
  and impact check results are appended below when executed.

## Evidence reuse and delivery boundary

Existing tenant/Store authority, stale signed review, expiry, transaction rollback
and committed replay mechanisms are unchanged. Reuse their earlier evidence for
those unchanged mechanisms; the new validation/readiness boundary has its own
focused checks. No schema, DB fixture, broad commerce suite, device/viewport
matrix, deployment, provider setting or customer-message test was run.

Coverage regeneration also catches stale documentation for existing storefront,
service and review-link source already present at HEAD. The impact record labels
that snapshot synchronization separately from this product implementation. It
neither enables those capabilities nor claims their acceptance.

WhatsApp uses the shared contract, but actual delivery, compact-link editing and
complete save acceptance are not established by these local checks. Canonical
Workshop/private Site case revisions for the changed conversation must be reviewed
in the channel release work before live acceptance; no Site publication is part
of this no-deployment task. Historical Workshopv26/privateSitev14 and previous Egg
acceptance remain attached to their exact old behavior. Orders, services, full
taxonomy coverage and post-release observation remain separate slices.

## Final local checkpoint

Final category-revision/default and price-disclosure selection:13tests/55assertions
passed (includes one new case beyond the preceding54-test selection). Scoped
Biome:37files checked; the previously identified unchanged native order index-key
line is the sole excluded file finding, reviewed separately from its product diff.
`bun assistant:impact` passed:1record covers capability/api/client/domain;
5capability and30procedure snapshot rows. Product capability version2 is source
only; the other row changes are documented snapshot synchronization. `git diff
--check` passed. Required Brain impact review completed: feature, API contract,
policy ADR, canonical plan and task indices updated. No DB documentation change
is required because no database schema, relationships or migration changed.

Local Product delivery is complete within the no-deployment boundary. Full
28-ticket acceptance is not claimed; channel review and release evidence remain
explicitly open in the canonical plan.
