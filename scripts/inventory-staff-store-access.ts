import { writeFile } from "node:fs/promises"
import { prisma } from "../packages/db/src/client"

// Read-only, explicit tenant inventory. Never infers assignments or migrates staff.
let tenantId = process.argv[2]
const destination = process.argv[3]
if (!tenantId || !destination || !destination.startsWith("/private/tmp/"))
  throw new Error("Provide a Tenant ID and /private/tmp/ snapshot path.")
try {
  if (tenantId === "--jawdah-qa") {
    if (!["local", "preview"].includes(process.env.APP_ENV ?? ""))
      throw new Error("QA lookup requires non-production.")
    const owner = await prisma.membership.findFirst({
      where: {
        role: "OWNER",
        status: "ACTIVE",
        user: { email: "jawdah.preview.20261005@ishaq.qa.test" },
        tenant: { dataClassification: "QA", isActive: true },
      },
      select: { tenantId: true },
    })
    if (!owner) throw new Error("Jawdah QA Owner missing.")
    tenantId = owner.tenantId
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      isActive: true,
      stores: { select: { id: true, status: true } },
      users: {
        select: {
          id: true,
          role: true,
          status: true,
          staffAccessMode: true,
          staffAccessRevision: true,
          catalogEditor: true,
          retailOpsStaffProfile: { select: { defaultStoreId: true } },
          staffStoreAssignments: {
            select: { storeId: true, role: true, status: true, revision: true },
          },
        },
      },
    },
  })
  if (!tenant) throw new Error("Tenant not found.")
  await writeFile(
    destination,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        tenant,
        reviewRequired: true,
        rollback:
          "Reapply reviewed SCOPED assignments through the Owner/Admin access editor at the latest revision. Do not disable enforcement or automatically restore LEGACY business-wide access.",
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  )
  console.log(
    JSON.stringify({
      membershipCount: tenant.users.length,
      legacyRetailCount: tenant.users.filter(
        (row) =>
          row.staffAccessMode === "LEGACY" &&
          ["CASHIER", "OPERATOR", "MANAGER"].includes(row.role),
      ).length,
      snapshot: destination,
    }),
  )
} finally {
  await prisma.$disconnect()
}
process.exit(0)
