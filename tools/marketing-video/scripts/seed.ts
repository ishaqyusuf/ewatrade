// Data-only fixture creation. Invoked through the root verified local loader.
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

if (
  process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
  process.env.DEV_PROFILE !== "local" ||
  process.env.APP_ENV === "production"
)
  throw Error("Verified local non-production profile required")
const databaseUrl = process.env.EWATRADE_DATABASE_URL
if (!databaseUrl || !new URL(databaseUrl).hostname.endsWith(".neon.tech"))
  throw Error("Neon Development required")
const productionEnv = await readFile(
  resolve(import.meta.dir, "../../../.env.production"),
  "utf8",
)
const productionUrl = productionEnv
  .match(/^EWATRADE_DATABASE_URL=(.+)$/m)?.[1]
  ?.replace(/^["']|["']$/g, "")
if (
  !productionUrl ||
  new URL(productionUrl).hostname === new URL(databaseUrl).hostname
)
  throw Error("Production exclusion failed")
if (!JSON.parse(process.env.EMAIL_QA_DOMAIN_ROUTES || "{}")["ishaq.qa.test"])
  throw Error("Configured QA domain required")
const { prisma } = await import("../../../packages/db/src/index")
const businesses = JSON.parse(
  await readFile(
    resolve(import.meta.dir, "../fixtures/businesses.json"),
    "utf8",
  ),
)
const run = "20261008-video-v1"
const manifest = []
try {
  for (const variant of ["web", "mobile"])
    for (const business of businesses) {
      const email = `video.${run}.${variant}.${business.id}@ishaq.qa.test`
      const slug = `video-${run}-${variant}-${business.id}-qa`
      const existing = await prisma.tenant.findUnique({
        where: { slug },
        include: { users: { include: { user: true } }, stores: true },
      })
      if (existing) {
        const metadata = existing.metadata as {
          fixture?: string
          run?: string
        } | null
        const owner = existing.users.find(
          (row) => row.role === "OWNER" && row.user.email === email,
        )
        if (
          existing.dataClassification !== "QA" ||
          existing.qaSourceDomain !== "ishaq.qa.test" ||
          metadata?.fixture !== "marketing-video" ||
          metadata?.run !== run ||
          !owner ||
          existing.users.length !== 1 ||
          existing.stores.length !== 1
        )
          throw Error("Existing fixture is not safe QA")
        await prisma.user.update({
          where: { id: owner.user.id, email },
          data: {
            ageBand: "ADULT",
            ageDeclaredAt: owner.user.ageDeclaredAt ?? new Date(),
          },
        })
        await prisma.store.update({
          where: { id: existing.stores[0].id },
          data: {
            metadata: {
              retailOps: {
                onboarding: {
                  businessProfileKey: business.profileKey,
                  businessProfileVersion: 1,
                },
              },
            },
          },
        })
        manifest.push({
          id: business.id,
          variant,
          email,
          tenantId: existing.id,
          storeId: existing.stores[0]?.id,
          business: business.business,
        })
        continue
      }
      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            emailVerified: true,
            name: business.owner,
            ageBand: "ADULT",
            ageDeclaredAt: new Date(),
          },
        })
        return tx.tenant.create({
          data: {
            slug,
            name: business.business,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            countryCode: "NG",
            dataClassification: "QA",
            qaMarkedAt: new Date(),
            qaSourceDomain: "ishaq.qa.test",
            metadata: { fixture: "marketing-video", run },
            users: {
              create: {
                acceptedAt: new Date(),
                role: "OWNER",
                status: "ACTIVE",
                userId: user.id,
              },
            },
            stores: {
              create: {
                name: business.business,
                slug: business.id,
                status: "ACTIVE",
                city: business.city,
                countryCode: "NG",
                supportEmail: email,
                metadata: {
                  retailOps: {
                    onboarding: {
                      businessProfileKey: business.profileKey,
                      businessProfileVersion: 1,
                    },
                  },
                },
              },
            },
          },
          include: { stores: true },
        })
      })
      manifest.push({
        id: business.id,
        variant,
        email,
        tenantId: result.id,
        storeId: result.stores[0]?.id,
        business: business.business,
      })
    }
  await writeFile(
    resolve(import.meta.dir, "../output/fixtures.json"),
    JSON.stringify(
      { run, classification: "QA", profile: "local", fixtures: manifest },
      null,
      2,
    ),
  )
  console.log(
    `${manifest.length} QA-only fixtures ready; no Terms or billing records created.`,
  )
} finally {
  await prisma.$disconnect()
}
