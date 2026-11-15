import { createLoader, parseAsString, parseAsStringEnum } from "nuqs/server"

export const customerDirectoryParams = {
  customerQuery: parseAsString.withDefault(""),
  /** Balance filter on Customers (owners and admins). */
  customerShow: parseAsStringEnum(["owe", "ahead"] as const),
}

export const loadCustomerDirectoryState = createLoader(customerDirectoryParams)
