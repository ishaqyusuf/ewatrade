"use client"

import { useQueryStates } from "nuqs"
import { parseAsString, parseAsStringLiteral } from "nuqs/server"

export const domainSheetModes = [
  "buy",
  "connect",
  "details",
  "progress",
] as const
export type DomainSheetMode = (typeof domainSheetModes)[number]

export const domainPurchaseSteps = ["search", "owner", "review"] as const
export type DomainPurchaseStep = (typeof domainPurchaseSteps)[number]

const domainParams = {
  domainId: parseAsString,
  domainMode: parseAsStringLiteral(domainSheetModes),
  domainOrderId: parseAsString,
  domainStep: parseAsStringLiteral(domainPurchaseSteps).withDefault("search"),
}

const resetParams = {
  domainId: null,
  domainMode: null,
  domainOrderId: null,
  domainStep: null,
}

type DomainParamValues = Partial<{
  domainId: string | null
  domainMode: DomainSheetMode | null
  domainOrderId: string | null
  domainStep: DomainPurchaseStep | null
}>

export function useDomainParams() {
  const [params, updateParams] = useQueryStates(domainParams)

  return {
    domainId: params.domainId,
    domainOrderId: params.domainOrderId,
    mode: params.domainMode,
    setParams: (values: DomainParamValues | null) =>
      updateParams(values ?? resetParams, { shallow: false }),
    step: params.domainStep,
  }
}
