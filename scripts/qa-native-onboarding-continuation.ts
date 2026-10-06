import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"

// The root environment wrapper verifies that this Neon target differs from
// Production. This script never sends email or retains a workspace fixture.
if (
  process.env.APP_ENV !== "local" ||
  process.env.DEV_PROFILE !== "local" ||
  process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
  !new URL(
    process.env.EWATRADE_DATABASE_URL ?? "https://invalid",
  ).hostname.endsWith(".neon.tech")
) {
  throw new Error(
    "Native onboarding QA requires the verified local Neon profile.",
  )
}

const { prisma } = await import("../packages/db/src/client")
const {
  consumeApprovedOnboarding,
  readApprovedOnboarding,
  saveApprovedOnboardingDraft,
  verifyApprovedOnboardingEmail,
} = await import("../packages/db/src/queries/onboarding-continuation")
const {
  createMobileOwnerOtp,
  verifyMobileOwnerOtp,
  verifyMobileSocialIdentity,
} = await import("../packages/db/src/queries/mobile-auth")

class ExpectedRollback extends Error {}
const identity = randomUUID()
const email = `native-onboarding-${identity}@example.test`
const businessName = `Native Onboarding QA ${identity.slice(0, 8)}`
const setupToken = `ea_${randomBytes(32).toString("base64url")}`
const verificationToken = `ear_${randomBytes(32).toString("base64url")}`
const fixtureTokens = [setupToken, verificationToken]
const formData = {
  kind: "early_access",
  approvedAt: new Date().toISOString(),
  requestedAt: new Date().toISOString(),
  accessUrl: `https://ewatrade-dashboard.localhost/signup?access_token=${setupToken}`,
  email,
  fullName: "Native Onboarding QA",
  companyName: businessName,
  leadId: `native-onboarding-qa-${identity}`,
}
const expiry = new Date(Date.now() + 60 * 60 * 1000)

try {
  await prisma.onboardingSession.createMany({
    data: [
      { token: setupToken, expiresAt: expiry, formData },
      {
        token: verificationToken,
        expiresAt: expiry,
        formData: {
          kind: "early_access_verification",
          accessToken: setupToken,
          email,
        },
      },
    ],
  })
  await saveApprovedOnboardingDraft(prisma, {
    token: setupToken,
    draft: { countryCode: "NG", region: "Lagos" },
  })
  await saveApprovedOnboardingDraft(prisma, {
    token: setupToken,
    draft: { step: "business", city: "Lagos", phone: "+2348012345678" },
  })
  await prisma.$transaction((tx) =>
    verifyApprovedOnboardingEmail(tx, verificationToken),
  )
  const approved = await readApprovedOnboarding(prisma, setupToken)
  assert.equal(approved.data.draft?.city, "Lagos")
  assert.equal(approved.data.draft?.countryCode, "NG")
  assert.equal(approved.data.draft?.region, "Lagos")
  assert.ok(approved.data.emailVerifiedAt)
  assert.equal(
    (
      await prisma.onboardingSession.findUnique({
        where: { token: verificationToken },
      })
    )?.completed,
    true,
  )

  let createdWorkspace = false
  try {
    await prisma.$transaction(
      async (tx) => {
        const otp = await createMobileOwnerOtp(tx, {
          accessToken: setupToken,
          ageBand: "ADULT",
          businessName,
          email,
          name: formData.fullName,
          mode: "sign_up",
          addressLine1: "10 Test Street",
          city: "Lagos",
          phone: "+2348012345678",
          businessProfileKey: "animal-feed-agricultural-supplies",
          businessProfileVersion: 1,
          currencyCode: "NGN",
          operatingModel: "products",
          orderChannels: ["walk_in"],
          teamSize: "2_5",
        })
        const result = await verifyMobileOwnerOtp(tx, {
          accessToken: setupToken,
          ageBand: "ADULT",
          code: otp.code,
          email,
          mode: "sign_up",
        })
        assert.equal(result.profile.email, email)
        assert.equal(result.profile.role, "OWNER")
        assert.equal(result.tenant?.name, businessName)
        const storeId = result.tenant?.storeId
        assert.ok(storeId)
        const savedStore = await tx.store.findUniqueOrThrow({
          where: { id: storeId },
          select: { countryCode: true, region: true },
        })
        assert.equal(savedStore.countryCode, "NG")
        assert.equal(savedStore.region, "Lagos")
        assert.ok(result.token)
        assert.equal(
          (
            await tx.onboardingSession.findUnique({
              where: { token: setupToken },
            })
          )?.completed,
          true,
        )
        createdWorkspace = true
        throw new ExpectedRollback()
      },
      { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (!(error instanceof ExpectedRollback)) throw error
  }
  assert.ok(createdWorkspace)
  assert.equal(await prisma.user.count({ where: { email } }), 0)
  assert.equal(await prisma.tenant.count({ where: { name: businessName } }), 0)
  assert.equal(
    (await readApprovedOnboarding(prisma, setupToken)).session.completed,
    false,
  )
  assert.equal(
    await prisma.verification.count({
      where: { identifier: `mobile-auth:sign_up:${email}` },
    }),
    0,
  )

  for (const provider of ["google", "apple"] as const) {
    let createdSocialWorkspace = false
    try {
      await prisma.$transaction(
        async (tx) => {
          await assert.rejects(
            verifyMobileSocialIdentity(tx, {
              accessToken: setupToken,
              ageBand: "ADULT",
              businessName,
              email: `wrong-${email}`,
              mode: "sign_up",
              provider,
              providerAccountId: `${provider}-${identity}`,
            }),
            /approved email/,
          )
          const result = await verifyMobileSocialIdentity(tx, {
            accessToken: setupToken,
            ageBand: "ADULT",
            businessName,
            email,
            name: formData.fullName,
            mode: "sign_up",
            provider,
            providerAccountId: `${provider}-${identity}`,
            addressLine1: "10 Test Street",
            city: "Lagos",
            phone: "+2348012345678",
            businessProfileKey: "animal-feed-agricultural-supplies",
            businessProfileVersion: 1,
            currencyCode: "NGN",
            operatingModel: "products",
            orderChannels: ["walk_in"],
            teamSize: "2_5",
          })
          assert.equal(result.profile.email, email)
          assert.equal(result.profile.role, "OWNER")
          assert.equal(result.tenant?.name, businessName)
          const storeId = result.tenant?.storeId
          assert.ok(storeId)
          const savedStore = await tx.store.findUniqueOrThrow({
            where: { id: storeId },
            select: { countryCode: true, region: true },
          })
          assert.equal(savedStore.countryCode, "NG")
          assert.equal(savedStore.region, "Lagos")
          assert.equal(
            (
              await tx.onboardingSession.findUnique({
                where: { token: setupToken },
              })
            )?.completed,
            true,
          )
          createdSocialWorkspace = true
          throw new ExpectedRollback()
        },
        { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof ExpectedRollback)) throw error
    }
    assert.ok(createdSocialWorkspace)
    assert.equal(await prisma.user.count({ where: { email } }), 0)
    assert.equal(
      await prisma.tenant.count({ where: { name: businessName } }),
      0,
    )
    assert.equal(
      (await readApprovedOnboarding(prisma, setupToken)).session.completed,
      false,
    )
  }

  // Both transactions read the same open record before attempting consumption.
  let readers = 0
  let releaseReaders: () => void = () => {}
  const bothRead = new Promise<void>((resolve) => {
    releaseReaders = resolve
  })
  const results = await Promise.allSettled(
    [0, 1].map(() =>
      prisma.$transaction(
        async (tx) => {
          await readApprovedOnboarding(tx, setupToken)
          if (++readers === 2) releaseReaders()
          await bothRead
          await consumeApprovedOnboarding(tx, {
            token: setupToken,
            email,
            businessName,
          })
        },
        { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
      ),
    ),
  )
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  )
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  )
  await assert.rejects(
    readApprovedOnboarding(prisma, setupToken),
    /already complete/,
  )
  console.log(
    "PASS: real Neon draft verification, native OTP/Google/Apple repository workspace rollback, and concurrent single consumption.",
  )
} finally {
  await prisma.onboardingSession.deleteMany({
    where: { token: { in: fixtureTokens } },
  })
  assert.equal(
    await prisma.onboardingSession.count({
      where: { token: { in: fixtureTokens } },
    }),
    0,
  )
  await prisma.$disconnect()
}
