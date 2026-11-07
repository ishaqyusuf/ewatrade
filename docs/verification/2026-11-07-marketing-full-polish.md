# Marketing full polish — 7 November 2026

Status: complete Workshop deliverable, ready for owner design review. Product
implementation, selection and deployment are outside this request.

## Exact review revision

- [Review Whole Business v18](https://workshop.localhost/ewatrade/marketing/complete-business-2026-10-29/directions/01?rev=06f5bfbf-714e-4c91-8840-6512d15e2214).
- Canonical collection: `ewatrade/marketing/complete-business-2026-10-29`, direction `01`.
- Final immutable revision: `06f5bfbf-714e-4c91-8840-6512d15e2214` (v18).
- Full-polish draft v17 `97ff82c1-dd94-4ae6-8544-df21149c72eb` is retained.
- Built from warm v16 `1586234c-751a-40d7-97d6-ee2be3e1c502`, itself the exact
  selected/implemented v15 archive plus the warmer color stylesheet.
- Selection remains v15 `de2f9a33-56be-4bc5-a5f4-c18539494012`; its sole
  implementation receipt remains `0306d64e-32d8-4f78-aec8-d6b3a4e1a276`.
- Catalog read-back confirms five directions and one implementation; all previous
  revisions and choices remain. v18 is explicitly not implemented.
- Source: shared Workshop `work/ewatrade/marketing/complete-business-2026-10-29/polished-2026-11-07`.
- Actual author: Codex coordinator under standing takeover. Exact Claude
  `claude-opus-5-5 --effort high` previously exited before authoring with expired
  OAuth (401). No substitute model or repeated launch; this pass continues that
  established fallback. Workshop, Impeccable and Copywriting guidance applied.

## All nine refinements applied in the preview

1. **Warmer brand palette:** retained v16 ivory, sand, terracotta and warm ink,
   its dark theme, and the separate WhatsApp green.
2. **Credible examples:** removed QA labels, test references and internal copy.
   Jawdah Poultry / Main store and illustrative Amina Bello records now form a
   coherent example. Explicit example-business disclosure avoids presenting
   these records as customer proof or endorsement.
3. **Typography:** consistent serif section-heading role, intentional sans
   WhatsApp headline and readable sans utility/price figures. Price font corrected
   in v18 after visual review.
4. **Hero:** preserved centered composition and two-line desktop message, reduced
   excess vertical space and controlled phone line breaks without orphaned paid.
5. **WhatsApp:** tightened repeated message/draft/approval copy. Final headline
   is “Tell EwaTrade what you sold.” Review-before-save remains explicit.
6. **Feature copy:** outcome-led captions in the same eight-item grid. Reports
   says “See what sells and when”; links target matching examples or walkthrough
   states, with distinct stock/team/customer targets.
7. **Product preview:** aligned example customer, business and sales records;
   four crates at 4,500 total 18,000 before additional charges; WhatsApp example
   includes 1,500 delivery, totaling 19,500. Improved muted-label readability and
   subtle selected-order emphasis. Native/offline stays Coming soon.
8. **Pricing:** paid actions explicitly say Contact us for the named plan. Monthly
   assistant use is explained as questions and drafts; final allowance is confirmed
   through contact, with no invented numerical entitlement. Free limits remain.
   Collapsed comparison follows current runtime marketing-offers.ts; FAQ states
   assisted activation and no payment in the preview.
9. **Navigation:** sticky-header offsets and local preview anchor handling fixed.
   In-page navigation scrolls to the correct example without the shared embed
   handler discarding local demo state.

## Layout and implementation boundary

All ten section IDs/classes and their order match v16. Existing centered hero,
section composition, grids, phones, content relationships and local interactions
are retained; spacing, text and presentation are refined in place. The comparison
is a disclosure within the existing pricing section, matching current runtime.
No new standalone design or product route was created. Compared with v16, source
changes are index.html and product-preview.js plus new polish.css/polish.js;
warm-colors.css and other bundled assets are unchanged.

This is an archived, simulated design. Contact/CTA handoffs remain local previews;
no signup, sale, payment, message, provider call or production write was submitted.
Existing differences between the Workshop archive and runtime are not release
acceptance. Exact owner approval of this revision is required before implementation.

## Verification and limits

- Canonical archived v18 rendered in shared Workshop; its Not implemented status
  and exact revision observed. Final review tab retained with viewport reset.
- Full-polish v17 desktop/390px/320px/768px inspection; document/client widths
  matched at 390 and 320. Two headline lines measured at 390px.
- v18 final copy and price-font corrections reviewed on desktop in light/dark;
  768px document/client widths both 768. Mobile layout CSS unchanged from v17.
- Header Features anchor lands visibly below sticky navigation. Reports link
  selects the matching walkthrough. Customer deep link, mobile menu, pricing
  contact preview and collapsed comparison exercised.
- Counter quantity increments from four to five and returns to four; Proceed
  reaches customer step and Back returns to items. Preview reset afterward.
- No error-level messages returned by the browser console capture.
- Static HTML check: ten-section sequence retained, unique IDs and all 28 hash
  links resolve; no QA/FCA/internal immutable-order wording remains.
- node --check passes for polish.js and product-preview.js. Impeccable detector
  found no issues in the polish stylesheet before the final price-font refinement.
- Existing v16 scoped contrast evidence carries forward for unchanged palette;
  no claim of a comprehensive accessibility or live product acceptance audit.
- Repository verification is scoped to this owned documentation, excluding
  concurrent billing/API/mobile changes. See final validation below.

## Brain impact

Updated local `.brain/features/marketing-launch-v4.md` and created
`.brain/tasks/2026-11-07-marketing-full-polish.md`. The repository ignores Brain;
this tracked receipt preserves the exact review/verification record in Git.

## Final validation

Owned-document source smoke passed: 48 tests, 211 assertions, zero failures;
QA tooling typecheck passed. All three owned documentation paths were explicitly
scoped, with no unknown mappings. This excludes concurrent work and is not product
or release acceptance. No application source was edited.
