"use client"

import { parseAsString, parseAsStringEnum, useQueryStates } from "nuqs"

export const INVENTORY_OPERATION_MODES = [
  "adjustment",
  "count",
  "custody",
  "receipt",
  "transfer",
  "transformation",
] as const

export type InventoryOperationMode = (typeof INVENTORY_OPERATION_MODES)[number]

const inventoryParams = {
  inventoryOperation: parseAsStringEnum([...INVENTORY_OPERATION_MODES]),
  inventoryQuery: parseAsString,
}

export function useInventoryParams() {
  const [params, setParams] = useQueryStates(inventoryParams)
  const operation = params.inventoryOperation
  const query = params.inventoryQuery ?? ""

  function updateParams(
    values: {
      inventoryOperation?: InventoryOperationMode | null
      inventoryQuery?: string | null
    } | null,
  ) {
    return setParams(values === null ? { inventoryOperation: null } : values)
  }

  return { operation, query, setParams: updateParams }
}
