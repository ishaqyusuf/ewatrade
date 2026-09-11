import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")

const requiredMarkers = [
  {
    file: "components/mobile/form-field.tsx",
    markers: [
      'variant?: "auth" | "filled" | "line"',
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
      'className="-translate-y-[2px] flex-row items-center justify-center gap-2"',
      "includeFontPadding: false",
      'textAlignVertical: "center"',
      "lineHeight: 20",
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
    markers: [
      "useMarketDayPalette",
      "marketDay.palm",
      "marketSun",
      "pulseOuter",
      "Opening your market",
      "ẸwáTrade",
      "marketDay.ink",
    ],
  },
  {
    file: "components/mobile/floating-theme-toggle.tsx",
    markers: [
      'pathname === "/"',
      'pathname === "/onboarding"',
      'pathname === "/verify-email"',
    ],
  },
  {
    file: "app/login.tsx",
    markers: [
      "AuthBrandHeader",
      "AuthMethodButton",
      "StatusBanner",
      "Or Continue With",
      'label="Google"',
      "Send login code",
      "Create your business account",
      'placeholder="Enter your email address"',
      'href="/sign-up"',
      "Sign in once, then we will open the work or Store conversations available to you.",
      "returnTo",
    ],
  },
  {
    file: "app/no-access.tsx",
    markers: [
      "No workspace available yet",
      "Create your business account",
      "Check again",
    ],
  },
  {
    file: "app/onboarding.tsx",
    markers: ["Get started"],
  },
  {
    file: "app/sign-up.tsx",
    markers: [
      "SignUpMarketHeader",
      "SignUpMarketStall",
      "AuthMethodButton",
      "StatusBanner",
      "Or Continue With",
      'label="Google"',
      "Send verification code",
      'placeholder="Enter your business name"',
      'placeholder="Enter your full name"',
      'placeholder="Enter your email address"',
      "Tell us about your business.",
      "Create your owner account.",
      "canopyScrolledAway",
      'variant="market-day"',
    ],
  },
  {
    file: "app/verify-email.tsx",
    markers: [
      "MobileScreen",
      "OtpInput",
      "OtpKeypad",
      "Check your inbox.",
      "Email check • 6 digits",
      "Enter the market tally we sent to",
      "Resend code",
      "Verify and continue",
      "Use another email",
      'variant="market-tally"',
    ],
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
    file: "app/sign-up.tsx",
    markers: ["owner@business.com", "john@example.com"],
  },
  {
    file: "app/login.tsx",
    markers: ["owner@business.com", "john@example.com"],
  },
  {
    file: "app/login.tsx",
    markers: ["customer-account-login", "Access customer history"],
  },
  {
    file: "app/onboarding.tsx",
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
