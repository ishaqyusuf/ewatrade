import { expect, test } from "bun:test"

import { getStoreConversationReportAggregates } from "../../service-commerce-reporting"
import { describeWithServiceCommerceDatabase } from "./database"

describeWithServiceCommerceDatabase(
  "Store Conversation aggregate SQL on Neon",
  () => {
    test("returns explicit zero and unknown markers for an empty scoped window", async () => {
      const { prisma } = await import("../../../client")
      const result = await getStoreConversationReportAggregates(prisma, {
        end: new Date("2035-02-01T00:00:00.000Z"),
        start: new Date("2035-01-01T00:00:00.000Z"),
        storeId: "store-conversation-report-empty-store",
        tenantId: "store-conversation-report-empty-tenant",
      })

      expect(result.lifecycle).toMatchObject({
        conversationsStarted: 0,
        currentSnapshot: { active: 0, archived: 0, restricted: 0 },
        firstResponse: {
          averageSeconds: null,
          knownCount: 0,
          unknownCount: 0,
        },
        requestKinds: { prescription: 0, product: 0, service: 0 },
        unreadWait: {
          averageSeconds: null,
          knownCount: 0,
          unknownCount: 0,
        },
      })
      expect(result.availability.scheduledClosureObservations).toBeNull()
      expect(result.channels.providerHistoryUnknown).toBeNull()
    })
  },
)
