# Android Emulator Validation

Date: 2026-07-14

## Scope

Validate that the mobile design-system playground work can target the local Android emulator and document the remaining hands-on launch limitation.

## Emulator

- AVD selected: `Pixel_3a_API_34`
- Device id: `emulator-5554`
- Display size: `1080x2220`
- Boot animation state: `stopped`
- User preference: keep the emulator running for future mobile validation; do not shut it down after this task.

## Commands

```sh
/Users/M1PRO/Library/Android/sdk/emulator/emulator -avd Pixel_3a_API_34 -no-snapshot-load -no-audio -no-boot-anim
/Users/M1PRO/Library/Android/sdk/platform-tools/adb devices
/Users/M1PRO/Library/Android/sdk/platform-tools/adb shell wm size
/Users/M1PRO/Library/Android/sdk/platform-tools/adb shell getprop init.svc.bootanim
```

## Initial Result

The emulator booted successfully and remains available as `emulator-5554`.

Attempted Expo Android launch:

```sh
bun --cwd apps/mobile dev --android
EXPO_PORT=3003 bun --cwd apps/mobile dev --android
```

The first launch found port `3002` already in use by another process and Expo skipped the interactive alternate-port prompt. The `EXPO_PORT=3003` retry did not bind to `3003` during the validation window, so the app was not launched on-device in this pass.

## Follow-Up Result

The existing `3002` process was confirmed to be an Expo mobile dev server for `apps/mobile`:

```text
node ./scripts/run-expo-cli.cjs start --port 3002
```

Expo Go was present on the emulator as `host.exp.exponent`, and the app was opened through the existing server with:

```sh
/Users/M1PRO/Library/Android/sdk/platform-tools/adb shell am start -a android.intent.action.VIEW -d exp://192.168.18.7:3002/--/design-system
/Users/M1PRO/Library/Android/sdk/platform-tools/adb shell am start -a android.intent.action.VIEW -d 'exp://192.168.18.7:3002/--/design-system-pattern?pattern=analytics'
```

Captured evidence:

- `.scratch/wayfinder-mobile-design-system-playground/reviews/screenshots/login-design-system-shortcut.png`
- `.scratch/wayfinder-mobile-design-system-playground/reviews/screenshots/login-shortcut-routed-design-system.png`
- `.scratch/wayfinder-mobile-design-system-playground/reviews/screenshots/catalog-assets-light.png`
- `.scratch/wayfinder-mobile-design-system-playground/reviews/screenshots/catalog-dark.png`
- `.scratch/wayfinder-mobile-design-system-playground/reviews/screenshots/analytics-pattern-light.png`
- `.scratch/wayfinder-mobile-design-system-playground/reviews/screenshots/catalog-soft-buttons-light.png`

## Follow-Up

Reuse the running emulator for the next hands-on pass. The emulator should stay running by user request.
