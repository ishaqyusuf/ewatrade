/** Actual HTTP/auth/Neon rehearsal. Only the final Meta network boundary is stubbed. */
import assert from "node:assert/strict"
import { randomBytes, randomInt, randomUUID } from "node:crypto"
import {
  createPhoneAuthTransport,
  runLivePhoneScenario,
} from "./qa-phone-auth-live"

if (
  process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
  process.env.DEV_PROFILE !== "local" ||
  process.env.APP_ENV !== "local" ||
  process.env.NODE_ENV !== "production"
)
  throw new Error("Verified local Neon and random-code mode required")
// An isolated challenge key keeps cleanup away from every other test's budgets.
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("hex")
process.env.WHATSAPP_OTP_ENABLED = "true"
process.env.WHATSAPP_OTP_ACCESS_TOKEN =
  "synthetic-provider-credential-never-dispatched"
process.env.WHATSAPP_OTP_PHONE_NUMBER_ID = "1392318457295932"
process.env.WHATSAPP_OTP_TEMPLATE_NAME = "ewatrade_login_otp"
process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE = "en_US"
process.env.ACCOUNT_PRIVACY_TRUSTED_CLIENT_IP_HEADER = "x-real-ip"
process.env.PERFORMANCE_TRACE = "false"
const phone = `+999${randomInt(100000000, 999999999)}00`
const tag = randomUUID()
const businessName = `WhatsApp script QA ${tag}`
let code: string | undefined
let deliveries = 0
const actualFetch = globalThis.fetch
globalThis.fetch = (async (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => {
  const url = String(input instanceof Request ? input.url : input)
  if (url.startsWith("https://graph.facebook.com/")) {
    assert.ok(url.endsWith("/1392318457295932/messages"))
    const body = JSON.parse(String(init?.body))
    assert.equal(body.to, phone.slice(1))
    assert.equal(body.template.name, "ewatrade_login_otp")
    assert.equal(body.template.language.code, "en_US")
    code = body.template.components[0].parameters[0].text
    assert.ok(code)
    assert.match(code, /^\d{6}$/)
    assert.equal(body.template.components[1].parameters[0].text, code)
    deliveries += 1
    return Response.json({
      messages: [{ id: `synthetic-message-${deliveries}` }],
    })
  }
  // Prisma uses its PostgreSQL adapter; no other outbound HTTP is required.
  throw new Error("Unexpected outbound HTTP refused during isolated rehearsal")
}) as typeof fetch
const { prisma } = await import("../packages/db/src/client")
const {
  phoneAuthDigest,
  phoneOtpIdentifiersForPhone,
  buildPhoneOtpIdentifier,
} = await import("../packages/db/src/queries/phone-otp-identifier")
let userId: string | undefined
let tenantId: string | undefined
try {
  assert.equal(await prisma.user.count({ where: { phone } }), 0)
  const { app } = await import("../apps/api/src/index")
  const result = await runLivePhoneScenario({
    phone,
    signup: {
      ageBand: "ADULT",
      name: "Isolated script QA",
      businessName,
      businessProfileKey: "general-retail-groceries",
      businessProfileVersion: 1,
      operatingModel: "products",
      orderChannels: ["walk_in"],
      teamSize: "solo",
      currencyCode: "NGN",
      countryCode: "NG",
    },
    transport: createPhoneAuthTransport(
      (request) => app.fetch(request),
      phone,
      () => {},
    ),
    readCode: async () => {
      assert.ok(code)
      const value = code
      code = undefined
      return value
    },
    observeConsumption: async (mode, userId) => {
      const [challenge, sessionCount] = await Promise.all([
        prisma.verification.findFirst({
          where: { identifier: buildPhoneOtpIdentifier(phone, mode) },
          select: { id: true },
        }),
        prisma.session.count({ where: { userId } }),
      ])
      return { challengePresent: Boolean(challenge), sessionCount }
    },
    progress: console.log,
  })
  userId = result.userId
  tenantId = result.tenantId
  assert.ok(result.sameAccount && userId && tenantId)
  assert.equal(deliveries, 2)
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { emailVerified: true, phoneVerifiedAt: true },
  })
  assert.ok(user.phoneVerifiedAt)
  assert.equal(user.emailVerified, false)
  assert.equal(await prisma.session.count({ where: { userId } }), 2)
  console.log(
    "PASS: actual HTTP handlers, random signup/sign-in codes, same account/business, two saved sessions, bearer access and replay refusal. Meta delivery stubbed; no real WhatsApp sent.",
  )
} finally {
  // Only this run's absent-at-baseline synthetic phone and exact business label.
  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true,
      name: true,
      memberships: {
        select: { tenantId: true, tenant: { select: { name: true } } },
      },
    },
  })
  if (user) {
    assert.equal(user.name, "Isolated script QA")
    for (const membership of user.memberships) {
      assert.equal(membership.tenant.name, businessName)
      await prisma.onboardingSession.deleteMany({
        where: { tenantId: membership.tenantId },
      })
      await prisma.tenant.delete({ where: { id: membership.tenantId } })
    }
    await prisma.user.delete({ where: { id: user.id } })
  }
  await prisma.verification.deleteMany({
    where: { identifier: { in: phoneOtpIdentifiersForPhone(phone) } },
  })
  await prisma.accountPrivacyRateBucket.deleteMany({
    where: {
      bucketDigest: {
        in: ["global", "network:127.0.0.1", `phone:${phone}`].map((key) =>
          phoneAuthDigest(`phone-otp-rate:${key}`),
        ),
      },
    },
  })
  assert.equal(await prisma.user.count({ where: { phone } }), 0)
  globalThis.fetch = actualFetch
  await prisma.$disconnect()
  console.log(
    "Isolated rehearsal fixture cleaned; no production or profile changes.",
  )
}
process.exit(0)
