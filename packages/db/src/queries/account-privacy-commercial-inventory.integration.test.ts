import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import { getAccountPrivacyCommercialInventory } from "./account-privacy-commercial-inventory"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(60_000)
const describeWithDatabase = enabled ? describe : describe.skip

describeWithDatabase(
  "commercial deletion inventory on guarded Neon development",
  () => {
    test("finds a verified contact despite email case and without a User row", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../client")
      const marker = randomUUID()
      const tenantId = randomUUID()
      const email = `privacy-commercial-${marker}@example.test`
      try {
        await prisma.tenant.create({
          data: {
            id: tenantId,
            slug: `privacy-commercial-${marker}`,
            name: "Privacy Commercial QA",
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            qaSourceDomain: "privacy-commercial.test",
            qaMarkedAt: new Date(),
          },
        })
        await prisma.customer.create({
          data: {
            tenantId,
            name: "Privacy Commercial QA Customer",
            email: email.toUpperCase(),
          },
        })
        const matched = await getAccountPrivacyCommercialInventory(
          prisma,
          randomUUID(),
          email,
        )
        expect(matched.customerDirectoryMatches).toBe(1)
        expect(matched.customerOrderMatches).toBe(0)
        expect(matched.serviceRequestMatches).toBe(0)
        expect(matched.commerceInquiryMatches).toBe(0)
        const withoutVerifiedContact =
          await getAccountPrivacyCommercialInventory(prisma, randomUUID())
        expect(withoutVerifiedContact.customerDirectoryMatches).toBe(0)
      } finally {
        await prisma.tenant.deleteMany({ where: { id: tenantId } })
        await prisma.$disconnect()
      }
    })
  },
)
