import { createHmac, randomBytes, randomUUID } from "node:crypto"
import { inspectApiPreviewReadiness } from "./check-api-preview-readiness.mjs"

class PreviewSmokeError extends Error {}
let step = "profile"
let failureStep = "profile"

async function main() {
  if (
    process.env.APP_ENV !== "preview" ||
    process.env.DEV_PROFILE !== "preview" ||
    process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
    process.env.NODE_ENV !== "development" ||
    inspectApiPreviewReadiness().length
  ) {
    throw new PreviewSmokeError(
      "Isolated local Preview profile is not verified.",
    )
  }

  const base = process.env.BETTER_AUTH_URL
  if (!base || new URL(base).protocol !== "https:") {
    throw new PreviewSmokeError("Preview auth origin is not configured.")
  }

  // Import the runtime only after the profile guard, so a wrong profile never
  // initializes an application or database client.
  step = "API import"
  const { app } = await import("../apps/api/src/index")
  step = "database import"
  const { prisma } = await import("../packages/db/src/index")
  const { LEGAL_DOCUMENT_VERSION } = await import(
    "../packages/utils/src/legal-documents"
  )
  const email = `preview-smoke-${randomUUID()}@example.test`
  const password = randomBytes(30).toString("base64url")
  const authSecret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET
  if (!authSecret)
    throw new PreviewSmokeError("Preview auth secret is missing.")
  const passwordRateBucketDigest = createHmac("sha256", authSecret)
    .update(`mobile-password:${email}`)
    .digest("hex")
  const headers = { "content-type": "application/json", origin: base }
  let baseline: number | undefined
  let userId: string | undefined
  let failure: unknown

  try {
    step = "baseline count"
    baseline = await prisma.account.count()
    step = "signup"
    const signup = await app.request(`${base}/api/auth/sign-up/email`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Preview QA", email, password }),
    })
    if (signup.status !== 200) {
      throw new PreviewSmokeError(
        `Disposable Preview signup failed with HTTP ${signup.status}.`,
      )
    }
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (!user) throw new PreviewSmokeError("Preview user was not persisted.")
    userId = user.id
    step = "account count"
    if ((await prisma.account.count()) !== baseline + 1) {
      throw new PreviewSmokeError("Preview auth account count was not exact.")
    }

    step = "signin"
    const signin = await app.request(`${base}/api/auth/sign-in/email`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    })
    if (signin.status !== 200) {
      throw new PreviewSmokeError(
        `Disposable Preview signin failed with HTTP ${signin.status}.`,
      )
    }
    const cookie = signin.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ")
    if (!cookie)
      throw new PreviewSmokeError("Preview signin returned no cookie.")
    step = "session"
    const session = await app.request(`${base}/api/auth/get-session`, {
      headers: { origin: base, cookie },
    })
    const sessionBody = await session.json()
    if (session.status !== 200 || sessionBody?.user?.id !== user.id) {
      throw new PreviewSmokeError(
        "Preview session did not resolve to its user.",
      )
    }
    console.log("Disposable Preview signup, signin and session checks passed.")

    step = "unverified mobile password"
    const sessionCount = await prisma.session.count({
      where: { userId: user.id },
    })
    const mobilePassword = await app.request(
      `${base}/api/trpc/auth.signInMobilePassword`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ json: { email, password } }),
      },
    )
    if (
      mobilePassword.status !== 401 ||
      (await prisma.session.count({ where: { userId: user.id } })) !==
        sessionCount
    ) {
      throw new PreviewSmokeError(
        `Unverified mobile password sign-in was not closed (HTTP ${mobilePassword.status}).`,
      )
    }
    console.log("Unverified mobile password sign-in created no session.")

    step = "draft legal status"
    const legalStatus = await app.request(
      `${base}/api/trpc/accountPrivacy.legalStatus`,
      { headers: { origin: base, cookie } },
    )
    const legalStatusBody = await legalStatus.json()
    if (
      legalStatus.status !== 200 ||
      legalStatusBody?.result?.data?.json?.effective !== false ||
      legalStatusBody?.result?.data?.json?.version !== null ||
      legalStatusBody?.result?.data?.json?.accepted !== false
    ) {
      throw new PreviewSmokeError("Draft legal status was not closed.")
    }

    step = "draft legal acceptance"
    const acceptanceBaseline = await prisma.legalAcceptance.count({
      where: { userId: user.id },
    })
    const acceptance = await app.request(
      `${base}/api/trpc/accountPrivacy.acceptLegalDocuments`,
      {
        method: "POST",
        headers: { ...headers, cookie },
        body: JSON.stringify({
          json: {
            version: LEGAL_DOCUMENT_VERSION,
            surface: "mobile",
            acceptedTerms: true,
            acknowledgedPrivacyNotice: true,
          },
        }),
      },
    )
    const acceptanceCount = await prisma.legalAcceptance.count({
      where: { userId: user.id },
    })
    if (acceptance.status !== 412 || acceptanceCount !== acceptanceBaseline) {
      throw new PreviewSmokeError(
        `Draft legal acceptance check failed (HTTP ${acceptance.status}, count delta ${acceptanceCount - acceptanceBaseline}).`,
      )
    }
    console.log("Draft legal acceptance rejected without a database write.")
  } catch (error) {
    failure = error
    failureStep = step
  } finally {
    try {
      step = "cleanup"
      if (userId) {
        await prisma.legalAcceptance.deleteMany({ where: { userId } })
      }
      await prisma.user.deleteMany({ where: { email } })
      await prisma.accountPrivacyRateBucket.deleteMany({
        where: { bucketDigest: passwordRateBucketDigest },
      })
      if (
        (await prisma.accountPrivacyRateBucket.count({
          where: { bucketDigest: passwordRateBucketDigest },
        })) !== 0
      ) {
        failure = new PreviewSmokeError(
          "Preview password rate bucket cleanup was incomplete.",
        )
        failureStep = "cleanup"
      }
      if (baseline === undefined) {
        console.log(
          "Disposable Preview cleanup attempted; baseline unavailable.",
        )
      } else if ((await prisma.account.count()) !== baseline) {
        failure = new PreviewSmokeError(
          "Preview account cleanup did not restore baseline.",
        )
      } else {
        console.log("Disposable Preview account cleanup restored baseline.")
      }
    } catch (error) {
      failure = error
      failureStep = "cleanup"
    } finally {
      await prisma.$disconnect()
    }
  }

  if (failure) throw failure
}

try {
  await main()
  // Hono/observability imports may retain timers after Prisma disconnects.
  process.exit(0)
} catch (error) {
  console.error(
    error instanceof PreviewSmokeError
      ? error.message
      : `Preview auth smoke failed during ${failureStep === "profile" ? step : failureStep}; inspect runtime logs securely.`,
  )
  process.exit(1)
}
