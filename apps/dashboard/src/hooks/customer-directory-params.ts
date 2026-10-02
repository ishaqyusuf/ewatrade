import { createLoader, parseAsString } from "nuqs/server"

export const customerDirectoryParams = {
  customerQuery: parseAsString.withDefault(""),
}

const loadCustomerDirectoryState = createLoader(customerDirectoryParams)

export async function loadCustomerDirectoryParams(
  searchParams: Parameters<typeof loadCustomerDirectoryState>[0],
) {
  const params = await loadCustomerDirectoryState(searchParams)
  return { customerQuery: params.customerQuery }
}
