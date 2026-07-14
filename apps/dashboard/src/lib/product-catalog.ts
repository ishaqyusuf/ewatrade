export type ProductCatalogUnit = {
  id: string
  isDefault: boolean
  name: string
  onHandQuantity: number
  priceMinor: number
  sku: string | null
}

export type ProductCatalogItem = {
  currencyCode: string
  description: string | null
  id: string
  imageUrl: string | null
  name: string
  priceHistory: Array<{
    effectiveAt: string
    id: string
    priceMinor: number
    previousPriceMinor: number | null
    reason: string | null
  }>
  slug: string
  status: string
  units: ProductCatalogUnit[]
  updatedAt: string
}

export type ProductCatalogFilters = {
  search?: string
  status?: string
}

export function canManageProductCatalog(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role)

  return normalizedRole ? canManageSalesOperations(normalizedRole) : false
}

export function formatMinorCurrency(
  value: number,
  currencyCode = "NGN",
): string {
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value / 100)
}

export function parseMajorCurrencyToMinor(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim()

  if (!normalized) return null

  const amount = Number(normalized)

  if (!Number.isFinite(amount) || amount <= 0) return null

  return Math.round(amount * 100)
}

export function getDefaultProductUnit(product: ProductCatalogItem) {
  return (
    product.units.find((unit) => unit.isDefault) ?? product.units[0] ?? null
  )
}

export function filterProductCatalogItems(
  products: ProductCatalogItem[],
  filters: ProductCatalogFilters,
) {
  const search = filters.search?.trim().toLowerCase() ?? ""
  const status = filters.status?.trim().toUpperCase() ?? ""

  return products.filter((product) => {
    const matchesStatus = status ? product.status === status : true
    const matchesSearch = search
      ? [
          product.name,
          product.slug,
          product.description ?? "",
          ...product.units.map((unit) => unit.name),
          ...product.units.map((unit) => unit.sku ?? ""),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)
      : true

    return matchesStatus && matchesSearch
  })
}
import { canManageSalesOperations, normalizeRole } from "@ewatrade/auth/roles"
