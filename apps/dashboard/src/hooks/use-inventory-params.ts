"use client"

import { parseAsString, parseAsStringEnum, useQueryStates } from "nuqs"
import { useCallback } from "react"

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
  inventoryProduct: parseAsString,
  inventoryStore: parseAsString,
  inventoryStores: parseAsString,
  inventoryBalance: parseAsString,
  inventoryPreset: parseAsStringEnum(["loss"]),
  inventoryFilter: parseAsStringEnum(["all", "reserved", "out"]).withDefault(
    "all",
  ),
}

export function useInventoryParams() {
  const [params, setParams] = useQueryStates(inventoryParams)
  const operation = params.inventoryOperation
  const query = params.inventoryQuery ?? ""

  const updateParams = useCallback(
    (
      values: {
        inventoryOperation?: InventoryOperationMode | null
        inventoryQuery?: string | null
        inventoryStores?: string | null
        inventoryStore?: string | null
        inventoryProduct?: string | null
        inventoryBalance?: string | null
        inventoryPreset?: "loss" | null
        inventoryFilter?: "all" | "reserved" | "out" | null
      } | null,
    ) => {
      return setParams(
        values === null
          ? {
              inventoryOperation: null,
              inventoryProduct: null,
              inventoryStore: null,
              inventoryBalance: null,
              inventoryPreset: null,
            }
          : values.inventoryOperation !== undefined
            ? {
                inventoryBalance: null,
                inventoryPreset: null,
                inventoryStore: null,
                ...values,
              }
            : values,
      )
    },
    [setParams],
  )

  return {
    operation,
    productId: params.inventoryProduct,
    storeId: params.inventoryStore,
    storesDetail: params.inventoryStores,
    balanceId: params.inventoryBalance,
    preset: params.inventoryPreset,
    stockFilter: params.inventoryFilter,
    query,
    setParams: updateParams,
  }
}
