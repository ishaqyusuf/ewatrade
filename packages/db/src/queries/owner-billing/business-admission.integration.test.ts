import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { assertQaAccessAcceptanceDatabase } from "../acceptance/qa-access/database"
import { getOwnerBusinessCreationAllowance } from "../owner-businesses"
import { OWNER_BILLING_POLICY_VERSION } from "./cohort"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(90_000)
;(enabled ? describe : describe.skip)(
  "owner business admission on guarded Neon",
  () => {
    test("concurrent first-business admissions share one Free slot", async () => {
      assertQaAccessAcceptanceDatabase()
      const { prisma } = await import("../../client")
      const suffix = randomUUID()
      const ownerId = `owner-admission-${suffix}`
      const tenantIds = ["a", "b"].map((part) => `${part}-${suffix}`)
      const old = {
        enabled: process.env.OWNER_BILLING_ENABLED,
        environment: process.env.STORE_BILLING_ENVIRONMENT,
      }
      process.env.OWNER_BILLING_ENABLED = "true"
      process.env.STORE_BILLING_ENVIRONMENT = "sandbox"
      try {
        await prisma.user.create({
          data: { id: ownerId, email: `${ownerId}@owner-billing-limit.test` },
        })
        const outcomes = await Promise.all(
          tenantIds.map((tenantId) =>
            prisma.$transaction(
              async (tx) => {
                const allowance = await getOwnerBusinessCreationAllowance(
                  tx,
                  ownerId,
                )
                if (!allowance)
                  throw new Error(
                    "Paid-cohort fixture did not enable its local runtime",
                  )
                if (allowance.used >= allowance.limit) return "at_limit"
                await tx.tenant.create({
                  data: {
                    id: tenantId,
                    slug: `admission-${tenantId}`,
                    name: "Admission QA",
                    type: "MERCHANT",
                    enabledModes: ["MERCHANT"],
                    dataClassification: "QA",
                    qaSourceDomain: "owner-billing-limit.test",
                    qaMarkedAt: new Date(),
                    metadata: {
                      retailOps: {
                        billingPolicy: OWNER_BILLING_POLICY_VERSION,
                      },
                    },
                    users: {
                      create: {
                        userId: ownerId,
                        role: "OWNER",
                        status: "ACTIVE",
                      },
                    },
                  },
                })
                return "created"
              },
              {
                isolationLevel: "ReadCommitted",
                maxWait: 10_000,
                timeout: 30_000,
              },
            ),
          ),
        )
        expect(outcomes.toSorted()).toEqual(["at_limit", "created"])
        expect(
          await prisma.membership.count({
            where: { userId: ownerId, role: "OWNER" },
          }),
        ).toBe(1)
      } finally {
        await prisma.tenant.deleteMany({
          where: {
            id: { in: tenantIds },
            dataClassification: "QA",
            qaSourceDomain: "owner-billing-limit.test",
          },
        })
        await prisma.user.deleteMany({
          where: { id: ownerId, email: `${ownerId}@owner-billing-limit.test` },
        })
        for (const [key, value] of [
          ["OWNER_BILLING_ENABLED", old.enabled],
          ["STORE_BILLING_ENVIRONMENT", old.environment],
        ] as const) {
          if (value === undefined) Reflect.deleteProperty(process.env, key)
          else process.env[key] = value
        }
      }
    })
  },
)
