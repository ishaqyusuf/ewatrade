import { findCatalogCategoryPreset } from "@ewatrade/utils/catalog-category-presets"

// Reviewed subset of Shopify Product Taxonomy v2026-08. External taxonomy IDs
// are reference vocabulary, never EwaTrade database identities.
export const PRODUCT_CATEGORY_REFERENCES = [
  {
    kind: "eggs",
    taxonomyId: "fb-2-12-1-4",
    categoryKey: "poultry:eggs",
    path: "Food, Beverages & Tobacco > Food Items > Meat, Seafood & Eggs > Eggs > Whole Eggs",
  },
  {
    kind: "shirts",
    taxonomyId: "aa-1-13-8",
    categoryKey: "clothing:t-shirts",
    path: "Apparel & Accessories > Clothing > Clothing Tops > T-Shirts",
  },
  {
    kind: "phones",
    taxonomyId: "el-4-8-5-2",
    categoryKey: "electronics:phones",
    path: "Electronics > Communications > Telephony > Mobile & Smart Phones > Smart Phones",
  },
] as const

export function productCategoryReference(name: string) {
  const text = name.trim().toLowerCase()
  // Deliberately bounded: uncertain goods, accessories and composite names stay
  // unclassified instead of borrowing the category of a word in their name.
  const kind =
    /^(?:(?:big|small|large|medium|fresh|chicken|quail|organic|brown|white)\s+)*eggs?$/.test(
      text,
    )
      ? "eggs"
      : /^(?:(?:blue|red|black|white|cotton|plain|printed)\s+)*(?:t[ -]?shirts?|tees?)$/.test(
            text,
          )
        ? "shirts"
        : /^(?:samsung\s+(?:galaxy\s+)?s\d+|(?:apple\s+)?iphone\s*\d+)\b/.test(
              text,
            ) &&
            !/\b(?:case|cover|charger|screen|repair|parts?|protector)\b/.test(
              text,
            )
          ? "phones"
          : undefined
  return PRODUCT_CATEGORY_REFERENCES.find((entry) => entry.kind === kind)
}

export function productCategoryLabel(
  key: string | undefined,
  selectedLabel?: string,
) {
  if (!key) return undefined
  if (/^shopify:[a-z0-9-]+$/.test(key)) return selectedLabel || undefined
  const normalized = key.replace(/^preset:/, "")
  const root = findCatalogCategoryPreset(normalized.split(":")[0])
  if (!root?.itemKinds.includes("product")) return undefined
  if (root.key === normalized) return root.label
  const child = root.subcategories.find((entry) => entry.key === normalized)
  return child ? `${root.label} / ${child.label}` : undefined
}

export const PRODUCT_PREPARATION_INSTRUCTIONS =
  "Prepare a product draft from the first description, even with missing prices or pack counts. Do not ask permission to draft. Known facts go into structured fields, not only the description. Default the counting unit to Piece unless supplied differently. For NGN whole eggs, a missing Crate/Tray count may use the visible 30-egg default; leave containsQuantity empty to let the server apply it. An explicit count always wins. For nested packs use referenceUnitName and referenceQuantity (Carton contains 12 Crate); never do stock arithmetic yourself: retain stockByUnit counts. For explicitly sealed stock, mixed bundles, batch/expiry tracking, individual serial tracking or a regulated workflow, retain the supplied facts (including stockByUnit counts on the supplied variant, with an empty selections list when there are no choices), omit normalized openingStock, and set the corresponding reviewRequirements (sealed_stock, bundle_components, batch_tracking, serial_tracking, regulated_workflow). These continue through the existing advanced Catalog/domain form; never flatten sealed packages into pooled stock, invent components or identifiers, or perform clinical decisions. Ordinary exact weight/length/volume relationships use supplied units and counts. Only create packs the merchant mentions; distinguish packaging-only information from units offered for sale. Preserve every stated selling price even if it differs from unit price times quantity. The server may propose a missing pack price and label its calculation. Never invent base prices, stock, cost, SKU or barcode. Unknown is not zero. For customer choices use options and only supplied variant combinations: Size Big/Small for eggs, Colour for shirts, Storage and RAM for supplied phone specifications. Do not invent other sizes/capacities or split colour-only stock between unspecified sizes. Recommend apparel size as optional after preparing, never as a blocking question. Set categorySuggested true for an inferred category, and false when the merchant explicitly chose it. Category and subcategory are editable suggestions; retain any merchant-selected categoryKey, use only known EwaTrade category keys. Use the category search tool for other products; it retrieves the full pinned taxonomy and relevant attributes. Use only category keys it returns, and only attribute values the owner actually supplied. Attributes can be descriptions rather than customer choices; never force optional category attributes to become variants. Known local mappings include poultry:eggs, clothing:t-shirts and electronics:phones. Ask only genuinely ambiguous identity/meaning questions; missing price/count and managerial details can be finished in the form. Corrections update the same draft; keep unrelated facts, keep original pack counts when changing conversions, and remove derivedFromUnit when the merchant explicitly overrides a suggested price. After staging products, reply only: Ready to review in the form. Translate that sentence into the owner’s language. The formatted card already shows every price, stock count, assumption and missing field; do not repeat the tool JSON numbers, ask to confirm defaults, ask for optional stock/photo/category details, or request permission to continue. Preparation is not a catalog save."
