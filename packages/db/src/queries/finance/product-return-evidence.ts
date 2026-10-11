import type { Prisma } from "../../../generated/prisma/client"

export const productReturnValuationInclude = {
      order: { include: { store: true } },
      orderLine: {
        include: {
          snapshot: true,
          productFulfillments: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            include: {
              reservation: true,
              stockOperation: {
                include: {
                  movements: {
                    include: {
                      balanceSource: {
                        include: { store: true, inventoryUnit: true },
                      },
                      valuationEvent: true,
                    },
                  },
                },
              },
              returnCostAllocations: {
                include: {
                  returnCost: { include: { productReturn: true } },
                },
              },
            },
          },
          productReturns: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            include: {
              financeCost: {
                include: {
                  allocations: { orderBy: [{ fulfillmentId: "asc" }] },
                  valuationEvent: true,
                  productReturn: true,
                },
              },
            },
          },
        },
      },
      stockOperation: {
        include: {
          movements: {
            include: {
              balanceSource: { include: { store: true, inventoryUnit: true } },
              valuationEvent: true,
            },
          },
        },
      },
      financeCost: {
        include: {
          allocations: { orderBy: [{ fulfillmentId: "asc" }] },
          valuationEvent: true,
        },
      },
    } satisfies Prisma.ProductReturnInclude

export type ProductReturnValuationEvidence = Prisma.ProductReturnGetPayload<{
  include: typeof productReturnValuationInclude
}>
