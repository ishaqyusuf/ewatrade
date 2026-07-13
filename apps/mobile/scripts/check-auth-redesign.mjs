import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)
const SOURCE_DIR = join(MOBILE_DIR, "src")

const requiredMarkers = [
  {
    file: "components/mobile/auth-header.tsx",
    markers: [
      "AuthHeader",
      "AuthMethodButton",
      'align?: "center" | "start"',
      "Pressable",
      "haptic",
      "transition",
      "numberOfLines={1}",
    ],
  },
  {
    file: "components/mobile/index.ts",
    markers: ["AuthHeader", "AuthMethodButton"],
  },
  {
    file: "app/index.tsx",
    markers: [
      "StartupSplash",
      "AuthHeader",
      'align="center"',
      "Preparing your sales and inventory workspace.",
    ],
  },
  {
    file: "app/login.tsx",
    markers: [
      "AuthHeader",
      "AuthMethodButton",
      "StatusBanner",
      "Continue with Google",
      "Send login code",
      "Create your business account",
      'placeholder="Enter your email address"',
      'href="/sign-up"',
    ],
  },
  {
    file: "app/sign-up.tsx",
    markers: [
      "AuthHeader",
      "AuthMethodButton",
      "StatusBanner",
      "Sign up with Google",
      "Send verification code",
      'placeholder="Enter your business name"',
      'placeholder="Enter your full name"',
      'placeholder="Enter your email address"',
      "Start with only the details needed",
    ],
  },
  {
    file: "app/verify-email.tsx",
    markers: [
      "AuthHeader",
      "StatusBadge",
      "StatusBanner",
      "OtpInput",
      "6 digit OTP",
      "Local fallback",
      "Resend code",
      "Verify and continue",
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
