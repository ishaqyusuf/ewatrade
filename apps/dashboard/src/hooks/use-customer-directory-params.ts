"use client"

import { customerDirectoryParams } from "@/hooks/customer-directory-params"
import { useQueryStates } from "nuqs"

export function useCustomerDirectoryParams() {
  const [params, updateParams] = useQueryStates(customerDirectoryParams)

  return {
    customerQuery: params.customerQuery,
    setCustomerQuery: (value: string) =>
      updateParams(
        { customerQuery: value || null },
        { history: "push", shallow: true },
      ),
  }
}
