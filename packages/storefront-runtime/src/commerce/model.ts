import type { StorefrontOrderLineIssue } from "@ewatrade/storefront-contracts/orders"
import type {
  PublicCatalogItem,
  PublicStockState,
} from "@ewatrade/storefront-contracts/resources"
import { z } from "zod"

import type {
  BagCheckLine,
  BagLine,
  CommerceFailure,
  CommerceResult,
  StorefrontCommerceAdapter,
} from "@ewatrade/storefront-contracts/commerce"
import { bagLineSchema } from "@ewatrade/storefront-contracts/commerce"
export { bagLineSchema } from "@ewatrade/storefront-contracts/commerce"
export type {
  BagCheckLine,
  BagLine,
  CommerceFailure,
  CommerceResult,
  StorefrontCommerceAdapter,
} from "@ewatrade/storefront-contracts/commerce"
export type { StorefrontCustomerView } from "@ewatrade/storefront-contracts/customer"

// ---------------------------------------------------------------- Bag store

const bagSchema = z
  .object({ version: z.literal(1), lines: z.array(bagLineSchema).max(20) })
  .strict()

export type BagStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
export type BagState = {
  lines: BagLine[]
  /** "memory" when browser storage is unavailable: the bag lasts for this visit only. */
  persistence: "storage" | "memory"
  /** True when stored data was unreadable and was reset. */
  recovered: boolean
}

export const bagStorageKey = (scope: string) =>
  `ewatrade.storefront.bag.v1:${scope}`

/** Reads a bag scoped to one business. Corrupt or foreign data is discarded, never trusted. */
export function readBag(storage: BagStorage | null, scope: string): BagState {
  if (!storage) return { lines: [], persistence: "memory", recovered: false }
  try {
    const raw = storage.getItem(bagStorageKey(scope))
    if (!raw) return { lines: [], persistence: "storage", recovered: false }
    const parsed = bagSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      storage.removeItem(bagStorageKey(scope))
      return { lines: [], persistence: "storage", recovered: true }
    }
    return {
      lines: parsed.data.lines,
      persistence: "storage",
      recovered: false,
    }
  } catch {
    return { lines: [], persistence: "memory", recovered: true }
  }
}

export function writeBag(
  storage: BagStorage | null,
  scope: string,
  lines: BagLine[],
): "storage" | "memory" {
  if (!storage) return "memory"
  try {
    if (!lines.length) storage.removeItem(bagStorageKey(scope))
    else
      storage.setItem(
        bagStorageKey(scope),
        JSON.stringify({ version: 1, lines }),
      )
    return "storage"
  } catch {
    return "memory"
  }
}

export function addBagLine(lines: BagLine[], line: BagLine, max = 20) {
  const existing = lines.find((entry) => entry.offeringId === line.offeringId)
  if (
    existing &&
    ((existing.intent ?? "purchase") !== (line.intent ?? "purchase") ||
      existing.preferredDate !== line.preferredDate)
  )
    throw new Error(
      "This option is already in your bag for a different date or purpose. Edit or remove it first.",
    )
  if (existing)
    return lines.map((entry) =>
      entry.offeringId === line.offeringId
        ? {
            ...line,
            quantity: addQuantity(entry.quantity, line.quantity, line.scale),
          }
        : entry,
    )
  if (lines.length >= max)
    throw new Error("Your bag can hold 20 different items.")
  return [...lines, line]
}

// ---------------------------------------------------------------- Quantities

/** Integer arithmetic on decimal strings up to 6 places. */
function toUnits(value: string) {
  const [whole = "0", fraction = ""] = value.split(".")
  return BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0"))
}
function fromUnits(units: bigint, scale: number) {
  const whole = units / BigInt(1_000_000)
  const fraction = (units % BigInt(1_000_000)).toString().padStart(6, "0")
  const trimmed = fraction.slice(0, scale).replace(/0+$/, "")
  return trimmed ? `${whole}.${trimmed}` : whole.toString()
}
export function addQuantity(a: string, b: string, scale: number) {
  const sum = toUnits(a) + toUnits(b)
  const max = BigInt(9999) * BigInt(1_000_000)
  return fromUnits(sum > max ? max : sum, scale)
}

/** Validate typed quantity against unit scale; returns an error message or null. */
export function quantityProblem(value: string, scale: number) {
  const trimmed = value.trim()
  if (!trimmed) return "Enter a quantity."
  if (!/^\d{1,4}(?:\.\d+)?$/.test(trimmed)) return "Enter a number, like 2."
  const decimals = trimmed.split(".")[1]?.length ?? 0
  if (decimals > scale)
    return scale === 0
      ? "Use whole numbers for this item."
      : `Use up to ${scale} decimal place${scale === 1 ? "" : "s"}.`
  if (Number(trimmed) <= 0) return "Quantity must be more than zero."
  if (Number(trimmed) > 9999) return "That quantity is too large."
  return null
}

export function stepQuantity(value: string, direction: 1 | -1, scale: number) {
  const current = quantityProblem(value, scale) ? "1" : value
  const next = toUnits(current) + BigInt(direction) * toUnits("1")
  const max = BigInt(9999) * BigInt(1_000_000)
  if (next < toUnits("1")) return "1"
  return fromUnits(next > max ? max : next, scale)
}

/** Line total in minor units; null when the price is on request or not whole. */
export function lineTotalMinor(priceMinor: number | null, quantity: string) {
  if (priceMinor === null || quantityProblem(quantity, 6)) return null
  const total = BigInt(priceMinor) * toUnits(quantity)
  if (total % BigInt(1_000_000) !== BigInt(0)) return null
  const value = total / BigInt(1_000_000)
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null
}

export function bagTotals(lines: BagLine[]) {
  let subtotal = 0
  let complete = true
  let count = 0
  for (const line of lines) {
    const total = lineTotalMinor(line.priceMinor, line.quantity)
    if (total === null) complete = false
    else subtotal += total
    count += 1
  }
  return { subtotal, complete, count }
}

// ---------------------------------------------------------------- Presentation

export function formatMoney(minor: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
    }).format(minor / 100)
  } catch {
    return `${currencyCode} ${(minor / 100).toFixed(2)}`
  }
}

/**
 * Plain wording. Unknown stock is never presented as available stock. An exact
 * count appears only with low stock and only when the server sent one (the
 * business opted in and the units are unambiguous).
 */
export function stockWording(
  state: PublicStockState | undefined,
  lowStockQuantity?: string,
) {
  switch (state) {
    case "in_stock":
      return { label: "In stock", tone: "in" as const }
    case "low_stock":
      return {
        label: lowStockQuantity ? `Only ${lowStockQuantity} left` : "Low stock",
        tone: "low" as const,
      }
    case "out_of_stock":
      return { label: "Sold out", tone: "out" as const }
    default:
      return { label: "Shop confirms stock", tone: "unknown" as const }
  }
}

export function quantityLabel(quantity: string, unit: string | null) {
  if (!unit) return quantity
  return `${quantity} ${unit}`
}

// ---------------------------------------------------------------- Request ahead

export const defaultBusinessTimeZone = "Africa/Lagos"

/** Calendar date (YYYY-MM-DD) in the business's time zone. */
export function dateInZone(timeZone: string, at = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(at)
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: defaultBusinessTimeZone,
    }).format(at)
  }
}

/** Wall-clock time (HH:mm) in the business's time zone. */
export function timeInZone(timeZone: string, at = new Date()) {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(at)
  try {
    return format(timeZone)
  } catch {
    return format(defaultBusinessTimeZone)
  }
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/** "Wed 5 Nov" for a YYYY-MM-DD date; the date is a calendar day, not an instant. */
export function formatPreferredDate(date: string) {
  const value = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(value.getTime())) return date
  const part = (options: Intl.DateTimeFormatOptions) =>
    value.toLocaleDateString("en-GB", { ...options, timeZone: "UTC" })
  return `${part({ weekday: "short" })} ${part({ day: "numeric" })} ${part({ month: "short" })}`
}

/** "Lagos" from "Africa/Lagos". */
export function zoneLabel(timeZone: string) {
  return (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ")
}

/** 15-minute preferred-time choices, "00:00" to "23:45". */
export const quarterHourTimes = Array.from({ length: 96 }, (_, index) => {
  const hours = String(Math.floor(index / 4)).padStart(2, "0")
  const minutes = String((index % 4) * 15).padStart(2, "0")
  return `${hours}:${minutes}`
})

/** "10:00" → "10:00 am" style label without shifting zones. */
export function formatTimeLabel(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number)
  const suffix = hours < 12 ? "am" : "pm"
  const hour = hours % 12 === 0 ? 12 : hours % 12
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`
}

export const isPreorderLine = (line: Pick<BagLine, "intent">) =>
  line.intent === "preorder"

/** Distinct preferred dates across request-ahead lines. One request carries one date. */
export function preorderDates(lines: readonly BagLine[]) {
  return [
    ...new Set(
      lines
        .filter(isPreorderLine)
        .map((line) => line.preferredDate)
        .filter((date): date is string => Boolean(date)),
    ),
  ]
}

/**
 * What the product page can offer right now. Manual "unavailable" wins over stock;
 * book ahead only ever creates a request, never confirmed stock.
 */
export function offeringAvailability(
  item: Pick<PublicCatalogItem, "storefrontPolicy">,
  option: Pick<PublicCatalogItem["options"][number], "stock" | "availability">,
) {
  const manual = item.storefrontPolicy?.unavailable === true
  const soldOut =
    option.stock === "out_of_stock" || option.availability === "OUT_OF_STOCK"
  return {
    manualUnavailable: manual,
    soldOut,
    blockedNow: manual || soldOut,
    bookAhead: item.storefrontPolicy?.allowBookAhead === true,
  }
}

// ---------------------------------------------------------------- Checkout draft

/**
 * Details typed on this visit, kept in session storage so a quick login or a trip
 * to /account doesn't lose them. Bounded and validated on read; cleared only once a
 * request is durably accepted.
 */
const checkoutDraftSchema = z
  .object({
    version: z.literal(1),
    customerName: z.string().max(80),
    customerPhone: z.string().max(24),
    customerEmail: z.string().max(254),
    fulfilment: z.enum(["pickup", "delivery"]),
    deliveryAddress: z.string().max(300),
    notes: z.string().max(500),
  })
  .strict()
export type CheckoutDraft = Omit<z.infer<typeof checkoutDraftSchema>, "version">

export const checkoutDraftKey = (scope: string) =>
  `ewatrade.storefront.checkout-draft.v1:${scope}`

export function readCheckoutDraft(
  storage: BagStorage | null,
  scope: string,
): CheckoutDraft | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(checkoutDraftKey(scope))
    if (!raw) return null
    if (raw.length > 4096) {
      storage.removeItem(checkoutDraftKey(scope))
      return null
    }
    const parsed = checkoutDraftSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      storage.removeItem(checkoutDraftKey(scope))
      return null
    }
    const { version: _version, ...draft } = parsed.data
    return draft
  } catch {
    return null
  }
}

export function writeCheckoutDraft(
  storage: BagStorage | null,
  scope: string,
  draft: CheckoutDraft,
) {
  if (!storage) return
  try {
    storage.setItem(
      checkoutDraftKey(scope),
      JSON.stringify({
        version: 1,
        customerName: draft.customerName.slice(0, 80),
        customerPhone: draft.customerPhone.slice(0, 24),
        customerEmail: draft.customerEmail.slice(0, 254),
        fulfilment: draft.fulfilment,
        deliveryAddress: draft.deliveryAddress.slice(0, 300),
        notes: draft.notes.slice(0, 500),
      }),
    )
  } catch {}
}

export function clearCheckoutDraft(storage: BagStorage | null, scope: string) {
  try {
    storage?.removeItem(checkoutDraftKey(scope))
  } catch {}
}

/** Presentation mode from currently public offerings only. */
export function storefrontMode(input: {
  offeringCounts?: { products: number; services: number }
  items: readonly PublicCatalogItem[]
}) {
  const products =
    input.offeringCounts?.products ??
    input.items.filter((item) => item.kind === "PRODUCT").length
  const services =
    input.offeringCounts?.services ??
    input.items.filter((item) => item.kind === "SERVICE").length
  return {
    products,
    services,
    mode:
      products && services
        ? ("both" as const)
        : products
          ? ("shop" as const)
          : services
            ? ("services" as const)
            : ("empty" as const),
  }
}

export function itemSoldOut(item: PublicCatalogItem) {
  return (
    item.kind === "PRODUCT" &&
    item.options.length > 0 &&
    item.options.every(
      (option) =>
        option.stock === "out_of_stock" ||
        option.availability === "OUT_OF_STOCK",
    )
  )
}

export function issueMessage(
  issue: StorefrontOrderLineIssue,
  currency: string,
) {
  switch (issue.reason) {
    case "price_changed":
      return issue.currentUnitPriceMinor === undefined
        ? "The price changed."
        : `The price is now ${formatMoney(issue.currentUnitPriceMinor, currency)}.`
    case "out_of_stock":
      return "This just sold out."
    case "insufficient_stock":
      return "Not enough in stock for this quantity. Try fewer."
    case "price_on_request":
      return "This item is now priced on request. Ask the shop."
    case "invalid_quantity":
      return "This quantity isn't allowed for this item."
    default:
      return "This item is no longer available."
  }
}

function hexChannels(hex: string) {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1]
  if (!value) return null
  return [0, 2, 4].map((index) =>
    Number.parseInt(value.slice(index, index + 2), 16),
  ) as [number, number, number]
}

function luminance([r, g, b]: [number, number, number]) {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two #rrggbb colours (1 when either is invalid). */
export function contrastRatio(a: string, b: string) {
  const first = hexChannels(a)
  const second = hexChannels(b)
  if (!first || !second) return 1
  const [light, dark] = [luminance(first), luminance(second)].sort(
    (x, y) => y - x,
  ) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** Readable text on an accent colour: whichever of light or dark text contrasts more. */
export function readableOn(hex: string) {
  if (!hexChannels(hex)) return "#ffffff"
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#1c211e")
    ? "#ffffff"
    : "#1c211e"
}

/**
 * The accent as a foreground on the page background (links, icons, focus rings,
 * progress): the merchant's colour, darkened or lightened just enough for 4.5:1.
 */
export function accentInk(accent: string, paper: string) {
  const from = hexChannels(accent)
  const background = hexChannels(paper)
  if (!from || !background) return accent
  const toHex = (rgb: number[]) =>
    `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`
  const target = luminance(background) > 0.18 ? 0 : 255
  for (let step = 0; step <= 20; step++) {
    const mixed = toHex(from.map((c) => c + (target - c) * (step / 20)))
    if (contrastRatio(mixed, paper) >= 4.5) return mixed
  }
  return target === 0 ? "#000000" : "#ffffff"
}

export const newClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (
          Number(c) ^
          (Math.floor(Math.random() * 256) & (15 >> (Number(c) / 4)))
        ).toString(16),
      )
