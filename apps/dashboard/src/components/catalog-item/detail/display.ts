import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
export type CatalogDetail = RouterOutputs["catalog"]["detail"]["overview"]
export function money(value: number | null, currency: string) {
  return value === null
    ? "Price not set"
    : new Intl.NumberFormat("en-NG", { currency, style: "currency" }).format(
        value / 100,
      )
}
export function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
export function orderHref(orderNumber: string) {
  return `/sales?orderQuery=${encodeURIComponent(orderNumber)}`
}
