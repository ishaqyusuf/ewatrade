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
    markers: [
      "AppLockQuietSealScreen",
      "resolveAppLockQuietSealPresentation",
      "AppLockPinPad",
      "App lock storage is unavailable",
      "showBiometric={canUseBiometrics}",
      "Forgot code? Sign out and reset app lock",
      "Checking your lock code.",
      "Checking fingerprint.",
      'variant="quiet-seal"',
    ],
  },
  {
    file: "src/components/mobile/app-lock-pin-pad.tsx",
    markers: [
      "PinCodeCells",
      "FingerPrintScan",
      'accessibilityLabel="Use fingerprint"',
      "Delete last digit",
      '"quiet-seal"',
      "backspaceGlyph",
      "blankKey",
      "accessibilityState={{ disabled }}",
      "largeTextKeyHeight",
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
    markers: [
      "AppLockQuietSealScreen",
      "useMarketDayPalette",
      "marketDay.paprika",
      "Stored only on this phone",
      "contentInsetAdjustmentBehavior",
      "paddingBottom: insets.bottom",
    ],
  },
  {
    file: "src/app/app-lock-modal.tsx",
    markers: [
      "resolveAppLockQuietSealPresentation",
      "AppLockQuietSealScreen",
      "Fingerprint unlock",
      'mode === "confirm"',
      'mode === "verify-change"',
      'mode === "verify-disable"',
      "PIN codes did not match",
      "Too many wrong attempts",
      "clearLock",
      "Turn off app lock",
      'variant="quiet-seal"',
    ],
  },
  {
    file: "src/app/design-system/app-lock.tsx",
    markers: [
      "AppLockPreviewRoute",
      "AppLockQuietSealScreen",
      "shouldShowInternalDesignSystemEntry",
      'variant="quiet-seal"',
      'useState("")',
    ],
  },
  {
    file: "src/components/mobile/design-system/design-system-screen.tsx",
    markers: ['router.push("/design-system/app-lock")'],
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
