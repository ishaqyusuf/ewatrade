import {
  type CatalogQuery,
  catalogQuerySchema,
} from "@ewatrade/storefront-contracts/resources"
import { getStorefrontDomain } from "@ewatrade/utils"

/** Shared query serialization: change filters without carrying a stale item/cursor. */
export function storefrontListingHref(input: Omit<CatalogQuery, "item"> = {}) {
  const query = catalogQuerySchema.parse(input)
  const params = new URLSearchParams()
  for (const key of [
    "category",
    "q",
    "availability",
    "sort",
    "after",
  ] as const) {
    const value = query[key]
    if (value) params.set(key, value)
  }
  return params.size ? `/?${params}` : "/"
}

export function storefrontItemHref(itemId: string) {
  return `/?item=${encodeURIComponent(itemId)}`
}

/** Preserve normal browser navigation for new tabs, downloads and modified clicks. */
export function handleStorefrontItemClick(
  event: {
    button: number
    metaKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
    altKey: boolean
    defaultPrevented: boolean
    preventDefault(): void
  },
  open: () => void,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return
  event.preventDefault()
  open()
}

export function serviceRequestUrl(
  origin: string,
  entry: { formId: string; offeringIds: readonly string[] } | undefined,
  item: { id: string; kind: string; options: readonly { id: string }[] },
  offeringId?: string,
  offeringIds?: readonly string[],
) {
  if (!entry || item.kind !== "SERVICE") return null
  const choices = item.options.filter((option) =>
    entry.offeringIds.includes(option.id),
  )
  const selectedIds =
    offeringIds ??
    (offeringId ? [offeringId] : choices[0] ? [choices[0].id] : [])
  if (
    !selectedIds.length ||
    selectedIds.length > 20 ||
    new Set(selectedIds).size !== selectedIds.length ||
    (offeringId && selectedIds[0] !== offeringId) ||
    selectedIds.some(
      (selected) => !choices.some((choice) => choice.id === selected),
    )
  )
    return null
  const url = new URL("/service-request", origin)
  url.searchParams.set("item", item.id)
  for (const selected of selectedIds)
    url.searchParams.append("serviceOfferingId", selected)
  return url.toString()
}

export function storefrontUrl(
  slug: string,
  platformDomain: string,
  itemId?: string,
) {
  const url = new URL(`https://${slug}.${getStorefrontDomain(platformDomain)}/`)
  if (itemId) url.searchParams.set("item", itemId)
  return url.toString()
}

/** Opens a customer-controlled draft; no message or provider call is sent here. */
export function productWhatsAppUrl(
  phone: string | null,
  name: string,
  itemUrl: string,
  selectedOptions: readonly { name: string }[] = [],
) {
  if (!phone || !/^\+[1-9]\d{6,14}$/.test(phone)) return null
  if (selectedOptions.length > 20) return null
  const labels = selectedOptions.map((option) =>
    option.name.replace(/\s+/g, " ").trim(),
  )
  if (labels.some((label) => !label)) return null
  const url = new URL(`https://wa.me/${phone.slice(1)}`)
  url.searchParams.set(
    "text",
    `Hello, I’d like to ask about ${name.slice(0, 180)}.${labels.length ? `\nOptions: ${labels.join("; ")}` : ""}\n${itemUrl}`,
  )
  return url.toString().length <= 4096 ? url.toString() : null
}

/** Selected IDs are hints; labels must come from this item's current public options. */
export function itemWhatsAppUrl(
  phone: string | null,
  item: { name: string; options: readonly { id: string; name: string }[] },
  itemUrl: string,
  optionIds?: readonly string[],
) {
  if (
    optionIds &&
    (!optionIds.length ||
      optionIds.length > 20 ||
      new Set(optionIds).size !== optionIds.length)
  )
    return null
  const options = (optionIds ?? []).map((id) =>
    item.options.find((option) => option.id === id),
  )
  if (options.some((option) => !option)) return null
  return productWhatsAppUrl(
    phone,
    item.name,
    itemUrl,
    options.filter((option) => option !== undefined),
  )
}
