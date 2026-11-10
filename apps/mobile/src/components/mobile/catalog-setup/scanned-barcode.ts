import type { CatalogVariantDraft } from "./catalog-variant-model"

/**
 * Puts a scanned code on one choice's draft and takes it off every other
 * draft, so a code never sits on two choices.
 */
export function placeScannedBarcode(
  drafts: Record<string, CatalogVariantDraft>,
  key: string,
  code: string,
  blank: CatalogVariantDraft,
): Record<string, CatalogVariantDraft> {
  const next: Record<string, CatalogVariantDraft> = {}
  for (const [draftKey, draft] of Object.entries(drafts))
    next[draftKey] =
      draftKey !== key && draft.barcode.trim() === code
        ? { ...draft, barcode: "" }
        : draft
  next[key] = { ...blank, ...drafts[key], barcode: code }
  return next
}
