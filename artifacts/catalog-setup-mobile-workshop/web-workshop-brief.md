# Web Catalog setup workshop — handoff brief

Status: prepared from the mobile audit; a separate web workshop has not been built or selected.

Carry forward the capability model and examples from findings.md: name/unit/price essentials, customer choices separate from selling units, optional imagery with visible selection/preview, exact independent prices and stock, explicit recipe replacement, and a readable final review. Use both proposed themes as comparison inputs, as accepted mobile Direction 02 theme studies; native theme integration remains open.

Before building: inspect the current authenticated Catalog create sheet, mobile responsive chooser, actual Store currency/profile, form context and Offering/media contracts. Read apps/dashboard/AGENTS.md and the Midday migration-planner instructions. Inspect the closest invoice-sheet analogue in the local Midday repository. Preserve the accepted 1 October responsive Catalog decision: desktop side sheet, narrow-screen Product/Service chooser followed by full-screen form, independent list filters, shared focus/escape restoration and Nuqs URL creation state.

Compare these web-specific directions with identical content:

1. Existing desktop side sheet refined into essentials and focused detail panels.
2. Wider two-column editor with form on the left and live product/review summary on the right.
3. Setup outline with separate Essentials, Images, Customer choices, Units and Stock pages.

Do not stretch the phone wizard across a desktop. Wider layouts can show relationships and review side by side while still asking the user to opt into complexity. Tablet and narrow-browser forms must keep full-screen editing and keyboard-safe actions.

Include: simple Product, Product with Size choices, Egg/Tray shared stock, prepared stock explanation, fixed/quote Service, tracked-work release policy, image missing/selected/failed/permission-denied, per-choice image override, dirty recipe replacement, incomplete pricing/stock, draft return, pending save, error retry and successful real invalidation after implementation. The web workshop itself must use local samples, not production writes.

The image default/override owner and durable media provider need an explicit implementation decision before making the preview’s top-level Images row real. Preserve existing media safety/publication restrictions. No marketplace, AI refinement, wallet or token billing expansion is implied.

Acceptance after owner selection: semantic keyboard/focus checks, desktop and narrow-browser screenshots in both themes, field-level errors, exact price/unit/stock payload assertions, Store context changes, recipe replacement, real save/refetch, and server authorization. Mobile and web share meanings and validation, while each keeps its own native interaction layout.

Mobile Direction 02 is selected. Carry forward the flat selling-unit list, Add another unit, and dropdown reference convenience: Egg → Tray of 30 → Carton of 6 trays, showing the direct 180-Egg conversion. Keep exact canonical factors, independent prices and shared/prepared stock meanings; define versioned live edit/removal safeguards. Add Advanced options → SKU & barcode with customer-choice context and separate identity per Offering; the current native payload only exposes canonical Offering codes.

Use `competitor-reference/index.html` and `comparison.md` as recorded SokoBook references. Category (existing optional CatalogItem field) is a candidate for Organization. Low-stock thresholds and purchase/acquisition cost need separate Store/pool and valuation contracts; do not add them just to match the competitor form. The recording does not demonstrate competitor multi-unit, Service, scanner, native image or dark-mode behavior.


The optional category hierarchy is now an explicit owner-requested direction: reuse the shared @ewatrade/utils/catalog-category-presets config, prefer previously used tenant/Store categories, then business suggestions, retain All/search/custom and optional children, and leave unassigned items Uncategorized. UI suggestions exist; hierarchy schema/API do not. See category-and-theme-direction.md and category-config-reference.html.

Service mobile companion: service.html and service-direction.md, with 20 latest native audit captures in service-evidence.html. Preserve Fixed price versus Quote each job, independent Offering policies/prices, charge-only versus tracked work, the three start rules and optional customer guidance. Reuse shared business-catalog-guidance option/value suggestions. Service does not receive Product inventory/unit/code sections. Dates, assignment and private evidence stay in intake/work. Carry the visible Service image row and optional category hierarchy into web without implying publication.

Palette studies now compare actual landing-inspired rust, palm green and original teal through semantic tokens in both themes; light/dark action and text pairs pass measured contrast. Native useColors(), THEME and Tailwind variables must stay consistent during the later production theme integration.
