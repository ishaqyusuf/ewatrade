## Destination

Create a screen-by-screen mobile UI redesign specification for the EwaTrade Expo app, using the downloaded Pinterest references as visual templates while preserving the Retail Ops MVP workflows, offline-first behavior, keyboard-safe forms, reusable components, NativeWind constraints, GND-style floating sheets, and dark/light theme support.

## Notes

- Planning only. This Wayfinder should produce decisions and a handoff-ready redesign spec, not implement screens.
- Use the UI Designer specialist framing from `agency-design`: design-system first, accessible, consistent, implementation-aware, and component-library oriented.
- Reference assets live in `assets/reference-pins/`; the visual study is `reference-study.md`.
- Design direction recommendation: light-first clean commerce/ops UI with dark mode, deep green/teal primary, near-black floating nav/selected states, amber/orange for attention, compact rounded cards, pill filters, timeline rows, bottom-sheet forms, and a central create-sale action.
- Implementation constraints to preserve in later handoff: Expo + React Native + NativeWind, Tailwind-first styling, avoid unnecessary `className` + `style` mixing, GND-style pressable/haptic buttons, floating bottom sheets, keyboard-safe input screens, and screen/component decomposition instead of bulky single components.

## Tickets

- [ ] [Audit current mobile screens and states](01-audit-current-mobile-screens-and-states.md)
- [ ] [Lock visual language, tokens, and component vocabulary](02-lock-visual-language-tokens-and-component-vocabulary.md)
- [ ] [Decide app shell, navigation, and global interaction model](03-app-shell-navigation-and-global-interaction-model.md)
- [ ] [Redesign auth, signup, OTP, and business-entry screens](04-auth-signup-otp-business-entry-redesign.md)
- [ ] [Redesign first product setup and inventory entry screens](05-first-product-inventory-entry-redesign.md)
- [ ] [Redesign owner and attendant dashboards](06-owner-attendant-dashboard-redesign.md)
- [ ] [Redesign create-sale, checkout, customer, payment, and receipt flow](07-create-sale-checkout-flow-redesign.md)
- [ ] [Redesign product, inventory, variant, and stock management screens](08-product-inventory-management-redesign.md)
- [ ] [Redesign staff, customer book, subscriptions, and settings surfaces](09-staff-customer-subscription-settings-redesign.md)
- [ ] [Redesign product share, shared-link orders, offline sync, and conflict states](10-share-links-offline-sync-conflict-redesign.md)
- [ ] [Assemble final screen-by-screen redesign handoff](11-final-screen-by-screen-redesign-handoff.md)
- [ ] [Define implementation QA and visual acceptance plan](12-implementation-qa-visual-acceptance-plan.md)

## Decisions so far

- No ticket decisions resolved yet. Initial reference study recommends the visual direction above; final design decisions should live in the tickets as they are resolved.

## Not yet specified

- Exact screen inventory after auditing the current Expo app routes and UI state coverage.
- Final component names, token values, layout measurements, icon choices, and dark-mode color pairings.
- Whether the redesign handoff should be markdown-only, Figma-style image boards, generated static mockups, or a prototype branch.
- The final rollout order once design decisions are complete.

## Out of scope

- Implementing the redesign in code inside this Wayfinder.
- Changing API contracts, database schema, auth, sync semantics, or subscription logic unless a design decision reveals a necessary follow-up spec.
- Designing full customer ecommerce app experiences beyond the already planned shared product/order link surfaces.

