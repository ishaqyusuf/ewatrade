import { createLoader, parseAsString, parseAsStringEnum } from "nuqs/server"

export const customerDirectoryParams = {
  customerQuery: parseAsString.withDefault(""),
  /** Balance filter on Customers (owners and admins). */
  customerShow: parseAsStringEnum(["owe", "ahead"] as const),
}

const loadCustomerDirectoryState = createLoader(customerDirectoryParams)

export async function loadCustomerDirectoryParams(
  searchParams: Parameters<typeof loadCustomerDirectoryState>[0],
) {
  const params = await loadCustomerDirectoryState(searchParams)
  return { customerQuery: params.customerQuery }
}
