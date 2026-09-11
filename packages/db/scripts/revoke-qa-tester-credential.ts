import { prisma } from "../src/client"
import { revokeQaTesterGrant } from "../src/queries/qa-access"

function readArgument(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined
}

const grantId = readArgument("--grant-id")
const secret = process.env.QA_ACCELERATOR_SECRET?.trim()

if (!grantId) throw new Error("Pass --grant-id with the issued grant ID.")
if (!secret || secret.length < 32) {
  throw new Error("QA_ACCELERATOR_SECRET must contain at least 32 characters.")
}

const result = await revokeQaTesterGrant(prisma, { grantId, secret })
process.stdout.write(
  `${JSON.stringify({ grantId, revoked: result.revoked }, null, 2)}\n`,
)
await prisma.$disconnect()
