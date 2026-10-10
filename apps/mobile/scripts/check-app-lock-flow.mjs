import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname)

const checks = [
  {
    file: "package.json",
    markers: ["expo-local-authentication", "expo-crypto"],
  },
  {
    file: "app.config.ts",
    markers: [
      "expo-local-authentication",
      "faceIDPermission",
      "unlock your ẸwáTrade workspace",
    ],
  },
  {
    file: "src/lib/app-lock-store.ts",
    markers: [
      "expo-secure-store",
      "expo-crypto",
      "APP_LOCK_CODE_LENGTH = 6",
      "setAppLockCode",
      "verifyAppLockCode",
      "setAppLockBiometrics",
      "clearAppLock",
      "recordAppLockUnlock",
    ],
  },
  {
    file: "src/lib/app-lock-hydration.ts",
    markers: [
      "Promise.race",
      "DEFAULT_APP_LOCK_HYDRATION_TIMEOUT_MS",
      'status: "error"',
    ],
  },
  {
    file: "src/hooks/use-app-lock.tsx",
    markers: [
      "AppLockProvider",
      "loadAppLockConfig",
      "hydrationError",
      "AppState.addEventListener",
      "LocalAuthentication.authenticateAsync",
      'promptMessage: "Unlock ẸwáTrade"',
      "unlockWithBiometrics",
      "resetAfterSignOut",
    ],
  },
  {
    file: "src/components/mobile/app-lock-gate.tsx",
    markers: ["AppLockUnlockScreen", "hydrationError", "isCustomerShellPath"],
  },
  {
    file: "src/components/mobile/app-lock/app-lock-unlock-screen.tsx",
    markers: [
      "PinEntryScreen",
      'glyph="brand"',
      "appLockWelcomeTitle",
      "App lock storage is unavailable",
      "showBiometric={canUseBiometrics}",
      "APP_LOCK_FORGOT_PIN_LABEL",
      "Checking your PIN.",
      "appLockWrongPinMessage",
      "useAppLockCountdown",
      'variant="quiet-seal"',
    ],
  },
  {
    file: "src/components/mobile/app-lock/use-forgot-pin.ts",
    markers: [
      "Forgot PIN? Sign out and reset",
      "Sign out and reset app lock?",
      "resetAfterSignOut",
    ],
  },
  {
    file: "src/components/mobile/app-lock/pin-entry-screen.tsx",
    markers: [
      "export function PinEntryScreen",
      "export function AppLockBiometricOffer",
      'variant="gate"',
      'StatusBar style="light"',
      "useSafeAreaInsets",
      "Not now",
    ],
  },
  {
    file: "src/components/mobile/app-lock-pin-pad.tsx",
    markers: [
      "PinCodeCells",
      "FingerPrintScan",
      "Use ${appLockBiometricName(biometricLabel)}",
      "Delete last digit",
      '"quiet-seal"',
      '"gate"',
      "accessibilityState={{ disabled }}",
      "QuietSealPinKey",
    ],
  },
  {
    file: "src/lib/app-lock-quiet-seal-layout.ts",
    markers: [
      "APP_LOCK_QUIET_SEAL_LAYOUT",
      "keypadWidth: 254",
      "largeTextKeyHeight: 68",
      "pinRailWidth: 218",
      "choiceLabelFontScaleCap: 2",
    ],
  },
  {
    file: "src/components/mobile/app-lock-quiet-seal.tsx",
    markers: ["AppLockQuietSealScreen"],
  },
  {
    file: "src/app/app-lock-modal.tsx",
    markers: ["AppLockSettingsScreen"],
  },
  {
    file: "src/components/mobile/app-lock/app-lock-settings-screen.tsx",
    markers: [
      "PinEntryScreen",
      "AppLockBiometricOffer",
      "AppLockSettingsPage",
      'mode === "confirm"',
      'mode === "verify-change"',
      'mode === "verify-disable"',
      "Those PINs didn’t match. Create it again.",
      "appLockWrongPinMessage",
      "clearLock",
      'variant="quiet-seal"',
    ],
  },
  {
    file: "src/components/mobile/app-lock/app-lock-settings-page.tsx",
    markers: [
      "App lock is on",
      "App lock is off",
      "Protect this phone",
      "Create a 6-digit PIN",
      "Takes 10 seconds",
      "Works offline. Stored only on this phone.",
      "Turn off app lock",
      "This phone",
    ],
  },
  {
    file: "src/app/_layout.tsx",
    markers: ["AppLockProvider", "AppLockGate", "app-lock-modal"],
  },
  {
    file: "src/lib/admin-navigation.ts",
    markers: ['label: "App lock"', 'href: "/app-lock-modal"'],
  },
]

const failures = []

for (const check of checks) {
  const filePath = join(MOBILE_DIR, check.file)
  const source = readFileSync(filePath, "utf8")

  for (const marker of check.markers) {
    if (source.includes(marker)) continue

    failures.push({
      file: relative(MOBILE_DIR, filePath),
      marker,
    })
  }
}

if (failures.length > 0) {
  console.error("Mobile app lock flow check failed.")
  for (const failure of failures) {
    console.error(`- ${failure.file} is missing marker: ${failure.marker}`)
  }
  process.exit(1)
}

console.log("Mobile app lock flow check passed.")
