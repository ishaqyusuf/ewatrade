import { expect, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import { assistantWhatsAppPrivacyInventory } from "./privacy"

test("privacy inventory refuses missing or invalid attribution rather than assuming zero", async () => {
  for (const row of [
    undefined,
    {},
    {
      assistantWhatsAppIdentities: -1,
      assistantWhatsAppLinks: 0,
      assistantWhatsAppGrants: 0,
    },
  ]) {
    const db = {
      $queryRaw: async () => (row ? [row] : []),
    } as unknown as PrismaClient
    await expect(
      assistantWhatsAppPrivacyInventory(db, "subject"),
    ).rejects.toThrow("inventory unavailable")
  }
  const db = {
    $queryRaw: async () => [
      {
        assistantWhatsAppIdentities: 1,
        assistantWhatsAppLinks: 2,
        assistantWhatsAppGrants: 3,
        assistantWhatsAppBindings: 4,
        assistantWhatsAppInbox: 5,
        assistantWhatsAppOutbox: 6,
        assistantWhatsAppAttempts: 7,
        assistantWhatsAppReceipts: 8,
        assistantWhatsAppUsageBuckets: 9,
        assistantWhatsAppSelections: 10,
        assistantWhatsAppActionReviews: 11,
        assistantWhatsAppWorkflowReviews: 12,
      },
    ],
  } as unknown as PrismaClient
  expect(await assistantWhatsAppPrivacyInventory(db, "subject")).toEqual({
    assistantWhatsAppIdentities: 1,
    assistantWhatsAppLinks: 2,
    assistantWhatsAppGrants: 3,
    assistantWhatsAppBindings: 4,
    assistantWhatsAppInbox: 5,
    assistantWhatsAppOutbox: 6,
    assistantWhatsAppAttempts: 7,
    assistantWhatsAppReceipts: 8,
    assistantWhatsAppUsageBuckets: 9,
    assistantWhatsAppSelections: 10,
    assistantWhatsAppActionReviews: 11,
    assistantWhatsAppWorkflowReviews: 12,
  })
})
