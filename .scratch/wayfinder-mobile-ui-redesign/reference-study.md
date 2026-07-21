# Mobile UI Redesign Reference Study

## Sources

- [Pin 1: Flight booking mobile app](https://www.pinterest.com/pin/286893438761033938/) -> `.designs/wayfinder-mobile-ui-redesign/assets/reference-pins/pin-1-286893438761033938.jpg`
- [Pin 2: Service app before/after](https://www.pinterest.com/pin/286893438761033937/) -> `.designs/wayfinder-mobile-ui-redesign/assets/reference-pins/pin-2-286893438761033937.jpg`
- [Pin 3: Furniture commerce app](https://www.pinterest.com/pin/286893438761033936/) -> `.designs/wayfinder-mobile-ui-redesign/assets/reference-pins/pin-3-286893438761033936.jpg`
- [Pin 4: Delivery tracking app](https://www.pinterest.com/pin/286893438761033935/) -> `.designs/wayfinder-mobile-ui-redesign/assets/reference-pins/pin-4-286893438761033935.jpg`
- [Pin 5: Shipping list app](https://www.pinterest.com/pin/286893438761033934/) -> `.designs/wayfinder-mobile-ui-redesign/assets/reference-pins/pin-5-286893438761033934.jpg`

Tracked source metadata remains at `assets/reference-pins/sources.json`; its
`file` entries point to the root `.designs/` archive.

## Reference Observations

- Pin 1 uses a strong colored brand header, ticket-like cards, segmented trip controls, compact itinerary rows, seat grids, QR/receipt surfaces, and a single heavy checkout CTA.
- Pin 2 shows the clearest home-screen direction: dark teal top zone, location/context header, search, simple hero card, two-column category cards, product/service cards, and a clean rounded bottom nav.
- Pin 3 gives commerce patterns for EwaTrade: search plus filter, icon categories, product grid, product detail gallery, variant swatches, favorite action, and sticky bottom purchase CTA.
- Pins 4 and 5 are the best fit for operational workflows: delivery/order cards, timeline progress, pill filters, rounded black floating bottom nav, central plus action, tracking/detail sheet, and status chips.
- Across the references, the feel is clean and modern: bright surfaces, restrained color, high contrast CTAs, soft rounded cards, light shadows, large tap targets, and minimal explanatory text.

## Recommended Design Direction

- Use a light-first operational commerce UI with a dark mode counterpart, not a single dark-only redesign.
- Use deep green/teal as the primary brand/action color, near-black for floating navigation and selected states, warm amber/orange only for money, warnings, or attention.
- Keep the screen system card-based but not bulky: headers and lists should be dense enough for sales reps working quickly.
- Adopt a rounded floating bottom navigation with a central create-sale/add action, with haptics and GND-style pressable behavior during implementation.
- Use pill filters, segmented controls, status chips, compact timeline/progress rows, and bottom-sheet forms as the main interaction vocabulary.
- Preserve NativeWind discipline for implementation: prefer `className` only, and move fully to style objects only when dynamic styles require it.
- Every form-heavy screen must be keyboard-safe and bottom-sheet aware from the design spec stage, not left to implementation cleanup.

## Screen Families To Redesign

- Splash, login, signup, OTP, and business entry.
- First product setup and initial inventory stock capture.
- Owner dashboard and attendant dashboard.
- Create sale, quantity picker, customer selection, payment, and receipt/success.
- Product and inventory management, including variants/sub-units and stock state.
- Staff invite and attendant onboarding.
- Product share link creation, link management analytics, and shared-link order follow-up.
- Customer book.
- Offline/sync state, conflict review, and empty/error/loading states.
- Subscription, settings, profile, and account/business switching.
