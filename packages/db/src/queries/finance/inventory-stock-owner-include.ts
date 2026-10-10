import type { Prisma } from "../../../generated/prisma/client"

export const stockOwnerInclude = {
  store: { select: { id: true, tenantId: true, currencyCode: true } },
  transferAcknowledgment: true,
  committedReservation: { select: { id: true, commercialOrderLineId: true } },
  purchaseReceipts: { take: 2, select: { id: true } },
  productFulfillments: { take: 2, select: { id: true } },
  productReturns: { take: 2, select: { id: true } },
  _count: {
    select: {
      movements: true,
      purchaseReceipts: true,
      productFulfillments: true,
      productReturns: true,
      finalizedCounts: true,
      finalizedCloseouts: true,
      dispatchedTransfers: true,
      receivedTransfers: true,
      cancelledTransfers: true,
      corrections: true,
    },
  },
} satisfies Prisma.StockOperationInclude
