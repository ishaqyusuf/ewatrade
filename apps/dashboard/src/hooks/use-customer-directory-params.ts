"use client"

import type { CustomerFilter } from "@/components/customers/customer-list"
import { customerDirectoryParams } from "@/hooks/customer-directory-params"
import { useQueryStates } from "nuqs"

export function useCustomerDirectoryParams() {
  const [params, updateParams] = useQueryStates(customerDirectoryParams)

  return {
    customerQuery: params.customerQuery,
    customerFilter: (params.customerShow ?? "all") as CustomerFilter,
    // Typing replaces the entry so Back leaves the page, not each letter.
    setCustomerQuery: (value: string) =>
      updateParams(
        { customerQuery: value || null },
        { history: "replace", shallow: true },
      ),
    setCustomerFilter: (value: CustomerFilter) =>
      updateParams(
        { customerShow: value === "all" ? null : value },
        { history: "replace", shallow: true },
      ),
  }
}
