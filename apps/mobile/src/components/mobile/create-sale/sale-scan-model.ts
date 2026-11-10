import { addExactDecimals } from "@ewatrade/utils/exact-decimal"

export type SaleScanMatch = {
  catalogItemId: string
  offeringId: string
  itemName: string
  offeringName: string
  variantName: string
  unitName: string
  matchedBy: "barcode" | "sku"
}

export type SaleScanNoticeKind =
  | "unknown"
  | "link"
  | "invalid"
  | "unavailable"
  | "failed"

export type SaleScanNotice = {
  kind: SaleScanNoticeKind
  code?: string
  reason?: string
}

/** A repeat scan of an item already in the sale adds one more. */
export function scannedQuantity(current: string) {
  try {
    return addExactDecimals(current || "0", "1")
  } catch {
    return "1"
  }
}

/** Plain recovery copy; the scanned text is shown, never opened. */
export function saleScanNoticeCopy(notice: SaleScanNotice) {
  switch (notice.kind) {
    case "unknown":
      return {
        title: "No item uses this code",
        message: `Code ${notice.code ?? ""} is not on any item in this business.`,
      }
    case "link":
      return {
        title: "This QR code is a web link",
        message: "It is not a product code, so it was not opened.",
      }
    case "invalid":
      return {
        title: "This code can't be used",
        message: "Scan again, or find the item by name.",
      }
    case "unavailable":
      return {
        title: "This item can't be added here",
        message: notice.reason ?? "It isn't for sale in this Store.",
      }
    case "failed":
      return {
        title: "The code couldn't be checked",
        message: "Check your connection, then scan again or search by name.",
      }
  }
}

/** The sale choice for a scanned offering, or why it can't be added. */
export function scannedSaleChoice<
  T extends { id: string; disabledReason?: string },
>(offeringId: string, rows: T[]) {
  const row = rows.find((candidate) => candidate.id === offeringId)
  if (!row) return null
  return row.disabledReason
    ? ({ reason: row.disabledReason } as const)
    : ({ row } as const)
}

export function saleScanMatchName(match: SaleScanMatch) {
  return [
    match.itemName,
    match.variantName !== "Default" ? match.variantName : undefined,
    match.offeringName !== "Default" ? match.offeringName : undefined,
  ]
    .filter(Boolean)
    .join(" · ")
}
