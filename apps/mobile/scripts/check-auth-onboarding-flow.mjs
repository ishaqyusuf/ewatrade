import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  googleHook: join(MOBILE_DIR, "src/hooks/use-mobile-google-auth.ts"),
  layout: join(MOBILE_DIR, "src/app/_layout.tsx"),
  loginRoute: join(MOBILE_DIR, "src/app/login.tsx"),
  login: join(MOBILE_DIR, "src/components/mobile/login/login-screen.tsx"),
  nativeIntent: join(MOBILE_DIR, "src/app/+native-intent.tsx"),
  onboardingRoute: join(MOBILE_DIR, "src/app/onboarding.tsx"),
  onboarding: join(
    MOBILE_DIR,
    "src/components/mobile/onboarding/onboarding-screen.tsx",
  ),
  onboardingPresentation: join(
    MOBILE_DIR,
    "src/components/mobile/onboarding/onboarding-presentation.ts",
  ),
  onboardingQa: join(MOBILE_DIR, "src/lib/onboarding-market-day-qa.ts"),
  signupAgePresentation: join(MOBILE_DIR, "src/components/mobile/green-till/age-screen.tsx"),
  signupRoute: join(MOBILE_DIR, "src/app/sign-up.tsx"),
  signupAgeEntry: join(
    MOBILE_DIR,
    "src/components/mobile/sign-up/account-age-entry.tsx",
  ),
  signup: join(MOBILE_DIR, "src/components/mobile/sign-up/sign-up-screen.tsx"),
  signupPresentation: join(
    MOBILE_DIR,
    "src/components/mobile/sign-up/sign-up-presentation.ts",
  ),
  signupMarketAppearance: join(
    MOBILE_DIR,
    "src/components/mobile/appearances/market-day/sign-up-screen.tsx",
  ),
  splashGate: join(MOBILE_DIR, "src/components/mobile/startup-splash-gate.tsx"),
  staffOnboardingRoute: join(MOBILE_DIR, "src/app/staff-onboarding.tsx"),
  staffOnboarding: join(
    MOBILE_DIR,
    "src/components/mobile/staff-onboarding/staff-onboarding-screen.tsx",
  ),
  staffOnboardingSurface: join(
    MOBILE_DIR,
    "src/components/mobile/appearances/market-day/staff-onboarding-screen.tsx",
  ),
  verifyEmailRoute: join(MOBILE_DIR, "src/app/verify-email.tsx"),
  verifyEmail: join(
    MOBILE_DIR,
    "src/components/mobile/verify-email/verify-email-screen.tsx",
  ),
  verifyEmailAppearance: join(
    MOBILE_DIR,
    "src/components/mobile/appearances/market-day/verify-email-screen.tsx",
  ),
  verificationResend: join(
    MOBILE_DIR,
    "src/components/mobile/verify-email/verification-resend-line.tsx",
  ),
}

const ROUTES = [
  [FILES.loginRoute, "LoginScreen", "LoginRoute"],
  [FILES.onboardingRoute, "OnboardingScreen", "OnboardingRoute"],
  [FILES.verifyEmailRoute, "VerifyEmailScreen", "VerifyEmailRoute"],
  [FILES.staffOnboardingRoute, "StaffOnboardingScreen", "StaffOnboardingRoute"],
]

const CONTRACTS = [
  ...ROUTES.map(([file, screen, route]) => ({
    file,
    markers: [`import { ${screen} }`, `function ${route}()`, `<${screen} />`],
    reason: "Expo route must render its auth or onboarding screen",
  })),
  {
    file: FILES.signupRoute,
    markers: [
      "import { AccountAgeEntry }",
      "function SignUpRoute()",
      "<AccountAgeEntry />",
    ],
    reason: "signup entry must open business sign-up directly, starting with the age step",
  },
  {
    file: FILES.signupAgeEntry,
    markers: [
      "SignUpScreen",
      "continuation={continuation}",
      "AccountAgePresentation",
      "onContinue={setAgeBand}",
    ],
    reason:
      "the age step must block under-13 users and mount signup only after an eligible choice",
  },
  {
    file: FILES.signupAgePresentation,
    markers: ['selected === "UNDER_13"', "disabled={!selected}", 'selected !== "UNDER_13"', "onContinue(selected)"],
    reason: "the neutral age presentation must block under-13 and only forward an eligible band",
  },
  {
    file: FILES.layout,
    markers: [
      "SplashScreen.preventAutoHideAsync",
      "StartupSplashGate",
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
    file: FILES.splashGate,
    markers: [
      "STARTUP_SPLASH_MINIMUM_MS = 1400",
      "SplashScreen.hideAsync",
      "onLayout={handleSplashLayout}",
      "StartupSplash",
    ],
    reason:
      "the native launch gate must hand off to a globally mounted rich React splash after layout",
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
      '"Continue with Google"',
      "Send login code",
      'href="/sign-up"',
      "Create a business account",
      'placeholder="Enter your email address"',
    ],
    reason:
      "login must keep Google sign-in, email-code login, and an obvious sign-up path",
  },
  {
    file: FILES.onboarding,
    markers: [
      "ONBOARDING_STEPS",
      "completeOnboarding(true)",
      'router.replace("/login")',
    ],
    reason:
      "the approved three-step Market Day onboarding and persisted Login handoff must remain intact",
  },
  {
    file: FILES.onboardingPresentation,
    markers: ["Set up your business", "Build your catalog", "Run daily work"],
    reason: "the three onboarding tasks must remain visible",
  },
  {
    file: FILES.onboardingQa,
    markers: [
      'DEVELOPMENT_SCHEME = "ewatrade-dev:"',
      'ONBOARDING_QA_HOST = "onboarding-market-day"',
      'return "/onboarding"',
    ],
    reason:
      "the exact development-only QA route must keep current native onboarding evidence reproducible",
  },
  {
    file: FILES.nativeIntent,
    markers: ["resolveOnboardingMarketDayQaPath", "onboardingMarketDayQaPath"],
    reason:
      "native intent handling must preserve the development-only onboarding QA route",
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
      '"Continue with Google"',
      "Send verification code",
      'placeholder="Enter your business name"',
      'placeholder="Enter your full name"',
      'placeholder="Enter your email address"',
      "What kind of business do you run?",
      "How does your business work?",
      "Choose a different business type",
      "selectBusinessType",
      '{step === "profile" ? (',
      "How do customers order?",
    ],
    reason:
      "signup must keep type-first profile personalization, editable step navigation, lightweight business identity, Google, and email OTP paths",
  },
  {
    file: FILES.signupPresentation,
    markers: [
      'type SignUpStep = "businessType" | "profile" | "business" | "account"',
    ],
    reason: "signup must retain its four-step presentation contract",
  },
  {
    file: FILES.signupMarketAppearance,
    markers: [
      "SignUpMarketHeader",
      "SignUpMarketStall",
      "canopyScrolledAway",
      "palette.canvas",
      "onPress={() => onSelect(profile)}",
    ],
    reason:
      "Market Day signup must keep its canopy and selectable business types",
  },
  {
    file: FILES.verifyEmail,
    markers: [
      "OTP_LENGTH = 6",
      "OtpInput",
      "OtpKeypad",
      "verifyMobileOwnerOtp",
      "requestMobileOwnerOtp",
      "businessProfileKey",
      "useEffect",
      "verifyCode()",
      "VerificationResendLine",
    ],
    reason:
      "OTP verification must keep separated OTP entry, auto-submit, resend, and production verify behavior",
  },
  {
    file: FILES.verifyEmailAppearance,
    markers: ["MobileScreen", 'accessibilityLabel="Verify and continue"'],
    reason:
      "Market Day OTP must retain its mobile presentation and verify action",
  },
  {
    file: FILES.verificationResend,
    markers: ['accessibilityLabel="Resend code"'],
    reason: "OTP resend must remain accessible",
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
      "MarketDayStaffOnboardingScreen",
    ],
    reason: "staff onboarding must stay invite-based",
  },
  {
    file: FILES.staffOnboardingSurface,
    markers: [
      "Welcome to the counter.",
      'placeholder="Enter your full name"',
      'placeholder="Enter your display name"',
      "Start selling",
    ],
    reason:
      "staff onboarding must collect only minimal profile details through the selected surface",
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
