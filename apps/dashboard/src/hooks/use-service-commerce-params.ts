import { useQueryStates } from "nuqs"
import { createLoader, parseAsString, parseAsStringEnum } from "nuqs/server"

export const SERVICE_COMMERCE_SHEET_MODES = [
  "intake",
  "request",
  "quote",
  "catalog_draft",
  "inventory_graduation",
  "media",
  "attachment_review",
  "booking",
  "fulfillment",
  "connection",
  "conversation_mode",
  "team",
  "quote_policy",
  "quote_approval",
  "entry_point",
  "availability",
  "setup",
  "success",
] as const

export type ServiceCommerceSheetMode =
  (typeof SERVICE_COMMERCE_SHEET_MODES)[number]

const SOURCE_KINDS = ["service", "prescription", "commerce_inquiry"] as const
const SUCCESS_KINDS = [
  "request",
  "catalog_draft",
  "catalog_price",
  "inventory_graduation",
  "media",
  "observation",
  "connection",
  "entry_point",
  "team_assignment",
  "quote_policy",
  "quote_approval",
  "quote",
  "offer_selection",
  "booking",
  "payment",
  "pickup",
  "delivery",
] as const

const serviceCommerceParams = {
  attachmentId: parseAsString,
  bookingId: parseAsString,
  catalogItemId: parseAsString,
  connectionId: parseAsString,
  entryPointId: parseAsString,
  mediaAssetId: parseAsString,
  membershipId: parseAsString,
  offeringId: parseAsString,
  orderId: parseAsString,
  quoteApprovalId: parseAsString,
  quoteId: parseAsString,
  serviceCommerceSheet: parseAsStringEnum([...SERVICE_COMMERCE_SHEET_MODES]),
  sourceId: parseAsString,
  sourceKind: parseAsStringEnum([...SOURCE_KINDS]),
  sourceLineId: parseAsString,
  storeId: parseAsString,
  successId: parseAsString,
  successKind: parseAsStringEnum([...SUCCESS_KINDS]),
}

export const SERVICE_COMMERCE_SHEET_RESET_PARAMS = {
  attachmentId: null,
  bookingId: null,
  catalogItemId: null,
  connectionId: null,
  entryPointId: null,
  mediaAssetId: null,
  membershipId: null,
  offeringId: null,
  orderId: null,
  quoteApprovalId: null,
  quoteId: null,
  serviceCommerceSheet: null,
  sourceId: null,
  sourceKind: null,
  sourceLineId: null,
  successId: null,
  successKind: null,
} as const

/**
 * Store selection and sheet state are navigable workspace state. User actions
 * therefore create history entries so Back and Forward restore the previous
 * workspace instead of leaving the page.
 */
export function withServiceCommerceUserNavigation<T>(
  setParams: (values: T, options: { history: "push" }) => unknown,
) {
  return (values: T) => setParams(values, { history: "push" })
}

export function useServiceCommerceParams() {
  const [params, setParams] = useQueryStates(serviceCommerceParams)
  return {
    ...params,
    setParams: withServiceCommerceUserNavigation(setParams),
  }
}

export const loadServiceCommerceParams = createLoader(serviceCommerceParams)
