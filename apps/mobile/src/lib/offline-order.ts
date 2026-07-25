export type OfflineOrderLine = {
  approvedQuotePriceMinor?: number
  expectedBalanceRevision?: number
  expectedConfigurationVersionId?: string
  expectedFixedPriceMinor?: number
  offeringId: string
  quantity: string
}

export type OfflineOrderPayment = {
  amountMinor: number
  clientPaymentId: string
  method: "bank_transfer" | "card" | "cash" | "other" | "pos"
  note?: string
  reference?: string
}

export function buildOfflineOrderCommand(input: {
  clientCommandId: string
  customer?: {
    email?: string
    name: string
    phone?: string
  } | null
  lines: OfflineOrderLine[]
  payment?: OfflineOrderPayment
  deliveryDueAt?: Date
  fulfillNow?: boolean
}) {
  return {
    clientCommandId: input.clientCommandId,
    dependencyClientIds: [],
    eventVersion: 1,
    payload: {
      customerEmail: input.customer?.email,
      customerName: input.customer?.name,
      customerPhone: input.customer?.phone,
      ...(input.deliveryDueAt ? { deliveryDueAt: input.deliveryDueAt } : {}),
      ...(input.fulfillNow !== undefined
        ? { fulfillNow: input.fulfillNow }
        : {}),
      ...(input.payment ? { initialPayment: input.payment } : {}),
      kind: "commercial_order" as const,
      lines: input.lines,
    },
  }
}
