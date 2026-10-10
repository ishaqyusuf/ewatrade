"use client"
import type { GeneralReceipt } from "@ewatrade/assistant/general/contracts"
import { parseAsString, useQueryStates } from "nuqs"

/** Open registered record overlays without leaving the current workspace/chat. */
export function useAssistantReceipt() {
  const [, setParams] = useQueryStates(
    {
      customerDetail: parseAsString,
      catalogDetail: parseAsString,
      catalogDetailTab: parseAsString,
      catalogActivity: parseAsString,
      orderSheet: parseAsString,
      orderId: parseAsString,
      inventoryCount: parseAsString,
      inventoryCloseout: parseAsString,
      stockTransfer: parseAsString,
      inventoryOperation: parseAsString,
    },
    { history: "push", shallow: true },
  )
  return (receipt: GeneralReceipt) => {
    const closed = {
      customerDetail: null,
      catalogDetail: null,
      catalogDetailTab: null,
      catalogActivity: null,
      orderSheet: null,
      orderId: null,
      inventoryCount: null,
      inventoryCloseout: null,
      stockTransfer: null,
      inventoryOperation: null,
    }
    switch (receipt.kind) {
      case "customer":
        return setParams({ ...closed, customerDetail: receipt.recordId })
      case "product":
        return setParams({ ...closed, catalogDetail: receipt.recordId })
      case "inventory":
        return setParams({ ...closed, inventoryOperation: receipt.recordId })
      case "stock_count":
        return setParams({ ...closed, inventoryCount: receipt.recordId })
      case "inventory_closeout":
        return setParams({ ...closed, inventoryCloseout: receipt.recordId })
      case "stock_transfer":
        return setParams({ ...closed, stockTransfer: receipt.recordId })
      case "order":
      case "payment":
        return setParams({
          ...closed,
          orderSheet: "details",
          orderId: receipt.orderId ?? receipt.recordId,
        })
    }
  }
}
