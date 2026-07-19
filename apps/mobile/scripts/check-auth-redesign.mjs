import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname);
const SOURCE_DIR = join(MOBILE_DIR, "src");

const requiredMarkers = [
  {
    file: "components/mobile/form-field.tsx",
    markers: [
      'variant?: "auth" | "filled" | "line"',
      "leadingIcon",
      "trailingIcon",
      "backgroundColor: colors.card",
      "borderWidth: isFocused || error ? 1.5 : 1",
      "minHeight: isMultiline ? 92 : 50",
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
    file: "components/mobile/index.ts",
    markers: ["AuthBrandHeader", "AuthHeader", "AuthMethodButton"],
  },
  {
    file: "app/index.tsx",
    markers: [
      "StartupSplash",
      "AuthHeader",
      'align="center"',
      "Preparing your catalog, orders, stock, and work workspace.",
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
    ],
  },
  {
    file: "app/sign-up.tsx",
    markers: [
      "AuthBrandHeader",
      "AuthMethodButton",
      "StatusBanner",
      "Or Continue With",
      'label="Google"',
      "Send verification code",
      'placeholder="Enter your business name"',
      'placeholder="Enter your full name"',
      'placeholder="Enter your email address"',
      "First, tell us where your business operates.",
      "Now choose how you want to sign in.",
    ],
  },
  {
    file: "app/verify-email.tsx",
    markers: [
      "MobileScreen",
      "OtpInput",
      "OtpKeypad",
      "Enter the code we sent you",
      "Email verification",
      "We sent a 6-digit code",
      "Resend code",
      "Verify and continue",
      "Use another email",
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
    ],
  },
];

const forbiddenMarkers = [
  {
    file: "app/sign-up.tsx",
    markers: ["owner@business.com", "john@example.com"],
  },
  {
    file: "app/login.tsx",
    markers: ["owner@business.com", "john@example.com"],
  },
];

const failures = [];

for (const check of requiredMarkers) {
  const filePath = join(SOURCE_DIR, check.file);
  const contents = readFileSync(filePath, "utf8");

  for (const marker of check.markers) {
    if (contents.includes(marker)) continue;

    failures.push({
      file: relative(MOBILE_DIR, filePath),
      message: `missing marker: ${marker}`,
    });
  }
}

for (const check of forbiddenMarkers) {
  const filePath = join(SOURCE_DIR, check.file);
  const contents = readFileSync(filePath, "utf8");

  for (const marker of check.markers) {
    if (!contents.includes(marker)) continue;

    failures.push({
      file: relative(MOBILE_DIR, filePath),
      message: `contains sample-data placeholder: ${marker}`,
    });
  }
}

if (failures.length > 0) {
  console.error("Mobile auth redesign check failed.");

  for (const failure of failures) {
    console.error(`- ${failure.file}: ${failure.message}`);
  }

  process.exit(1);
}

console.log("Mobile auth redesign check passed.");
