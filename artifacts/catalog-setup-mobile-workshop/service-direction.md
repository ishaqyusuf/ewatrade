# Service setup — Direction 02 companion

Owner request: extend the selected mobile Product direction to Service, grounded in the connected Android flow. This is a local interactive design reference, not a shipped native change.

## The short path

1. Enter Service name.
2. Enter a known fixed price, or open **How you charge** and choose **Quote each job**. Quotes do not collect a starting price.
3. Review. Images, Category, customer choices, work tracking, description and customer guidance are optional.

Keep the named Add Service screen; do not repeat Product/Service selection inside it. The first screen has a visible Images row and a calm list of details. Each editor explains its consequence, then returns a readable summary. Preserve typed drafts when returning. The main fixed-price label is explicit; do not label a required simple-service price “optional.”

## Pricing

| Choice | What the merchant means | What the customer expects |
| --- | --- | --- |
| Fixed price | A known charge before ordering | One stated amount |
| Quote each job | The final amount depends on the request | A confirmed quote before an Order |

Simple fixed-price Service needs a valid amount. Quoted Service carries no fixed or starting amount. Zero is an explicit amount; blank remains unset. Customer choices retain independently editable pricing policy and amounts. Each fixed Offering needs its own valid amount before saving; it can instead require a quote. Keep hidden base/alternate pricing drafts when changing policy; do not copy a base price into newly added choices.

## Packages and customer choices

Open **Packages or customer choices** to name an option and choose its values. Reuse the actual shared business-catalog-guidance resolver and helper context for name/value suggestions: farming Work type → Sorting/Cleaning/Packing; laundry Garment → Shirt/Trousers/Suit. Custom names remain available. The workshop demonstrates one option group; native implementation must retain the current multi-group combinations and apply this editor pattern to each group. Do not collapse existing combinations or independently priced Offerings.

Each value opens its own pricing editor: Shirt can be R49 fixed while Trousers requires a quote. Express stays a Store Service setting. Service has no inventory, opening stock, counted unit, unit conversion, SKU or barcode controls in this proposal. None of Product’s Egg/Tray/Carton mechanics apply to Service.

## Optional work

Default **Charge only** records a Service charge on the Order and creates no tracked job. **Track work** reveals the three existing start policies:

- When the order is confirmed: payment is not required before starting.
- After required payment: hold work until the Order’s required payment is received.
- After manager release: a manager separately authorizes work; release does not mark it paid.

A quote request alone never creates confirmed work. An accepted quote creates an Order, after which the selected work gate applies. Keep the work editor focused; do not stretch the main form with the entire policy list. Optional customer guidance appears with tracked work and explains what customers should prepare. Preserve the existing authorization semantics for charge-only Service as well; hiding the tracked-work editor must not silently rewrite another Offering’s stored policy. Production item-level defaults and Offering overrides must be reconciled explicitly with the current controller.

Promised dates, assignment, private notes and job evidence belong to later intake/work. The Catalog photo describes the service; it does not publish job evidence or a storefront item.

## Shared category and theme direction

Category is optional; no selection means Uncategorized. Reuse the same preset config, merchant-used history, business suggestions, All categories, custom roots and optional children as Product. Filter preset lists by Service kind. A farming Store can still add a Service and browse all six Service roots; business suggestions are guidance, never capability gates. The demo uses local history counts, not API reads, and never assigns categories from a scenario button.

Light uses white surfaces and conventional fields. Dark uses soft charcoal with clear text contrast. Compare landing-inspired rust, palm green and original workshop teal in the same layout. Colors are centralized in theme-tokens.css and consumed through semantic variables. Native implementation must use semantic Tailwind/NativeWind classes and `useColors()` from hooks/use-color.ts, with THEME and native CSS variables kept in sync. Palette choice and global rollout remain under review.

## Connected Android audit — 1 October 2026

Device: Samsung SM-S928U1, 1080 × 2340. The latest session began in blank Add Service, quote disabled and work disabled. Captured screens 53–72 are linked from service-evidence.html, with PNG and accessibility XML retained.

Observed flow:

- Simple name and Fixed price (optional), Quote each job toggle, Description, Packages/options and Track work rows.
- Quote changes the label to Starting price (optional).
- Tracking expands work handoff, all three start policies and customer guidance into the continuous form.
- Keyboard guidance and option composers stay reachable. Farming suggestions are Work type, Produce type and Service location; Work type values are Sorting, Cleaning and Packing.
- A temporary unsaved Work type → Sorting choice generated its own pricing row. Fixed/Quote decisions are already clearly explained in the per-choice editor.
- More details reveals a customer image URL and Store availability. A visible item-level photo picker/preview is absent in the tested short form.
- Remove all Service choices confirmation has invisible title/explanation in the screenshot despite accessibility text, whose bounds overlap the actions. Its accessibility explanation also includes Product-only “stock quantities” copy. Fix kind-specific copy and sheet layout in native follow-up.
- Current simple-service save validation requires a fixed price despite the optional label. The workshop resolves that ambiguity.

No Catalog item, Order, quote, payment or job was submitted. Test-only choice-editor changes were cancelled. During the final remove-choice confirmation the development app lost its Metro connection to localhost:8082; no EwaTrade packager remained on that port. A packager on 8085 belonged to another repository and was left untouched. Screen 72 records this interruption, not successful cleanup. Final native draft restoration is unverified; do not describe it as passed.

## Verification

Browser interactions passed: missing-name/fixed-price validation; quote with no starting amount; all three work policies and manager summary; customer guidance; Service-only category list; existing-used subcategory; custom root/child, Uncategorized; duplicate choice rejection; per-choice price precision and independent fixed/quote policy; hidden base price restored after clearing choices; local sample image; review/demo save; reset; shared laundry value guidance.

Dark/light screenshots and category/work/choice states are retained under preview-evidence. Shared preset tests: 6 passing tests, 29 assertions; utilities TypeScript and scoped Biome pass. Computed contrast for 24 primary/accent/body/muted foreground/background pairs across three palettes and both themes is at least 4.5:1. This is token contrast verification, not full accessibility certification. The 390px preview is checked separately in the design record. Physical native submission and large-text/keyboard acceptance of the proposed design remain future implementation work.

## Web continuation

Carry the same meanings into the separate web workshop. Compare a wider focused editor with a persistent summary, while keeping quotes, work gates, category hierarchy and offering prices distinct. Reuse the same configuration and semantic tokens; do not copy these HTML controls into the native production app.


1 October implementation alignment: the live Service preview now follows the
current native/API contract. Quote-required offerings have no starting-price
field; every fixed-price offering requires its independent amount. Earlier
Android observations and browser evidence above describe the prior state.
This refinement introduces no new pricing API or database field.
