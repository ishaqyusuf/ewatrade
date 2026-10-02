# Mobile Catalog setup — device audit and workshop

Date: 1 October 2026. Target: connected Samsung SM-S928U1, 1080 × 2340 capture, existing authenticated Jawdah Store. Its currency is R; the prototypes retain it rather than infer currency from the owner's location.

Preview: https://ewatrade-catalog-workshop.localhost

## Recommendation

Direction 02, Essentials + focused details, was selected by the owner on 1 October. The current iteration refines multi-unit relations and inventory-code discovery before native implementation. Put name, optional visible Images row, stock unit and price on a short first form. Return optional customer choices, selling units, opening stock and description as flat explained rows. Selecting a row opens a focused full-screen editor, then returns a readable summary. Do not expand all advanced sections because one capability was enabled.

Three interactive directions share the same Eggs example: 01 Guided journey (essentials → optional details → review), 02 Essentials + details, 03 Setup overview. Each has isolated draft state, Back, reset, review and a simulated completion outcome. These are comparison artifacts, not production implementations.

## Observed friction

1. Multiple-price mode leaves the base selling-price field visible but disabled. Its explanation sends the merchant to Product stock & pricing lower in the long form. Better: replace the disabled input with a linked summary for independently priced choices.
2. The option toggle bundles different prices, customer choices and selling units. Units have a separate editor, but this boundary is easy to miss. The existing draft used Size → Kg. This is an observed draft, not proof of an application error or a wrong merchant intent; it motivates clearer examples and vocabulary.
3. Customer choices, unit configuration and combination stock/pricing form one continuous scroll. Make these separate, explicitly selected tasks, with one return destination.
4. Image support exists as a Customer image link inside the option editor’s More details. There is no top-level image selection or visual preview in the audited main form. A visible optional Images row should explain product imagery, preview the chosen image and make replacement/removal easy.
5. Quick setup recommendations are useful: farming examples appear first, and descriptions explain business effects. Preserve this. Recipes must stay editable and must not invent prices or stock.
6. Replacement confirmation is defective on the captured device: action buttons are visible, while the title and consequence text are not. The XML contains the copy, so existence in the accessibility dump is insufficient evidence of visual correctness. Fix shared sheet content sizing/visibility before rollout.
7. The current dark interface relies on a near-black canvas, large filled controls, repeated heavy icons and pill status blocks. The owner explicitly dislikes this theme. The proposal uses softer charcoal, neutral readable fields, quieter flat rows and restrained mint actions.
8. Quick Fill is QA tooling. It occupies first-screen space in this authenticated tester session. Keep it out of customer-facing design comparisons and do not use its size as evidence of normal-user form density.
9. Descriptive copy/placeholder changes arrived during this audit from concurrent source work. Preserve early and later evidence; the screenshots are observed states, not a frozen build. A transient Metro syntax error in business-large-text-qa-screen.tsx appeared and was already corrected in source by the ongoing work. This workshop did not edit mobile production source.

## Theme direction

| Role | Standard light proposal | Soft charcoal dark proposal |
| --- | --- | --- |
| Screen | #FFFFFF | #1B2320 |
| Input | #F6F7F7 | #232E28 |
| Text | #182420 | #F0F3F1 |
| Supporting text | #626D69 | #AAB7AF |
| Divider/input border | #DCE2DF | #3D4A43 |
| Primary | #0D5E52 | #61D0B5 |
| On-primary | #F0FDFA | #042F2E |

Use semantic tokens in production. Keep the established mobile typography; change hierarchy and placement instead of applying a global size multiplier. A theme choice here must not silently change all unrelated screens. Verify both appearances at native font scales and screen sizes after implementation.

## Disclosure and copy contract

| Capability | Explain before entry | Reveal after selection | Return summary |
| --- | --- | --- | --- |
| Images | Help customers recognise the product | Choose file/camera, preview, replace/remove, pending/failure | Thumbnail and source/count |
| Customer choices | Sizes or colours customers choose; not a selling unit | Group name, values, price per choice | Size: Small, Large; independent prices |
| Selling units | Packs/trays are amounts bought, not customer-choice axes | Exact relationship, shared vs prepared stock, price per Offering | 1 Tray = 30 Eggs; shared stock |
| Opening stock | Quantity physically available at setup; blank is not zero | Exact quantity per independent stock pool | Declared quantities, or Not declared |
| Description | What the customer should know | Short editable text | Description added |
| Service pricing | Fixed price or quote each job | Optional starting price for quotes | Fixed / Quote |
| Service work | Does an order create a job for the team? | Tracked work and authorization to start | Confirmation / Payment / Manager release |

A Service must never reveal Product stock, unit conversions or inventory inputs. The interactive comparison is Product-focused; Service quote/work behavior was observed on Android and is carried into the implementation brief, not claimed as a fully interactive Service prototype.

## Image implementation boundary

The workshop supports local PNG/JPEG/WebP/GIF selection (10 MiB preview bound), a sample illustration, simulated camera result, thumbnail/preview, replacement, removal and pending/error/permission-denied states. Local files use browser blob URLs and are revoked on replacement/removal/reset. No image is uploaded to a service and no product is published.

Current Catalog media belongs to Offering drafts as image URLs. Do not invent an item-level image field or silently duplicate an image across all choices in production. Define whether the visible image is the default Offering image or a separate item-owned asset and how a choice overrides it. Connect this to the existing generic media safety/storage/publication boundary. Camera/gallery bytes need real authorization, upload, retry and safety support; marketplace/AI/token features are separately deferred. The full production image workflow is not implemented by this workshop.

## Device coverage

Product paths inspected: existing option draft, main essentials, description reveal, quick-setup recommendations/search, dirty replacement confirmation/cancel, empty options, custom option name and value composers, explicit completion, selling units and both stock-source descriptions, option stock/price editor, expanded image/code/Store availability settings, basic opening stock, missing-name save guard. Service paths inspected: essentials, fixed/quote pricing label transition, work tracking reveal and work-start policies. No Product or Service was submitted to Catalog.

Focused keyboard screenshots + XML focus evidence cover name, main unit, main price, opening stock, description, recipe search, option name/value composers, option opening quantity/price, image link, unit name and unit conversion. Unit default price is intentionally disabled in option-pricing mode; its attempted focus dismissed the keyboard and retained no value. SKU/barcode keyboard entry, Service inputs, real save/server failure, light-theme native screens, large text, compact-device layouts, native camera and durable image upload were not accepted by this audit. They remain implementation acceptance work.

The test temporarily navigated out of the initial unsaved form while inspecting Service. The original draft structure was restored: unnamed Product, blank unit/base price, Size → Kg, no additional unit, no description or declared stock. Final capture: evidence/52-unit-cancelled.png. Option-editor Done may update an in-memory draft; no Catalog save was submitted.

## Workshop verification

- JS syntax check passes.
- All three render and hold separate drafts; guided step transition and overview essentials entry exercised.
- Common image sample selection returns a summary in all three directions.
- Direction 02 simple Product review and simulated save exercised.
- Independent choice/extra-unit prices and per-choice stock reviewed; a misleading blank-stock notice was corrected and retested.
- Pending disables Done. Failure/retry, removal and denied-camera behavior exercised; denied-camera sample bug corrected and retested.
- Local file chooser selects and renders a 1024 × 1024 repository PNG, then removes it.
- Light/dark larger previews captured. The recommended first form keeps Images visible above stock/price.
- Full gallery/reset, modal close, no page errors and mobile-width overflow checked before handoff; see verification notes in the Brain design record.

50 native screenshots are retained; 36 process captures are linked in evidence/index.html. Some intermediate captures are duplicates or show an attempted action that did not focus the intended field; they are labelled as intermediate rather than counted as successful input tests.

## Selected Direction 02 — multi-unit and competitor iteration

The owner selected Direction 02 and requested further review of selling units. It now opens a flat list with the default counted-in unit, any number of additional units, and Add another selling unit. First Tray contains 30 Eggs. A later Carton editor offers a reference dropdown (Egg or Tray); 6 Trays immediately previews 180 Eggs. Each added unit has an independent price and explicit shared/prepared stock behavior. Reference selection clears the quantity so the merchant enters it in the newly selected unit. Conversion references are entry conveniences; exact canonical factors are stored in the local sample.

Add/Edit/Remove and editor Back work without modifying Catalog data. Changing/removing a referenced unit rebases related saved units directly to the stock unit and preserves their exact quantities/prices, with an explanatory status. Production must design appropriate inventory/version guards rather than treat a live stock conversion edit as harmless. Input quantity accepts up to two decimals; multiplication uses decimal strings/BigInt without rounding. Zero, duplicate unit names and invalid prices are rejected. Editor Back leaves saved units unchanged; reset clears the sample list and codes.

SokoBook recording review and 30-screen reference gallery: `competitor-reference/index.html`. Full parity table and field proposals: `competitor-reference/comparison.md`. Original 4:43 recording plus 284 one-second JPEG samples are retained with manifest timestamps. The gallery indexes form states and related list/settings references, excluding authentication/OTP/system surfaces. The original video covers shorter transitions. Only recorded behavior is claimed.

Advanced options → SKU & barcode now works in the local study. It explains the distinction, suggests an editable SKU and preserves barcode leading zeros. Codes remain separate per customer choice in its stock-unit listing. Native source already supports SKU/barcode; additional selling-unit Offering codes are not wired by the inspected create payload. Category is already optional on CatalogItem in schema, but not in this audited mobile setup. Purchase price and low-stock thresholds are separate proposals with acquisition-cost/Store-stock semantics to settle.

Source recheck during this iteration: current CatalogItem schema includes imageUrl/imageLinks and category; native create still uses variant image URLs. Earlier media-owner descriptions are observations of the audited UI, not proof that item image fields are absent from schema. Resolve native item/default/choice media contracts and actual durable picker behavior before implementation.

Focused browser verification: Tray → Carton 6 × 30 = 180; 2.5 × 30 = 75; zero rejected; removing Tray preserves Carton factor/price and rebases to Egg; prepared-stock explanation visible; SKU suggestion persists; barcode 0012345678905 preserves zeros; Small code does not populate Large; local console error list empty. Screenshots capture unit editor/list and inventory-code editor. No new Android/Catalog save in this iteration.


## Category/theme and current Service iteration

See category-and-theme-direction.md for the optional hierarchy, shared 22-root/88-child config, all 15 business-profile mappings, prior-use preference and palette sources. See service-direction.md and service-evidence.html for the current Add Service audit and Direction 02 companion. Twenty current Android Service states (53–72) are retained. The Service removal sheet repeats the invisible explanation defect and includes stock wording in accessibility copy. Screen 72 is a Metro interruption, not successful cleanup; final Service draft restoration is unverified. No Catalog item was submitted.
