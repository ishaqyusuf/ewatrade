import {
  type GeneralAnswer,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import type { createGeneralDomainCaller } from "../general-callers"
import type { readGeneralCatalogItem } from "../general-catalog-item"

type CatalogItem = Awaited<ReturnType<typeof readGeneralCatalogItem>>
type Variant = CatalogItem["variants"][number]
type Offering = Variant["offerings"][number]
type Customer = Awaited<
  ReturnType<
    ReturnType<typeof createGeneralDomainCaller>["customers"]["getById"]
  >
>
type CustomerOrder = Customer["orders"][number]
type ReadOptions = { storeId: string; storeName: string; asOf?: string }
type CatalogRead = Pick<CatalogItem, "name" | "kind" | "status"> & {
  variants: Array<
    Pick<Variant, "name" | "status"> & {
      offerings: Array<
        Pick<
          Offering,
          | "name"
          | "status"
          | "fixedPriceMinor"
          | "currencyCode"
          | "pricingPolicy"
          | "stores"
        >
      >
    }
  >
}
type CustomerRead = Pick<Customer, "name" | "phone" | "email"> & {
  orders: Array<Pick<CustomerOrder, "orderNumber" | "status" | "paymentStatus">>
}

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

function price(offering: CatalogRead["variants"][number]["offerings"][number]) {
  if (offering.pricingPolicy === "quote_required") return "Quote required"
  if (offering.pricingPolicy === "order_total") return "Price set on the order"
  if (
    offering.fixedPriceMinor === null ||
    !Number.isSafeInteger(offering.fixedPriceMinor) ||
    offering.fixedPriceMinor < 0 ||
    !/^[A-Z]{3}$/.test(offering.currencyCode)
  )
    return "Price unavailable"
  return generalMoney(offering.fixedPriceMinor, offering.currencyCode)
}

/** Presentation of the already-authorized canonical item; never computes stock or chooses a unit. */
export function catalogItemReadAnswers(
  item: CatalogRead,
  options: ReadOptions,
): GeneralAnswer[] {
  const asOf = options.asOf ?? new Date().toISOString()
  const scope = `${label(options.storeName, 300)} · catalog pricing and Store availability`
  const rows = item.variants.flatMap((variant) =>
    variant.offerings.map((offering) => ({ variant, offering })),
  )
  const shown = rows.slice(0, 10)
  return [
    {
      id: `catalog_item_${crypto.randomUUID()}`,
      title: label(item.name, 160),
      value: `${item.kind} · ${item.status}`,
      scope,
      asOf,
      detail: `Saved catalog item. ${shown.length} of ${rows.length} saved offerings shown${rows.length > shown.length ? "; further offerings are omitted—open the item in EwaTrade for the full list" : ""}. Prices belong to the named offering and variant; ask which one when several match. Store selling availability is separate from item, variant and offering status. No stock balance, reservation or guaranteed fulfilment is inferred. Long names may be shortened.`,
    },
    ...shown.map(({ variant, offering }): GeneralAnswer => {
      const availability = offering.stores.find(
        (store) => store.storeId === options.storeId,
      )
      const availabilityText = availability
        ? availability.isAvailable
          ? "Available for selling in this Store"
          : "Unavailable for selling in this Store"
        : "Store selling availability not recorded"
      return {
        id: `catalog_offering_${crypto.randomUUID()}`,
        title: label(offering.name, 160),
        value: price(offering),
        scope,
        asOf,
        detail: `Variant: ${label(variant.name, 240)} (${variant.status}). Offering: ${offering.status}. Item: ${item.status}. ${availabilityText}. All statuses apply together; an available Store setting alone does not make a draft or archived item, variant or offering sellable. Price is not a stock balance or an order total.`,
      }
    }),
  ]
}

/** Saved directory contacts and a bounded slice of the RPC's authorized order facts. */
export function customerReadAnswers(
  customer: CustomerRead,
  options: Pick<ReadOptions, "storeName" | "asOf">,
): GeneralAnswer[] {
  const asOf = options.asOf ?? new Date().toISOString()
  const orders = customer.orders.slice(0, 5)
  return [
    {
      id: `customer_${crypto.randomUUID()}`,
      title: label(customer.name, 160),
      value: "Saved customer",
      scope: "Current business · customer directory",
      asOf,
      detail: `Phone: ${customer.phone ? label(customer.phone, 120) : "not recorded"}. Email: ${customer.email ? label(customer.email, 320) : "not recorded"}. ${orders.length} recent authorized order${orders.length === 1 ? "" : "s"} shown below. This is a limited recent-order page, not a complete customer history, debt, balance or unique-buyer count. Contacts and long names may be shortened.`,
    },
    ...orders.map(
      (order): GeneralAnswer => ({
        id: `customer_order_${crypto.randomUUID()}`,
        title: label(order.orderNumber, 160),
        value: label(order.status, 160),
        scope: `${label(options.storeName, 300)} · authorized recent customer orders`,
        asOf,
        detail: `Recorded payment status: ${order.paymentStatus}. Order status and payment status are separate saved facts. No paid amount, outstanding balance or customer debt is inferred.`,
      }),
    ),
  ]
}
