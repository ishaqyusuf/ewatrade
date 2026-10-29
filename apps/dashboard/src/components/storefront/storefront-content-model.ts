import type {
  StorefrontContentDraft,
  StorefrontContentField,
  StorefrontContentOutput,
} from "@ewatrade/storefront-contracts/content"

export type ContentReviewRow = {
  field: StorefrontContentField
  text: string
  selected: boolean
  edited: boolean
}
export const contentFieldHasEdits = (field: StorefrontContentField) =>
  !!field.current.trim() && field.current !== field.defaultValue
export const contentRunActive = (status: string | undefined) =>
  status === "QUEUED" || status === "RUNNING" || status === "VALIDATING"
export function selectedContentRefinements(
  rows: readonly ContentReviewRow[],
  keepEdits: boolean,
): StorefrontContentDraft[] {
  return rows
    .filter((row) => row.selected && !(keepEdits && row.edited))
    .map((row) => ({ id: row.field.id, text: row.text }))
}
export function mergeContentReview(
  current: readonly ContentReviewRow[],
  fields: readonly StorefrontContentField[],
  output: StorefrontContentOutput,
  refine: boolean,
): ContentReviewRow[] {
  const rows = output.fields.map((result) => {
    const field = fields.find((entry) => entry.id === result.id)
    if (!field)
      throw new Error("The generated content names an unavailable area.")
    return { field, text: result.text, selected: true, edited: false }
  })
  return refine
    ? current.map(
        (row) => rows.find((entry) => entry.field.id === row.field.id) ?? row,
      )
    : rows
}
