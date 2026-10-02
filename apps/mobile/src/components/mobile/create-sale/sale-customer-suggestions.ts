import {
  type CommerceCustomer,
  type CommercialOrder,
  type DirectoryCustomer,
  buildCommerceCustomers,
} from "../commerce/commerce-model"

/** Saved identities stay distinct even when contact details are identical. */
export function buildSaleCustomerSuggestions(
  orders: CommercialOrder[],
  directory: DirectoryCustomer[],
): CommerceCustomer[] {
  const saved = directory.flatMap((customer) =>
    buildCommerceCustomers([], [], [customer]).map((row) => ({
      ...row,
      directoryId: customer.id,
    })),
  )
  const contacts = buildCommerceCustomers(orders).map((row) => ({
    ...row,
    id: `contact:${row.id}`,
  }))
  return [...saved, ...contacts]
}
