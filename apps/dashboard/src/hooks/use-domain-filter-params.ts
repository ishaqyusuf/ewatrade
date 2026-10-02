"use client"

import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs"

export const DOMAIN_CONNECTION_STATUSES = [
  "OWNERSHIP_PENDING",
  "DNS_CONFIGURING",
  "VERIFYING",
  "ACTIVE",
  "FAILED",
  "DISCONNECTED",
] as const

export type DomainConnectionStatus = (typeof DOMAIN_CONNECTION_STATUSES)[number]

const domainFilterParams = {
  domainQuery: parseAsString,
  domainStatuses: parseAsArrayOf(
    parseAsStringEnum([...DOMAIN_CONNECTION_STATUSES]),
  ),
}

export function useDomainFilterParams() {
  const [params, setParams] = useQueryStates(domainFilterParams)
  const query = params.domainQuery ?? ""
  const statuses = params.domainStatuses ?? []

  function setFilters(values: {
    domainQuery?: string | null
    domainStatuses?: DomainConnectionStatus[] | null
  }) {
    return setParams({
      ...values,
      ...(values.domainStatuses !== undefined
        ? {
            domainStatuses: values.domainStatuses?.length
              ? values.domainStatuses
              : null,
          }
        : {}),
    })
  }

  return { query, setFilters, statuses }
}
