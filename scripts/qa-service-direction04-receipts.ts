import assert from "node:assert/strict"
import path from "node:path"
import {
  applyDatabaseProfile,
  loadProductionDatabaseUrl,
} from "./database-profile.mjs"
import { loadRootEnvironment } from "./environment-profile.mjs"

// Read-only receipt for the exact two synthetic local UI orders in this walkthrough.
const root = path.resolve(import.meta.dir, "..")
const loaded = loadRootEnvironment(root, {
  ...process.env,
  APP_ENV: "local",
  DEV_PROFILE: "local",
  NODE_ENV: "development",
})
assert(loaded.profileExists && loaded.profile === "local")
Object.assign(
  process.env,
  applyDatabaseProfile(loaded.env, loadProductionDatabaseUrl(root)),
)
const { prisma } = await import("@ewatrade/db")
try {
  const jobs = await prisma.serviceJob.findMany({
    where: {
      id: { in: ["cmvkttgjq009g3r9ks9vwhvt4", "cmvku1po4009u3r9k64ap4pcl"] },
      storeId: "cmvhyhojc0080fb9k2pul43tb",
      tenant: {
        slug: "freshcare-demo-qa",
        dataClassification: "QA",
        qaSourceDomain: "ishaq.qa.test",
        qaPurgeStartedAt: null,
      },
    },
    select: {
      id: true,
      revision: true,
      lines: {
        select: {
          id: true,
          revision: true,
          status: true,
          authorizationStatus: true,
        },
      },
      commercialOrder: {
        select: {
          orderNumber: true,
          customerName: true,
          totalMinor: true,
          amountPaidMinor: true,
        },
      },
    },
  })
  assert(
    jobs.length === 2 &&
      jobs.every((job) =>
        job.commercialOrder.customerName?.startsWith("QA D04 "),
      ),
  )
  console.info(
    JSON.stringify({ localOnly: true, syntheticOnly: true, jobs }, null, 2),
  )
} finally {
  await prisma.$disconnect()
}
