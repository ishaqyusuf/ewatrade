import { prisma } from "../src/client"
import { migrateLegacyServiceOperations } from "../src/queries/legacy-service-operations-migration"

function readFlag(name: string) {
  return process.argv.includes(name)
}

function readValue(name: string) {
  const prefix = `${name}=`
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length)
}

async function main() {
  const apply = readFlag("--apply")
  if (apply && process.env.CONFIRM_LEGACY_SERVICE_MIGRATION !== "1") {
    throw new Error(
      "CONFIRM_LEGACY_SERVICE_MIGRATION=1 is required with --apply.",
    )
  }

  const batchSizeRaw = readValue("--batch-size")
  const batchSize = batchSizeRaw ? Number.parseInt(batchSizeRaw, 10) : 100
  const summary = await migrateLegacyServiceOperations(prisma, {
    afterStoreId: readValue("--after-store-id"),
    batchSize: Number.isFinite(batchSize) ? batchSize : 100,
    dryRun: !apply,
    storeId: readValue("--store-id"),
    tenantId: readValue("--tenant-id"),
  })

  console.info(JSON.stringify(summary, null, 2))
}

try {
  await main()
} finally {
  await prisma.$disconnect()
}
