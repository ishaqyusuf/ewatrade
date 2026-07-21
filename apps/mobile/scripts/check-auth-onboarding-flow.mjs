import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  googleHook: join(MOBILE_DIR, "src/hooks/use-mobile-google-auth.ts"),
  layout: join(MOBILE_DIR, "src/app/_layout.tsx"),
  login: join(MOBILE_DIR, "src/app/login.tsx"),
  signup: join(MOBILE_DIR, "src/app/sign-up.tsx"),
  staffOnboarding: join(MOBILE_DIR, "src/app/staff-onboarding.tsx"),
  verifyEmail: join(MOBILE_DIR, "src/app/verify-email.tsx"),
}

const CONTRACTS = [
  {
    file: FILES.layout,
    markers: [
      "SplashScreen.preventAutoHideAsync",
      "SplashScreen.hideAsync",
      "KeyboardProvider",
      '<Stack.Screen name="login"',
      '<Stack.Screen name="sign-up"',
      '<Stack.Screen name="verify-email"',
      'name="staff-onboarding"',
    ],
    reason:
      "app launch must preserve splash handling, keyboard provider, and auth/onboarding routes",
  },
  {
    file: FILES.login,
    markers: [
      "useMobileGoogleAuth",
      'mode: "login"',
      "requestMobileOwnerOtp",
      'mode: "login"',
      "FormField",
      "AuthActionButton",
      "AuthMethodButton",
      'label="Google"',
      "Send login code",
      'href="/sign-up"',
      "Create your business account",
      'placeholder="Enter your email address"',
    ],
    reason:
      "login must keep Google sign-in, email-code login, and an obvious sign-up path",
  },
  {
    file: FILES.signup,
    markers: [
      "useMobileGoogleAuth",
      'mode: "sign_up"',
      "businessName",
      "businessProfileKey",
      "listBusinessProfiles",
      "normalizedBusinessName",
      "canContinueWithGoogle",
      "canContinueWithEmail",
      "requestMobileOwnerOtp",
      "AuthMethodButton",
      'label="Google"',
      "Send verification code",
      'placeholder="Enter your business name"',
      'placeholder="Enter your full name"',
      'placeholder="Enter your email address"',
      "Personalize your workspace",
      "How do customers order?",
    ],
    reason:
      "signup must keep lightweight business identity, profile personalization, Google, and email OTP paths",
  },
  {
    file: FILES.verifyEmail,
    markers: [
      "OTP_LENGTH = 6",
      "MobileScreen",
      "OtpInput",
      "OtpKeypad",
      "verifyMobileOwnerOtp",
      "requestMobileOwnerOtp",
      "businessProfileKey",
      "useEffect",
      "verifyCode()",
      "Resend code",
      "Verify and continue",
    ],
    reason:
      "OTP verification must keep separated OTP entry, auto-submit, resend, and production verify behavior",
  },
  {
    file: FILES.googleHook,
    markers: [
      "Google.useIdTokenAuthRequest",
      "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
      "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
      "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
      "response.params.id_token",
      "verifyMobileGoogle",
      "businessProfileKey",
      "lastSubmittedIdToken",
      "Use email code instead",
      "Google sign-in could not open. Use email code instead.",
    ],
    reason:
      "Google auth must keep platform client ids, ID-token response handling, retry safety, and email-code fallback copy",
  },
  {
    file: FILES.staffOnboarding,
    markers: [
      "resolveStaffInviteToken",
      "completeStaffOnboarding",
      "Sign in to accept invite",
      "Finish staff setup",
      'placeholder="Enter your full name"',
      'placeholder="Enter your display name"',
      "Start selling",
    ],
    reason:
      "staff onboarding must stay invite-based and collect only minimal profile details",
  },
]
const FORBIDDEN = [
  {
    file: FILES.signup,
    patterns: [
      {
        pattern: /\bpassword\b/i,
        reason: "owner signup must not require a password in the MVP",
      },
    ],
  },
  {
    file: FILES.verifyEmail,
    patterns: [
      {
        pattern: /textContentType=["']oneTimeCode["']/,
        reason:
          "Android OTP input previously crashed with OTP autofill props; keep the safer custom cells",
      },
    ],
  },
]
const failures = []

for (const contract of CONTRACTS) {
  const source = readFileSync(contract.file, "utf8")
  const missingMarkers = contract.markers.filter(
    (marker) => !source.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: contract.file,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

for (const contract of FORBIDDEN) {
  const source = readFileSync(contract.file, "utf8")

  for (const forbidden of contract.patterns) {
    if (!forbidden.pattern.test(source)) continue

    failures.push({
      file: contract.file,
      message: `contains forbidden ${forbidden.pattern} (${forbidden.reason})`,
    })
  }
}

if (failures.length > 0) {
  console.error(
    "Mobile auth onboarding check failed. Restore the lightweight Google/email OTP signup, OTP verification, splash, or staff onboarding contracts.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Mobile auth onboarding check passed.")
