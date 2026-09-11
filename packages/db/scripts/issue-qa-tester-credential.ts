import {
  isConfiguredQaDomain,
  normalizeQaDomain,
} from "@ewatrade/utils/qa-accelerator"
import { prisma } from "../src/client"
import { issueQaTesterCredential } from "../src/queries/qa-access"

function readArgument(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined
}

const qaDomain = normalizeQaDomain(readArgument("--domain") ?? "")
const testerIdentity = readArgument("--tester")
const expiresInHours = Number(readArgument("--expires-in-hours") ?? "168")
const secret = process.env.QA_ACCELERATOR_SECRET?.trim()

if (!testerIdentity) {
  throw new Error("Pass --tester with the tester identity.")
}
if (!Number.isFinite(expiresInHours) || expiresInHours <= 0) {
  throw new Error("--expires-in-hours must be a positive number.")
}
if (!secret || secret.length < 32) {
  throw new Error("QA_ACCELERATOR_SECRET must contain at least 32 characters.")
}
if (!isConfiguredQaDomain(qaDomain, process.env)) {
  throw new Error("The QA Domain is not configured for routed QA email.")
}

const result = await issueQaTesterCredential(prisma, {
  expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
  qaDomain,
  secret,
  testerIdentity,
})

process.stdout.write(
  `${JSON.stringify(
    {
      credential: result.credential,
      expiresAt: result.grant.expiresAt.toISOString(),
      grantId: result.grant.id,
      qaDomain: result.grant.qaDomain,
      testerIdentity: result.grant.testerIdentity,
      warning:
        "Copy the credential now. Only its digest is stored and it will not be shown again.",
    },
    null,
    2,
  )}\n`,
)

await prisma.$disconnect()
