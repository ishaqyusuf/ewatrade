import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"
import {
  applyDatabaseProfile,
  loadProductionDatabaseUrl,
} from "../../../../scripts/database-profile.mjs"
import { loadRootEnvironment } from "../../../../scripts/environment-profile.mjs"

// Opt in explicitly. Uses only the guarded Development profile; fixtures are
// unique to this run, have no account or provider side effects and are removed.
test.skipIf(process.env.RUN_SIGNUP_INTEGRATION !== "1")(
  "Development PostgreSQL serializes signup budgets and the Free catalogue cap",
  async () => {
    const root = fileURLToPath(new URL("../../../../", import.meta.url))
    const { env } = loadRootEnvironment(root, { DEV_PROFILE: "local" })
    applyDatabaseProfile(env, loadProductionDatabaseUrl(root))
    Object.assign(process.env, env)
    const { prisma } = await import("@ewatrade/db")
    const { startDirectSignup, hashSignupClient } = await import(
      "./direct-signup"
    )
    const { assertRetailOpsProductAllowance } = await import(
      "@ewatrade/db/queries"
    )
    const run = crypto.randomUUID()
    const prefix = `signup-lock-${run}`
    const emails: string[] = []
    let tenantId: string | undefined
    try {
      const sharedEmail = `${prefix}@ishaq.qa.test`
      emails.push(sharedEmail)
      const base = {
        fullName: "Disposable Signup Fixture",
        businessName: prefix,
      }
      const emailResults = await Promise.allSettled(
        Array.from({ length: 5 }, (_, index) =>
          startDirectSignup(
            { ...base, email: sharedEmail },
            { clientHash: hashSignupClient(`${prefix}-email-${index}`) },
          ),
        ),
      )
      expect(
        emailResults.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(3)
      expect(
        emailResults
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason.status),
      ).toEqual([429, 429])

      const clientResults = await Promise.allSettled(
        Array.from({ length: 12 }, (_, index) => {
          const email = `${prefix}-${index}@ishaq.qa.test`
          emails.push(email)
          return startDirectSignup(
            { ...base, email },
            {
              clientHash: hashSignupClient(`${prefix}-shared-client`),
            },
          )
        }),
      )
      expect(
        clientResults.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(10)
      expect(
        clientResults
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason.status),
      ).toEqual([429, 429])

      const tenant = await prisma.tenant.create({
        data: {
          slug: prefix,
          name: prefix,
          type: "MERCHANT",
          enabledModes: [],
          dataClassification: "QA",
          qaSourceDomain: "ishaq.qa.test",
          metadata: { retailOps: { subscription: { planId: "free" } } },
        },
      })
      tenantId = tenant.id
      const products = await Promise.allSettled(
        Array.from({ length: 4 }, (_, index) =>
          prisma.$transaction(
            async (tx) => {
              await assertRetailOpsProductAllowance(tx, { tenantId: tenant.id })
              return tx.catalogItem.create({
                data: {
                  tenantId: tenant.id,
                  kind: "PRODUCT",
                  status: "ACTIVE",
                  slug: `fixture-${index}`,
                  name: `Fixture ${index}`,
                },
              })
            },
            { maxWait: 10_000, timeout: 30_000 },
          ),
        ),
      )
      expect(
        products.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(2)
      expect(
        products
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason.code),
      ).toEqual(["ENTITLEMENT_LIMIT_REACHED", "ENTITLEMENT_LIMIT_REACHED"])
      expect(
        await prisma.catalogItem.count({ where: { tenantId: tenant.id } }),
      ).toBe(2)
    } finally {
      // Match exact run-owned identifiers. Never reset or sweep shared QA data.
      const leads = await prisma.leadCapture.findMany({
        where: { type: "SIGNUP", email: { in: emails } },
        select: { id: true },
      })
      for (const lead of leads)
        await prisma.onboardingSession.deleteMany({
          where: {
            formData: { path: ["leadId"], equals: lead.id },
          },
        })
      await prisma.leadCapture.deleteMany({
        where: { id: { in: leads.map((lead) => lead.id) } },
      })
      if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } })
      expect(
        await prisma.leadCapture.count({
          where: { type: "SIGNUP", email: { in: emails } },
        }),
      ).toBe(0)
      await prisma.$disconnect()
    }
  },
  180_000,
)
