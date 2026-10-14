import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")

const requiredMarkers = [
  {
    file: "components/mobile/form-field.tsx",
    markers: [
      '"green-gate"',
      "isGreenGate",
      "leadingIcon",
      "trailingIcon",
      "minHeight: isMultiline ? 92 : largeTextLayout ? 64 : 50",
      "numberOfLines={isMultiline ? inputProps.numberOfLines : 1}",
      "accessibilityLabel={inputProps.accessibilityLabel ?? label}",
    ],
  },
  {
    file: "components/mobile/auth-header.tsx",
    markers: [
      "AuthBrandHeader",
      "AuthMethodButton",
      'align?: "center" | "start"',
      "Pressable",
      "haptic",
      "transition",
      "numberOfLines={1}",
    ],
  },
  {
    file: "components/mobile/action-button.tsx",
    markers: [
      '"-translate-y-[2px] flex-row items-center justify-center gap-2"',
      "[-rn-include-font-padding:false]",
      "[-rn-text-align-vertical:center]",
      "[-rn-line-height:20]",
    ],
  },
  {
    file: "components/mobile/index.ts",
    markers: ["AuthBrandHeader", "AuthHeader", "AuthMethodButton"],
  },
  {
    file: "app/index.tsx",
    markers: ["StartupSplash"],
  },
  {
    file: "components/mobile/startup-splash-gate.tsx",
    markers: [
      "STARTUP_SPLASH_MINIMUM_MS = 500",
      "isDevelopmentAppVariant()",
      "SplashScreen.hideAsync()",
      "onLayout={handleSplashLayout}",
    ],
  },
  {
    file: "components/mobile/startup-splash.tsx",
    markers: ["ClassicStartupSplash"],
  },
  {
    file: "components/mobile/floating-qa-button.tsx",
    markers: ['pathname !== "/login"', "isAuthenticated ||"],
  },
  {
    file: "app/login.tsx",
    markers: ["LoginScreen", "<LoginScreen />"],
  },
  {
    file: "components/mobile/login/login-screen.tsx",
    markers: [
      "AuthMethodButton",
      "StatusBanner",
      '"Continue with Google"',
      "Send login code",
      "Create a business account",
      'placeholder="Enter your email address"',
      'href="/sign-up"',
      "returnTo",
    ],
  },
  {
    file: "app/no-access.tsx",
    markers: ["ClassicNoAccessScreen"],
  },
  {
    file: "app/onboarding.tsx",
    markers: ["OnboardingScreen", "<OnboardingScreen />"],
  },
  {
    file: "app/sign-up.tsx",
    markers: ["AccountAgeEntry", "<AccountAgeEntry />"],
  },
  {
    file: "components/mobile/sign-up/account-age-entry.tsx",
    markers: [
      "SignUpScreen",
      "AccountAgePresentation",
      "onContinue={setAgeBand}",
      "continuation={continuation}",
    ],
  },
  {
    file: "components/mobile/sign-up/sign-up-screen.tsx",
    markers: [
      "AuthMethodButton",
      "StatusBanner",
      '"Continue with Google"',
      "Send verification code",
      'placeholder="Enter your business name"',
      'placeholder="Enter your full name"',
      'placeholder="Enter your email address"',
      "Your business details",
      "Create your owner account",
    ],
  },
  {
    file: "app/verify-email.tsx",
    markers: ["VerifyEmailScreen", "<VerifyEmailScreen />"],
  },
  {
    file: "components/mobile/verify-email/verify-email-screen.tsx",
    markers: ["OtpInput", "OtpKeypad", "VerificationResendLine"],
  },
  {
    file: "components/mobile/verify-email/verification-resend-line.tsx",
    markers: ["Resend code"],
  },
  {
    file: "components/mobile/otp-keypad.tsx",
    markers: [
      "OTP_KEYPAD_ROWS",
      "ClipboardList",
      "Delete last digit",
      "Enter digit",
      "haptic",
      'variant?: "default" | "green-till"',
    ],
  },
]

const forbiddenMarkers = [
  {
    file: "components/mobile/sign-up/sign-up-screen.tsx",
    markers: ["owner@business.com", "john@example.com"],
  },
  {
    file: "components/mobile/login/login-screen.tsx",
    markers: ["owner@business.com", "john@example.com"],
  },
  {
    file: "components/mobile/login/login-screen.tsx",
    markers: ["customer-account-login", "Access customer history"],
  },
  {
    file: "components/mobile/onboarding/onboarding-screen.tsx",
    markers: ["customer-account-login", "Access customer history"],
  },
  {
    file: "components/mobile/customer-conversations/customer-conversation-list-screen.tsx",
    markers: ["customer-account-login", "CustomerAccountSession"],
  },
]

const failures = []

for (const check of requiredMarkers) {
  const filePath = join(SOURCE_DIR, check.file)
  const contents = readFileSync(filePath, "utf8")

  for (const marker of check.markers) {
    if (contents.includes(marker)) continue

    failures.push({
      file: relative(MOBILE_DIR, filePath),
      message: `missing marker: ${marker}`,
    })
  }
}

for (const check of forbiddenMarkers) {
  const filePath = join(SOURCE_DIR, check.file)
  const contents = readFileSync(filePath, "utf8")

  for (const marker of check.markers) {
    if (!contents.includes(marker)) continue

    failures.push({
      file: relative(MOBILE_DIR, filePath),
      message: `contains sample-data placeholder: ${marker}`,
    })
  }
}

if (failures.length > 0) {
  console.error("Mobile auth redesign check failed.")

  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Mobile auth redesign check passed.")
