import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const AUTH_ROUTER_FILE = join(REPO_ROOT, "apps/api/src/trpc/routers/auth.ts")
const APP_ROUTER_FILE = join(REPO_ROOT, "apps/api/src/trpc/routers/_app.ts")
const GOOGLE_VERIFIER_FILE = join(
  REPO_ROOT,
  "apps/api/src/auth/mobile-google.ts",
)
const MOBILE_AUTH_QUERY_FILE = join(
  REPO_ROOT,
  "packages/db/src/queries/mobile-auth.ts",
)
const ROUTER_MARKERS = [
  "createMobileOwnerOtp",
  "verifyMobileOwnerOtp",
  "verifyMobileGoogleIdentity",
  "verifyGoogleIdToken",
  "createEmailMessage",
  "dispatchEmailMessages",
  "shouldSkipMobileOwnerOtpEmail",
  "requestMobileOwnerOtpSchema",
  "verifyMobileOwnerOtpSchema",
  "verifyMobileGoogleSchema",
  "requestMobileOwnerOtp: publicProcedure",
  "verifyMobileOwnerOtp: publicProcedure",
  "verifyMobileGoogle: publicProcedure",
  ".input(requestMobileOwnerOtpSchema)",
  ".input(verifyMobileOwnerOtpSchema)",
  ".input(verifyMobileGoogleSchema)",
  'SKIP_OTP_CODE = "123456"',
  "skipOtpEmail",
  'devCode: process.env.NODE_ENV === "production" ? null : otp.code',
]
const QUERY_MARKERS = [
  "OTP_TTL_MINUTES = 10",
  "SESSION_TTL_DAYS = 90",
  "hashOtp",
  "createOtpCode",
  "resolveOtpCode",
  "createSessionToken",
  "createUniqueTenant",
  "ensureOwnerTenant",
  "createMobileSession",
  "createMobileOwnerOtp",
  "verifyMobileOwnerOtp",
  "verifyMobileGoogleIdentity",
  'providerId = "google"',
  "idToken: cleanText(input.idToken)",
]
const GOOGLE_VERIFIER_MARKERS = [
  "getAllowedGoogleAudiences",
  "verifyGoogleIdToken",
  "oauth2.googleapis.com/tokeninfo",
  "This Google sign-in was created for another app.",
  "Use a Google account with a verified email address.",
]
const failures = []

const authRouterSource = readFileSync(AUTH_ROUTER_FILE, "utf8")
const appRouterSource = readFileSync(APP_ROUTER_FILE, "utf8")
const googleVerifierSource = readFileSync(GOOGLE_VERIFIER_FILE, "utf8")
const mobileAuthQuerySource = readFileSync(MOBILE_AUTH_QUERY_FILE, "utf8")

if (!appRouterSource.includes("auth: authRouter")) {
  failures.push({
    file: APP_ROUTER_FILE,
    message: "app router must expose the mobile auth tRPC router.",
  })
}

for (const marker of ROUTER_MARKERS) {
  if (!authRouterSource.includes(marker)) {
    failures.push({
      file: AUTH_ROUTER_FILE,
      message: `auth router is missing ${marker}.`,
    })
  }
}

const directDbAccess = authRouterSource.match(/\bctx\.db\.[A-Za-z_]/g) ?? []
if (directDbAccess.length > 0) {
  failures.push({
    file: AUTH_ROUTER_FILE,
    message: `auth router must delegate Prisma access to mobile auth query modules; found direct ctx.db property access: ${[
      ...new Set(directDbAccess),
    ].join(", ")}`,
  })
}

for (const marker of QUERY_MARKERS) {
  if (!mobileAuthQuerySource.includes(marker)) {
    failures.push({
      file: MOBILE_AUTH_QUERY_FILE,
      message: `mobile auth query module is missing ${marker}.`,
    })
  }
}

for (const marker of GOOGLE_VERIFIER_MARKERS) {
  if (!googleVerifierSource.includes(marker)) {
    failures.push({
      file: GOOGLE_VERIFIER_FILE,
      message: `Google verifier is missing ${marker}.`,
    })
  }
}

if (failures.length > 0) {
  console.error(
    "Mobile auth API boundary check failed. Keep OTP/Google tRPC validation in the API layer and database/session work in focused auth query modules.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Mobile auth API boundary check passed.")
