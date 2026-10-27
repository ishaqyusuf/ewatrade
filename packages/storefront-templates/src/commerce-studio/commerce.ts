import { z } from "zod"
import type { StorefrontOrderLineIssue } from "../../../storefront-contracts/src/orders"
import type {
  PublicCatalogItem,
  PublicStockState,
} from "../../../storefront-contracts/src/resources"

/**
 * Host-supplied commerce boundary. The storefront app passes server actions; Studio
 * previews pass `previewCommerceAdapter`, which never writes. Every result is plain
 * serializable data and the server re-derives all authority.
 */
export type CommerceFailure = {
  ok: false
  message: string
  field?: string
  fields?: Record<string, string>
  issues?: StorefrontOrderLineIssue[]
  retryAfterSeconds?: number
}
export type CommerceResult<T> = ({ ok: true } & T) | CommerceFailure

export type BagCheckLine = {
  offeringId: string
  available: boolean
  priceMinor: number | null
  stock: PublicStockState
  enough: boolean
}

export type StorefrontCommerceAdapter = {
  mode: "live" | "preview"
  checkBag(lines: BagLine[]): Promise<CommerceResult<{ lines: BagCheckLine[] }>>
  submitOrder(input: unknown): Promise<CommerceResult<{ receiptPath: string }>>
  submitService(input: {
    request: unknown
    extras: unknown
  }): Promise<CommerceResult<{ receiptPath: string }>>
  reply(input: {
    token: string
    kind: "order" | "service"
    reply: unknown
  }): Promise<CommerceResult<Record<string, never>>>
  withdraw(input: {
    token: string
    kind: "order" | "service"
    expectedRevision: number
  }): Promise<CommerceResult<Record<string, never>>>
  declineQuote(input: {
    token: string
    versionId: string
    reason: string
    clientMessageId: string
  }): Promise<CommerceResult<Record<string, never>>>
  requestCode(identifier: {
    channel: "email" | "whatsapp"
    identifier: string
  }): Promise<
    CommerceResult<{
      challengeId: string
      destination: string
      resendAfterSeconds: number
      testCode?: string
    }>
  >
  verifyCode(input: {
    challengeId: string
    code: string
  }): Promise<CommerceResult<Record<string, never>>>
  logout(): Promise<CommerceResult<Record<string, never>>>
  linkVerified(): Promise<CommerceResult<{ linked: number }>>
  linkReceipt(token: string): Promise<CommerceResult<Record<string, never>>>
}

const previewFailure: CommerceFailure = {
  ok: false,
  message: "This is a preview. Nothing is sent or saved.",
}
export const previewCommerceAdapter: StorefrontCommerceAdapter = {
  mode: "preview",
  checkBag: async (lines) => ({
    ok: true,
    lines: lines.map((line) => ({
      offeringId: line.offeringId,
      available: true,
      priceMinor: line.priceMinor,
      stock: "unknown",
      enough: true,
    })),
  }),
  submitOrder: async () => previewFailure,
  submitService: async () => previewFailure,
  reply: async () => previewFailure,
  withdraw: async () => previewFailure,
  declineQuote: async () => previewFailure,
  requestCode: async () => previewFailure,
  verifyCode: async () => previewFailure,
  logout: async () => previewFailure,
  linkVerified: async () => previewFailure,
  linkReceipt: async () => previewFailure,
}

/** Customer session facts the host may pass to the template. Never staff identity. */
export type StorefrontCustomerView = {
  signedIn: boolean
  label?: string
  channel?: "email" | "whatsapp"
} | null

// ---------------------------------------------------------------- Bag store

/** Non-personal bag line. Prices are display hints; the server is authority. */
export const bagLineSchema = z
  .object({
    itemId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    offeringId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    quantity: z.string().regex(/^\d{1,4}(?:\.\d{1,6})?$/),
    priceMinor: z.number().int().nonnegative().nullable(),
    currencyCode: z.string().min(3).max(3),
    itemName: z.string().max(160),
    optionName: z.string().max(160),
    unitLabel: z.string().max(40).nullable(),
    scale: z.number().int().min(0).max(6),
    photoUrl: z.string().max(2048).nullable(),
    illustrationId: z.string().max(128),
  })
  .strict()
export type BagLine = z.infer<typeof bagLineSchema>
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

/** Plain wording. Unknown stock is never presented as available stock. */
export function stockWording(state: PublicStockState | undefined) {
  switch (state) {
    case "in_stock":
      return { label: "In stock", tone: "in" as const }
    case "low_stock":
      return { label: "Low stock", tone: "low" as const }
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

/** Readable text on an accent colour (WCAG relative luminance). */
export function readableOn(hex: string) {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1]
  if (!value) return "#ffffff"
  const channel = (index: number) => {
    const c = Number.parseInt(value.slice(index, index + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance =
    0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  return luminance > 0.45 ? "#1c211e" : "#ffffff"
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
