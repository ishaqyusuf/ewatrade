import { getStorefrontDomain } from "@ewatrade/utils"

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
) {
  if (!phone || !/^\+[1-9]\d{6,14}$/.test(phone)) return null
  const url = new URL(`https://wa.me/${phone.slice(1)}`)
  url.searchParams.set(
    "text",
    `Hello, I’d like to ask about ${name.slice(0, 180)}.\n${itemUrl}`,
  )
  return url.toString()
}
