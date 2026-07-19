import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const MOBILE_DIR = resolve(new URL("..", import.meta.url).pathname);

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
      "unlock your EwaTrade workspace",
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
    file: "src/hooks/use-app-lock.tsx",
    markers: [
      "AppLockProvider",
      "AppState.addEventListener",
      "LocalAuthentication.authenticateAsync",
      'promptMessage: "Unlock EwaTrade"',
      "unlockWithBiometrics",
      "resetAfterSignOut",
    ],
  },
  {
    file: "src/components/mobile/app-lock-gate.tsx",
    markers: [
      "Enter your PIN code",
      "AppLockPinPad",
      "showBiometric={canUseBiometrics}",
      "Forgot code? Sign out and reset app lock",
    ],
  },
  {
    file: "src/components/mobile/app-lock-pin-pad.tsx",
    markers: [
      "PinCodeCells",
      "FingerPrintScan",
      'accessibilityLabel="Use fingerprint"',
      "Delete last digit",
    ],
  },
  {
    file: "src/app/app-lock-modal.tsx",
    markers: [
      "Create PIN code",
      "Confirm PIN code",
      "Fingerprint unlock",
      "Turn off app lock",
      "PinLengthSegment",
    ],
  },
  {
    file: "src/app/_layout.tsx",
    markers: ["AppLockProvider", "AppLockGate", "app-lock-modal"],
  },
  {
    file: "src/app/dashboard.tsx",
    markers: ['label="App lock"', 'router.push("/app-lock-modal" as never)'],
  },
];

const failures = [];

for (const check of checks) {
  const filePath = join(MOBILE_DIR, check.file);
  const source = readFileSync(filePath, "utf8");

  for (const marker of check.markers) {
    if (source.includes(marker)) continue;

    failures.push({
      file: relative(MOBILE_DIR, filePath),
      marker,
    });
  }
}

if (failures.length > 0) {
  console.error("Mobile app lock flow check failed.");
  for (const failure of failures) {
    console.error(`- ${failure.file} is missing marker: ${failure.marker}`);
  }
  process.exit(1);
}

console.log("Mobile app lock flow check passed.");
