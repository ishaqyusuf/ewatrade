# SokoBook reference — Catalog form comparison

Source: owner-supplied 4:43 recording, 392 × 850, reviewed 1 October 2026. This is evidence of the recorded build, not a current competitor feature inventory. No competitor account was accessed. The video contains no audio stream.

30 distinct design screens are indexed in `index.html`, with full-resolution PNGs and nominal timestamps in `manifest.json`. The original recording (`source.mp4`) and 284 one-second JPEG samples (`frames/`) are retained for future review, including transitions not chosen for the design gallery. Authentication/OTP and system-notification screens are not promoted into the gallery. Shorter transitions remain in the original video.

## Recommendation

Retain selected mobile Direction 02. Borrow SokoBook’s discoverable additional details, editable generated code, category search/create pattern and toggle-to-threshold disclosure. Keep our stronger separation of customer choices, selling units and stock. Use one focused editor per capability instead of making the entire advanced form appear.

SKU and barcode are already present in our native source. The useful change is discoverability and explanations. The workshop now includes Advanced options → SKU & barcode, editable SKU suggestions and separate codes per customer choice in its stock-unit listing. Codes for additional selling-unit Offerings are not yet exposed by the audited native create payload and need a separate implementation decision. Suggestion generation is local only; actual uniqueness belongs to the server (existing tenant SKU/barcode constraints).

## Form fields and parity

| Competitor field or behavior | Recorded behavior | EwaTrade evidence | Direction |
| --- | --- | --- | --- |
| Item name | Visible at the top | Supported; required name | Keep in Essentials. |
| Product / Service | Inline selector | Supported; kind chosen before the named form | Keep the existing kind entry; avoid repeating the same decision. |
| Category | General selector + searchable list + create | CatalogItem.category exists; audited mobile setup does not expose/send it | Propose an optional Organization row; confirm category CRUD/filter contracts. |
| Opening stock | Stock Details input | Supported; exact base or per-choice quantity | Keep separate Stock editor; blank must remain undeclared. |
| Unit | Single Unit dropdown; not opened | Multiple selling units and exact conversions supported | Keep the richer Egg → Tray → Carton flow, with reference-unit dropdown. |
| Sales price | Stock Details input | Supported; independent option × unit prices | Keep stock-unit price in Essentials and each added unit’s price in its editor. |
| Purchase price | Input next to Sales Price | Not exposed by the audited setup; no matching field in current CatalogProduct model | Later candidate: acquisition cost must belong to an explicit stock receipt/costing policy, not silently become sales price. |
| Low-stock alert | Toggle reveals Low Stock Quantity | No matching control in audited form or threshold field in current Catalog models | Later candidate: Stock alerts editor, threshold in canonical stock units, per Store/stock pool; Service excluded. |
| Item Code + Generate | Editable numeric code; Generate visibly fills it | SKU + barcode already supported on Offering; hidden in combination More | Expose Advanced options → SKU & barcode. Suggest editable SKU; verify tenant uniqueness at real save. Do not treat generated code as manufacturer barcode. |
| Description | Additional Details textarea | Item and choice descriptions supported | Keep optional description row; allow a choice-specific override where relevant. |
| Item image | Additional Details camera/image tile | Current audited editor accepts an image link; no top-level native picker/preview | Keep visible Images row near name; native selection/storage/default/override remains implementation work. |
| Save | Sticky action; item appears in inventory | Real create flow exists; workshop save is simulated | Keep Review then Save, validation, duplicate-code errors and save recovery. |
| Customer choices | Not demonstrated | Options/variants supported | Keep separate from units; do not infer competitor absence outside this recording. |
| Separate prepared stock | Not demonstrated | Supported generic stock behavior | Keep explicit shared vs prepared choice; selecting a conversion reference never transfers stock. |
| Barcode scanning | Not demonstrated | Barcode entry supported; scanning not verified here | Keep manual entry; scanning is a separate acceptance item. |

## Other lists visible in the recording

- Item category picker: search, selected General category, Add New Category. Category creation uses a Category Name sheet. The General category shows a lock and item count in management.
- Inventory list: search plus Category, Stock and Type filters; item card shows category, item code, stock and sales/purchase columns. The dropdown options themselves are not opened in the video.
- Shortcut editor: Add Party, Sales Invoice, Payment In, Payment Out, Purchase, Add Item, Expense, Add Note, Other Income, Sales Return, Purchase Return and Quotation; drag handles, checkboxes, Cancel and Save. Presence does not verify these workflows.
- Manage Categories: Party, Item, Expense and Income Categories.
- Import Items: download sample, review/adjust, confirm/import; sample link and Select a File. Limit text appears as 500 entries and XLS support in the recorded guide; no import is performed.
- Settings: Appearance, Font Size, Language, Currency, Currency Position, Date Format, Time Format, Number Format, Privacy Mode and App Lock. Only the settings list is shown; dark appearance, size changes and privacy behavior are not tested.
- More menu also shows Business Profile, Cash & Bank Accounts, View Reports, Bill Gallery, Notebook, Calculators, Help and Support, Backup Information, About, Share, Rate and Log Out. These are reference navigation, not proposed additions to Catalog setup.
- Business-type category selection and Party Name entry are archived as onboarding/related-form references; they are separate from item categorization.

## Proposed advanced navigation

Essentials: Name → Images → stock unit → stock-unit price.
More details: Customer choices / Selling units / Opening stock / Description / Advanced options.
Advanced options now previewed: Inventory codes → select customer choice if needed → SKU / Suggest SKU / Barcode.
Next candidates to design separately: Organization (Category); Stock alerts (threshold and notification semantics); Purchase/cost (receipt and valuation ownership). These remain proposals, not accepted schema or API work.

For SKU copy, use “Your own reference for finding this product.” For Barcode, use “The printed scanning number; keep leading zeros.” Never copy one code across all choice or unit Offerings. Blank remains unset. SKU suggestions never create manufacturer barcodes or guarantee uniqueness.

## Source cross-check and limits

Checked: `apps/mobile/src/components/mobile/catalog-setup/catalog-variant-details.tsx`, `catalog-variant-model.ts`, `use-catalog-setup.ts`, `catalog-setup-model.ts`, and `packages/db/prisma/models/catalog.prisma`. Current native payload sends SKU/barcode on the canonical Offering and leaves additional-unit codes undefined. CatalogItem already has optional category and item-level image fields in current schema; the audited native create flow does not wire a category or top-level image picker. Native variant image URL and item image fields must be reconciled against the current contract before implementing default/override media. This corrects any earlier workshop inference that the schema had no item media owner.

Not shown in competitor recording: opened Unit picker, Service form, image/camera selection, barcode scanner, SKU uniqueness failures, purchase costing effects, threshold validation/notifications, opened filter options, offline save, error recovery or dark mode. Do not invent those capabilities or limitations.

This iteration changes local workshop artifacts only. It does not change native production UI, schema, APIs or live Catalog data.
