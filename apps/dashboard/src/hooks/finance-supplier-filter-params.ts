import { createLoader, parseAsString } from "nuqs/server"

export const financeSupplierFilterParams = {
  supplierQuery: parseAsString.withDefault(""),
}

export const loadFinanceSupplierFilterParams = createLoader(
  financeSupplierFilterParams,
)
