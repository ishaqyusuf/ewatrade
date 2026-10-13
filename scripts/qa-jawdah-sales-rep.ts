// Ensures the standing Jawdah QA sales rep (CASHIER) exists, for checking
// sales-rep screens on mobile. Idempotent; never deletes.
// Run from apps/api so it uses the local API's database profile:
//   node ../../scripts/with-workspace-env.mjs APP_ENV=local bun ../../scripts/qa-jawdah-sales-rep.ts
// Sign in on a local/dev build with this email and the fixed dev code.
import { prisma } from "../packages/db/src/client"

const OWNER_EMAIL = "jawdah.preview.20261005@ishaq.qa.test"
const REP_EMAIL = "jawdah.cashier.20261013@ishaq.qa.test"
const REP_NAME = "Musa (QA cashier)"

if (!["local", "preview"].includes(process.env.APP_ENV ?? ""))
  throw new Error("Non-production only.")
try {
  const owner = await prisma.membership.findFirst({
    where: {
      role: "OWNER",
      status: "ACTIVE",
      user: { email: OWNER_EMAIL },
      tenant: { dataClassification: "QA", isActive: true },
    },
    select: {
      userId: true,
      tenantId: true,
      tenant: {
        select: {
          stores: {
            where: { status: "ACTIVE" },
            orderBy: { createdAt: "asc" },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  })
  const storeId = owner?.tenant.stores[0]?.id
  if (!owner || !storeId) throw new Error("Jawdah QA missing.")
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: REP_EMAIL },
      update: { ageBand: "ADULT" },
      create: {
        name: REP_NAME,
        email: REP_EMAIL,
        emailVerified: true,
        ageBand: "ADULT",
        ageDeclaredAt: new Date(),
        metadata: { qaFixture: "jawdah_sales_rep" },
      },
    })
    const existing = await tx.membership.findFirst({
      where: { tenantId: owner.tenantId, userId: user.id },
    })
    const member =
      existing ??
      (await tx.membership.create({
        data: {
          tenantId: owner.tenantId,
          userId: user.id,
          role: "CASHIER",
          status: "ACTIVE",
          staffAccessMode: "SCOPED",
        },
      }))
    const assignment = await tx.staffStoreAssignment.findFirst({
      where: { membershipId: member.id, storeId },
    })
    if (!assignment)
      await tx.staffStoreAssignment.create({
        data: {
          tenantId: owner.tenantId,
          membershipId: member.id,
          storeId,
          role: "CASHIER",
          updatedByUserId: owner.userId,
        },
      })
    const profile = await tx.retailOpsStaffProfile.findFirst({
      where: { membershipId: member.id },
    })
    if (!profile)
      await tx.retailOpsStaffProfile.create({
        data: {
          tenantId: owner.tenantId,
          membershipId: member.id,
          userId: user.id,
          defaultStoreId: storeId,
          displayName: REP_NAME,
          roleSnapshot: "CASHIER",
        },
      })
    return {
      created: !existing,
      email: REP_EMAIL,
      membershipStatus: member.status,
      role: member.role,
    }
  })
  console.log(JSON.stringify(result))
} finally {
  await prisma.$disconnect()
}
process.exit(0)
