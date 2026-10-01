import { randomUUID } from "node:crypto"
import { inspectApiPreviewReadiness } from "./check-api-preview-readiness.mjs"

class Rollback extends Error {}

if (
  process.env.APP_ENV !== "preview" ||
  process.env.DEV_PROFILE !== "preview" ||
  process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
  process.env.NODE_ENV !== "development" ||
  inspectApiPreviewReadiness().length
) {
  throw new Error("Isolated Preview profile is not verified.")
}

const { prisma } = await import("../packages/db/src/index")
const { createMobileOwnerOtp, verifyMobileOwnerOtp } = await import(
  "../packages/db/src/queries/mobile-auth"
)
const identity = randomUUID()
const email = `preview-otp-${identity}@example.test`
const businessName = `Preview OTP ${identity.slice(0, 8)}`

async function counts() {
  const [users, tenants, stores, memberships, sessions, verifications] =
    await Promise.all([
      prisma.user.count(),
      prisma.tenant.count(),
      prisma.store.count(),
      prisma.membership.count(),
      prisma.session.count(),
      prisma.verification.count(),
    ])
  return { users, tenants, stores, memberships, sessions, verifications }
}

try {
  const before = await counts()
  let exercised = false
  try {
    await prisma.$transaction(
      async (tx) => {
        const otp = await createMobileOwnerOtp(tx, {
          businessProfileKey: "animal-feed-agricultural-supplies",
          businessProfileVersion: 1,
          businessName,
          currencyCode: "NGN",
          email,
          mode: "sign_up",
          name: "Preview OTP QA",
          operatingModel: "products",
          orderChannels: ["walk_in"],
          teamSize: "2_5",
        })
        const session = await verifyMobileOwnerOtp(tx, {
          code: otp.code,
          email,
          mode: "sign_up",
        })
        if (
          session.profile.email !== email ||
          session.profile.role !== "OWNER" ||
          !session.tenant?.id ||
          !session.tenant.storeId ||
          !session.token
        ) {
          throw new Error("Preview mobile OTP signup projection is incomplete.")
        }
        const user = await tx.user.findUnique({ where: { email } })
        const membership = await tx.membership.findFirst({
          where: { tenantId: session.tenant.id, userId: session.profile.id },
        })
        const store = await tx.store.findUnique({
          where: { id: session.tenant.storeId },
        })
        if (!user || membership?.role !== "OWNER" || !store) {
          throw new Error("Preview mobile OTP tenant writes are incomplete.")
        }
        exercised = true
        throw new Rollback()
      },
      { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
  if (!exercised)
    throw new Error("Preview OTP transaction did not exercise signup.")
  const after = await counts()
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error("Preview OTP rollback did not restore database counts.")
  }
  console.log(
    "Preview mobile OTP owner signup and transaction rollback passed.",
  )
} catch {
  console.error("Preview mobile OTP smoke failed; inspect logs securely.")
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
process.exit(process.exitCode ?? 0)
