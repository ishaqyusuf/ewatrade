import { createLoader, parseAsString, parseAsStringLiteral } from "nuqs/server"

export const financeSupplierFilterParams = {
  supplierQuery: parseAsString.withDefault(""),
  supplierFilter: parseAsStringLiteral([
    "owe",
    "overdue",
    "ahead",
    "paid",
  ] as const),
  supplierSort: parseAsStringLiteral(["owed", "name"] as const).withDefault(
    "owed",
  ),
}

export const loadFinanceSupplierFilterParams = createLoader(
  financeSupplierFilterParams,
)
