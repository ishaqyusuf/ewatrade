import { isLocalHostname, stripPort } from "@ewatrade/utils"

/**
 * Pure helpers for the platform-hosted business catalog (`/b/<slug>`). The data
 * comes from `getPlatformBusinessCatalog`, which already limits it to opted-in
 * Stores and owner-listed products.
 */

export type PlatformCatalogOption = {
  id: string
  name: string
  priceMinor: number | null
  currencyCode: string
  availability: string | null
  photoUrl?: string
}

export type PlatformCatalogItem = {
  id: string
  name: string
  description: string | null
  category: { id: string; name: string } | null
  illustrationId: string
  photoUrl?: string
  photos?: { id: string; url: string; alt: string }[]
  currencyCode: string
  priceMinor: number | null
  isFromPrice: boolean
  availability: string | null
  options: PlatformCatalogOption[]
}

export function formatPlatformPrice(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      minimumFractionDigits: minor % 100 ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(minor / 100)
  } catch {
    return `${new Intl.NumberFormat("en-NG").format(minor / 100)} ${currency}`
  }
}

export function platformItemPrice(
  item: Pick<
    PlatformCatalogItem,
    "priceMinor" | "isFromPrice" | "currencyCode"
  >,
) {
  if (item.priceMinor === null) return "Ask for price"
  return `${item.isFromPrice ? "From " : ""}${formatPlatformPrice(item.priceMinor, item.currencyCode)}`
}

export function platformAvailability(value: string | null | undefined) {
  if (value === "OUT_OF_STOCK") return { kind: "out", label: "Sold out" }
  if (value === "MADE_TO_ORDER")
    return { kind: "order", label: "Made to order" }
  return { kind: "in", label: "Available" }
}

export function platformInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase()
}

/** Marketing origin that serves `/b/...`; never derived from the request host. */
export function platformOrigin(env: Record<string, string | undefined>) {
  return new URL(
    env.MARKETING_URL ??
      env.NEXT_PUBLIC_MARKETING_URL ??
      "https://ewatrade.com",
  ).origin
}

/** Catalog link preserving only the public listing state. */
export function platformCatalogHref(
  slug: string,
  state: { q?: string | null; category?: string | null; after?: string | null },
) {
  const params = new URLSearchParams()
  if (state.q?.trim()) params.set("q", state.q.trim())
  if (state.category) params.set("category", state.category)
  if (state.after) params.set("after", state.after)
  const query = params.toString()
  return `/b/${encodeURIComponent(slug)}${query ? `?${query}` : ""}`
}

/**
 * Customer-initiated WhatsApp draft. Only public labels and the public page URL
 * go into the text; the phone must already be the public E.164 business number.
 */
export function platformWhatsAppUrl(input: {
  phone: string | null
  intent: "order" | "ask" | "business"
  businessName: string
  pageUrl: string
  item?: { name: string; option?: string | null; quantity?: number }
}) {
  if (!input.phone || !/^\+[1-9]\d{6,14}$/.test(input.phone)) return null
  const clean = (value: string) =>
    value.replace(/\s+/g, " ").trim().slice(0, 180)
  const lines: string[] = []
  if (input.item && input.intent === "order") {
    lines.push(`Hello ${clean(input.businessName)}, I’d like to order:`)
    lines.push(
      `${input.item.quantity ?? 1} × ${clean(input.item.name)}${input.item.option ? ` (${clean(input.item.option)})` : ""}`,
    )
  } else if (input.item) {
    lines.push(
      `Hello ${clean(input.businessName)}, I have a question about ${clean(input.item.name)}${input.item.option ? ` (${clean(input.item.option)})` : ""}.`,
    )
  } else {
    lines.push(`Hello ${clean(input.businessName)}, I found you on ẸwáTrade.`)
  }
  lines.push(input.pageUrl)
  const url = new URL(`https://wa.me/${input.phone.slice(1)}`)
  url.searchParams.set("text", lines.join("\n"))
  return url.toString().length <= 4096 ? url.toString() : null
}

/**
 * Local-only QA preview, mirroring the storefront's rule: every environment
 * marker must say local and the request host must be a local hostname.
 */
export function isLocalPlatformCatalogPreview(
  host: string | null,
  env: Record<string, string | undefined> = process.env,
) {
  return Boolean(
    host &&
      env.NODE_ENV === "development" &&
      env.APP_ENV === "local" &&
      env.DEV_PROFILE === "local" &&
      env.EWATRADE_ENV_MODE === "local" &&
      isLocalHostname(stripPort(host.toLowerCase())),
  )
}
