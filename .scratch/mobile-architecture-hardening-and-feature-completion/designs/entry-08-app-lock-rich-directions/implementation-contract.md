# EWA-ENTRY-008 App Lock implementation contract

## Selected direction

Option E, **Quiet Seal**, approved by the owner on 2026-09-04.

## Visual contract

- Paprika owns the top cap and status bar in Light and Dark.
- A centered palm seal bridges the colored cap and the main canvas.
- The screen title, concise state copy, six PIN indicators, keypad and local-device note share one centered axis.
- The keypad uses three stable equal lanes and 44-point-or-larger haptic targets. The final row keeps biometric/blank, zero and delete in the same lanes.
- Light uses the Market Day cream canvas. Dark uses the Market Day deep canvas with deliberate semantic outlines and readable copy.
- Large text may reduce display type and spacing, but must keep every action visible and the keypad usable without overlap.

## Behavior preserved

- Six-digit create and confirm with automatic submission.
- Current-PIN verification before change or disable.
- Manage state for changing PIN, fingerprint availability and disabling App Lock.
- Unlock gate, optional automatic fingerprint prompt and manual fingerprint action.
- Wrong-code, temporary lockout, hydration failure and pending states.
- Forgotten-code sign-out and device-local App Lock reset.
- SecureStore hash, salt, biometric preference, failed-attempt count and unlock timing remain device-local and unchanged.
- Customer shell routes remain outside the Business App Lock boundary.

## Implementation boundary

- Reuse `useMarketDayPalette` and shared `Icon`, `Pressable`, `Text` and App Lock state hooks.
- Extract the Quiet Seal presentation so setup and unlock do not drift.
- Keep route and security state transitions in their existing owners. The redesign must not add API, database or authentication changes.

## Acceptance

- Create, confirm, mismatch, verify-change, verify-disable and manage states.
- Unlock, wrong code, temporary lockout, hydration error, fingerprint unavailable, fingerprint enabled and reset recovery.
- Android Light/Dark at 100% and 200% text.
- Status-bar continuity, safe-area bounds, 44-point touch targets, stable three-lane keypad alignment and no clipped copy.
- Focused App Lock, theme, NativeWind, large-text, typecheck/export and diff checks.
