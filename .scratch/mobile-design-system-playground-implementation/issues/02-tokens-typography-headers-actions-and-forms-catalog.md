# 02 — Tokens, Typography, Headers, Actions, And Forms Catalog

**What to build:** the playground foundation catalog so the project owner can review semantic light/dark tokens, type scale, spacing/density examples, header variants, buttons/icon buttons, loading and disabled states, form fields, OTP, search, toggles, segmented controls, and quantity controls.

**Blocked by:** 01 — Mobile Design-System Playground Shell And Catalog.

**Status:** implementation-complete

- [x] Token examples show light and dark semantic roles for canvas, card, primary, success, warn, destructive, muted, border, and chart colors.
- [x] Typography examples cover large totals, screen titles, section headers, row titles, metadata, helper text, error text, badges, and button labels.
- [x] Header examples include auth/onboarding, dashboard shell, sheet, and detail-style headers.
- [x] Action examples include primary, secondary, muted, destructive, icon-only, loading, disabled, selected, and pressed states.
- [x] Form examples include text input, multiline input, search, OTP, toggle, segmented control, quantity stepper, helper text, error text, and keyboard-open readiness notes.
- [x] New playground code preserves NativeWind/style discipline and shared primitive reuse.

## Implementation Notes

- Added token swatches, typography examples, header examples, action examples, and shared form controls to the playground.
- Reused existing shared primitives including `AuthHeader`, `SecondarySheetHeader`, `SessionSectionHeader`, `ActionButton`, `FormField`, `OtpInput`, `QuantityStepper`, `Switch`, and sale segment controls.
- Focused QA confirms NativeWind/style discipline and semantic theme-color guard compliance.
