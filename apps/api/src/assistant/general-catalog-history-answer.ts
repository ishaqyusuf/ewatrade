import {
  type GeneralAnswer,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import type { createGeneralDomainCaller } from "./general-callers"

type Activity = Awaited<
  ReturnType<
    ReturnType<
      typeof createGeneralDomainCaller
    >["catalog"]["detail"]["activity"]
  >
>["items"][number]
function label(value: string, maximum: number) {
  if (value.length <= maximum) return value
  let result = ""
  for (const { segment } of new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment(value)) {
    if (result.length + segment.length > maximum - 1) break
    result += segment
  }
  return `${result}…`
}
function money(amount: number, currency: string | null) {
  if (
    !currency ||
    !/^[A-Z]{3}$/.test(currency) ||
    !Number.isSafeInteger(amount)
  )
    throw Error("Exact activity amount unavailable")
  return generalMoney(amount, currency)
}

/** Domain facts precede bounded display prose; never slice a quantity or amount token. */
export function generalCatalogActivityAnswer(
  row: Activity,
  options: {
    tenantId: string
    storeId: string
    itemId: string
    storeName: string
    asOf: string
  },
): GeneralAnswer {
  const metadata = `${row.at}. Actor: ${label(row.actorName ?? "not recorded", 240)}. ${row.orderNumber ? `Order ${label(row.orderNumber, 160)}. ` : ""}${row.previousAmountMinor !== null ? `Previous recorded amount ${money(row.previousAmountMinor, row.currencyCode)}. ` : ""}${row.amountMinor !== null ? `Recorded amount ${money(row.amountMinor, row.currencyCode)}. ` : ""}`
  const caveat =
    row.category === "stock"
      ? "Stock activity is a bounded preview and may omit movements; it is not an operation total or stock balance. Long display labels may be shortened."
      : "Saved event; long display labels may be shortened."
  const complete = `${metadata}${row.description}. ${caveat}`
  const detail =
    complete.length <= 1000
      ? complete
      : `${metadata}Saved description omitted because it is too long for this reply; details are shortened. Open the catalog item's Activity to inspect the retained event. ${caveat}`
  return {
    id: `catalog_event_${crypto.randomUUID()}`,
    target: {
      kind: "catalog_item",
      catalogItemId: options.itemId,
      origin: { tenantId: options.tenantId, storeId: options.storeId },
    },
    title: label(row.title, 160),
    value: row.at,
    scope: `${label(options.storeName, 300)} · item history`,
    asOf: options.asOf,
    detail,
  }
}
