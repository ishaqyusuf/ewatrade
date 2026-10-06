import { randomUUID } from "node:crypto"
import { prisma } from "../packages/db/src/client"
if (!["local", "preview"].includes(process.env.APP_ENV ?? ""))
  throw new Error("Non-production only.")
try {
  const owner = await prisma.membership.findFirst({
    where: {
      role: "OWNER",
      status: "ACTIVE",
      user: { email: "jawdah.preview.20261005@ishaq.qa.test" },
      tenant: { dataClassification: "QA", isActive: true },
    },
    select: {
      userId: true,
      tenantId: true,
      tenant: {
        select: {
          stores: { where: { status: "ACTIVE" }, select: { id: true } },
        },
      },
    },
  })
  const storeId = owner?.tenant.stores[0]?.id
  if (!owner || !storeId) throw new Error("Jawdah QA missing.")
  const deleteId = process.argv[2]
  if (deleteId) {
    const fixture = await prisma.user.findFirst({
      where: {
        id: deleteId,
        metadata: { path: ["qaFixture"], equals: "staff_access_ui" },
        memberships: { some: { tenantId: owner.tenantId } },
      },
      select: { id: true },
    })
    if (!fixture) throw new Error("Exact UI fixture missing; refusing cleanup.")
    await prisma.user.delete({ where: { id: fixture.id } })
    console.log("UI fixture removed.")
  } else {
    const user = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: "Disposable QA access UI fixture",
          email: `access-ui-${randomUUID()}@ishaq.qa.test`,
          metadata: { qaFixture: "staff_access_ui" },
        },
      })
      const member = await tx.membership.create({
        data: {
          tenantId: owner.tenantId,
          userId: user.id,
          role: "OPERATOR",
          status: "ACTIVE",
          staffAccessMode: "SCOPED",
        },
      })
      await tx.staffStoreAssignment.create({
        data: {
          tenantId: owner.tenantId,
          membershipId: member.id,
          storeId,
          role: "OPERATOR",
          updatedByUserId: owner.userId,
        },
      })
      await tx.retailOpsStaffProfile.create({
        data: {
          tenantId: owner.tenantId,
          membershipId: member.id,
          userId: user.id,
          defaultStoreId: storeId,
          displayName: user.name,
          roleSnapshot: "OPERATOR",
        },
      })
      return user
    })
    console.log(
      JSON.stringify({
        userId: user.id,
        credentialCreated: false,
        invitationSent: false,
      }),
    )
  }
} finally {
  await prisma.$disconnect()
}
process.exit(0)
