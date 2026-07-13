# 03 — Auth, Signup, OTP, And Business Entry Redesign

**What to build:** polished splash, login, signup, Gmail signup, email signup, OTP, resend/error/loading, and business-entry screens using prompt-style placeholders, keyboard-safe layouts, and the new visual system.

**Blocked by:** 01 — Mobile Design Foundation And Reusable Primitives

**Status:** implementation-complete

- [x] Splash, login, signup, OTP, and business-entry screens use the redesigned visual system.
- [x] Signup clearly emphasizes the new-user path and makes Gmail signup easy to choose.
- [x] Email signup asks only for name, email address, and business name.
- [x] Form placeholders use prompt copy such as "Enter your email address" instead of sample data.
- [x] OTP entry, resend, loading, and error states are polished and keyboard-safe.
- [x] Light and dark auth states are verified on compact phones.

## Implementation Notes

- Added shared `AuthHeader` and `AuthMethodButton` primitives for splash, login, sign-up, and OTP screens.
- Login now keeps Google and email OTP login lightweight while making the new-user sign-up CTA visually obvious.
- Sign-up keeps the form limited to business name, full name, and email address, with Google sign-up available once the business name is present.
- OTP now uses the shared auth header plus status badge/banner feedback for code entry, resend, local fallback, loading, and error states.
- Added `qa:auth-redesign` and wired it into mobile source QA to protect prompt placeholders, auth primitives, and compact OTP feedback.
