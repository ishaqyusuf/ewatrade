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
      "isMarketSearchVariant",
      "marketDay.field",
      "marketDay.marigold",
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
      "STARTUP_SPLASH_MINIMUM_MS = 1400",
      "isDevelopmentAppVariant()",
      "SplashScreen.hideAsync()",
      "onLayout={handleSplashLayout}",
    ],
  },
  {
    file: "components/mobile/startup-splash.tsx",
    markers: ["MarketDayStartupSplash", "ClassicStartupSplash"],
  },
  {
    file: "components/mobile/appearances/market-day/startup-splash.tsx",
    markers: [
      "bg-market-palm",
      "--splash-pulse-size",
      "bg-market-marigold",
      "Opening your market",
      "ẸwáTrade",
      "text-market-ink",
    ],
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
      "Or Continue With",
      '"Continue with Google"',
      "Send login code",
      "Create a business account",
      'placeholder="Enter your email address"',
      'href="/sign-up"',
      "returnTo",
    ],
  },
  {
    file: "components/mobile/appearances/market-day/login-screen.tsx",
    markers: [
      "ẸwáTrade",
      "Good to see you again.",
      "Sign in once, then we will open the work or Store conversations",
    ],
  },
  {
    file: "app/no-access.tsx",
    markers: [
      "ClassicNoAccessScreen",
      "Create your business account",
      "Check again",
    ],
  },
  {
    file: "app/onboarding.tsx",
    markers: ["OnboardingScreen", "<OnboardingScreen />"],
  },
  {
    file: "components/mobile/appearances/market-day/onboarding-screen.tsx",
    markers: ["Get started"],
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
      "Or Continue With",
      '"Continue with Google"',
      "Send verification code",
      'placeholder="Enter your business name"',
      'placeholder="Enter your full name"',
      'placeholder="Enter your email address"',
      "Your business details",
      "Create your owner account",
      "MarketDaySignUpScreen",
      "MarketDaySignUpCategories",
    ],
  },
  {
    file: "components/mobile/appearances/market-day/sign-up-screen.tsx",
    markers: [
      "SignUpMarketHeader",
      "SignUpMarketStall",
      "canopyScrolledAway",
      "bg-market-canvas",
    ],
  },
  {
    file: "app/verify-email.tsx",
    markers: ["VerifyEmailScreen", "<VerifyEmailScreen />"],
  },
  {
    file: "components/mobile/verify-email/verify-email-screen.tsx",
    markers: [
      "OtpInput",
      "OtpKeypad",
      "MarketDayVerifyEmailScreen",
      "VerificationResendLine",
    ],
  },
  {
    file: "components/mobile/appearances/market-day/verify-email-screen.tsx",
    markers: [
      "MobileScreen",
      "Check your inbox.",
      "Email check • 6 digits",
      "Enter the market tally we sent to",
      "Verify and continue",
      "Use another email",
    ],
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
      'variant?: "default" | "market-tally"',
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
