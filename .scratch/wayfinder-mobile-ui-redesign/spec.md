# Spec: EwaTrade Mobile UI Redesign

Status: ready-for-agent
Source map: [Wayfinder: Mobile UI Redesign Screen-by-Screen](map.md)
Reference study: [Mobile UI Redesign Reference Study](reference-study.md)

## Problem Statement

EwaTrade already has a rich Retail Ops MVP direction for owner signup, OTP verification, first product setup, inventory, sales, staff, customer book, product share links, offline sync, subscriptions, and dashboard reporting. The current mobile experience needs a full screen-by-screen redesign so those workflows feel clean, modern, fast, and trustworthy on a phone.

The redesign must not become a decorative skin that ignores the reality of daily retail work. Owners and attendants need fast one-handed sales entry, clear stock and sync states, lightweight setup forms, reliable keyboard behavior, visible offline mode, and simple surfaces that do not feel bulky. At the same time, the app needs a polished visual system inspired by the downloaded Pinterest references: bright operational surfaces, deep teal/green brand accents, near-black floating navigation and selected states, compact rounded cards, pill filters, timeline/status rows, strong CTAs, and a serious dark mode.

The main product risk is visual drift. If each screen is redesigned in isolation, the app can become inconsistent, slow to implement, and hard to maintain. If the redesign ignores existing Expo, NativeWind, GND-inspired pressable/sheet patterns, keyboard safety, and role-specific retail workflows, implementation will reintroduce the same UI issues the redesign is meant to fix.

## Solution

Create a complete mobile UI redesign specification for the EwaTrade Expo app. The spec will translate the downloaded reference images into an EwaTrade-specific design system and then apply that system screen by screen across the Retail Ops MVP.

The redesign will be light-first with a complete dark-mode counterpart. It will use deep teal/green as the primary action and brand color, near-black for floating navigation and selected states, and warm amber/orange only for money, warnings, or attention. Screens will use compact rounded cards, pill filters, segmented controls, bottom sheets, status chips, timeline rows, and sticky/floating CTAs where they improve speed.

The final redesign handoff will cover splash, auth, signup, OTP, business entry, first product setup, inventory entry, dashboards, create-sale checkout, product/inventory management, staff, customer book, subscriptions, settings, product share links, shared-link order follow-up, offline/sync, conflict review, empty states, loading states, errors, keyboard-open states, and light/dark mode.

Low-stock level alerts should be designed as an operational flow, not only a warning label. The mobile dashboard and product/inventory screens should show active alerts, threshold context, and fast paths to restock or adjust stock where the user's role allows it, while keeping attendant views focused and non-administrative.

The redesign will preserve the existing product and architecture boundaries. It will not change API contracts, schema, auth semantics, sync semantics, or subscription rules. It will define how existing workflows should look and behave, and it will identify reusable mobile primitives so implementation can stay componentized instead of becoming one bulky screen file.

## User Stories

1. As a new owner, I want the app to open with a polished splash screen, so that EwaTrade feels intentional and trustworthy.
2. As a new owner, I want the login screen to make sign up obvious, so that I do not miss the path to create my business account.
3. As a new owner, I want the signup screen to feel light and calm, so that setup does not look like a long form.
4. As a new owner, I want Gmail signup to be visually easy to choose, so that I can start quickly with my Google account.
5. As a new owner, I want email signup to ask only for my name, email address, and business name, so that I can create an account without unnecessary details.
6. As a new owner, I want placeholders to be prompt-style text such as "Enter your email address", so that the app does not confuse me with fake sample data.
7. As a new owner, I want the OTP screen to look polished and focused, so that email verification feels simple.
8. As a new owner, I want OTP entry to remain visible when the keyboard is open, so that I can complete verification on a small phone.
9. As a returning user, I want login screens to remain minimal, so that I can get back to work quickly.
10. As a user, I want auth errors and loading states to be clear, so that I know whether to retry or wait.
11. As a user, I want auth screens to work in light and dark mode, so that the app feels consistent with my phone setting.
12. As a new owner, I want the app to guide me to add my first item, so that I can start using inventory immediately.
13. As a new owner, I want the first-product prompt to feel encouraging, so that setup does not feel intimidating.
14. As a new owner, I want to enter item name, unit name, and price in a clean flow, so that the first product is easy to create.
15. As a new owner, I want to add optional sub-units or variants, so that I can represent units such as full, half, or quarter quantities when needed.
16. As a new owner, I want to skip variants if my product is simple, so that setup stays lightweight.
17. As a new owner, I want to enter current stock after defining the item, so that my inventory starts from a known count.
18. As a new owner, I want the first-product flow to handle the keyboard gracefully, so that price and stock fields are never hidden.
19. As an owner, I want a dashboard that shows sales, inventory, staff, sync, and pending work at a glance, so that I can understand business health quickly.
20. As an owner, I want dashboard metrics to be compact and scannable, so that I do not need to read a dense report while operating a shop.
21. As an owner, I want quick actions on the dashboard, so that I can add products, invite staff, create sale, or review links quickly.
22. As an owner, I want low-stock and inventory states to be visible, so that I know when action is needed.
23. As an owner, I want subscription state to appear without feeling like a marketing page, so that plan limits are understandable inside the operations app.
24. As an attendant, I want a focused dashboard, so that I see sales actions instead of admin settings.
25. As an attendant, I want the create-sale action to be reachable from the main app shell, so that I can start a transaction quickly.
26. As an attendant, I want product and variant rows to be easy to scan, so that I can pick the right sellable unit.
27. As an attendant, I want parent products with variants to be visually display-only, so that I do not accidentally sell an unspecified unit.
28. As an attendant, I want products without variants to be selectable directly, so that simple items remain fast to sell.
29. As an attendant, I want each selectable row to show product name, unit or variant, price, and stock state, so that I can make a confident selection.
30. As an attendant, I want a quantity control with plus, minus, and numeric entry, so that I can enter quantities quickly.
31. As an attendant, I want the total to update near the quantity control, so that I can confirm the amount before checkout.
32. As an attendant, I want checkout to show cash and transfer clearly, so that payment method is recorded without hesitation.
33. As an attendant, I want customer lookup and new customer entry in the sale flow, so that repeat customers are fast and new customers are saved.
34. As an attendant, I want sale success to feel complete and reassuring, so that I know the order was recorded.
35. As an attendant, I want insufficient-stock states to be visible before checkout, so that I do not promise unavailable stock.
36. As an attendant, I want create-sale to stay usable with one hand, so that I can operate while serving customers.
37. As an owner, I want product management screens to show product list, search, filters, variants, stock, and share actions clearly, so that inventory remains manageable as my catalog grows.
38. As an owner, I want product details to distinguish price, unit, stock, variants, and actions, so that editing does not feel risky.
39. As an owner, I want low-stock and empty-stock states to be visually distinct, so that urgent inventory work stands out.
40. As an owner, I want destructive product actions to be visually careful, so that staff do not accidentally disable important items.
41. As an owner, I want staff invite screens to be short and clear, so that adding attendants is simple.
42. As an invited attendant, I want onboarding to explain why I was invited and what to do next, so that I can start without confusion.
43. As an owner, I want the customer book to use reusable list and detail patterns, so that customer lookup feels consistent with product lookup.
44. As an attendant, I want customer search and selection to be quick, so that checkout is not slowed down.
45. As an owner, I want settings to be grouped calmly, so that business, profile, subscription, and account actions are easy to find.
46. As an owner, I want product share link creation to feel like a primary product action, so that sharing products is part of the sales workflow.
47. As an owner or attendant, I want copied/generated links to have clear feedback, so that I know the link is ready to send.
48. As an owner, I want generated-link analytics to show views, orders, status, and last activity, so that I can see which links are useful.
49. As an owner, I want deactivate-link actions to be clear and safe, so that expired or wrong links stop taking orders.
50. As an owner or attendant, I want shared-link order follow-up to show customer, order, payment, and delivery status, so that I can complete the request.
51. As an owner, I want delivery/order timeline visuals where relevant, so that follow-up work is easier to understand.
52. As a user, I want offline mode to show a top banner, so that I know changes will sync later.
53. As a user, I want offline status to be visible without blocking sales, so that the app stays useful during poor network.
54. As a manager, I want sync failures and conflicts to have a clear review surface, so that I can resolve issues instead of guessing.
55. As a manager, I want conflict states to distinguish failed, pending, syncing, synced, and conflict, so that each state has the right action.
56. As a user, I want empty states to tell me what to do next, so that new accounts do not feel broken.
57. As a user, I want loading states to keep layout stable, so that the app does not jump while fetching data.
58. As a user, I want errors to be short and actionable, so that I know whether the issue is network, validation, permission, or server related.
59. As a user, I want the bottom navigation to be rounded, clear, and reachable, so that I always know where I am.
60. As a user, I want the central create-sale/add action to stand out, so that the most important action is obvious.
61. As a user, I want screens to use consistent cards, chips, pills, and controls, so that I do not relearn the app on each screen.
62. As a user, I want light mode to feel bright and clean, so that the app works well in shops during the day.
63. As a user, I want dark mode to feel matte and intentional, so that it is not just inverted colors.
64. As a user, I want touch targets to be large enough, so that the app works during fast retail use.
65. As a user, I want important text to fit on compact phones, so that labels and buttons do not overlap.
66. As a developer, I want the redesign to define reusable components, so that implementation does not create one-off screen code.
67. As a developer, I want NativeWind-first styling rules preserved, so that the UI does not break from unnecessary `className` plus `style` mixing.
68. As a developer, I want dynamic-style exceptions to be explicit, so that components either use `className` or fully move to style objects where needed.
69. As a developer, I want bottom-sheet rules defined before implementation, so that every input-heavy sheet uses the same floating keyboard-safe behavior.
70. As a developer, I want haptic and press feedback handled through shared primitives, so that every button feels consistent.
71. As a developer, I want long lists to use virtualized patterns, so that product and customer screens stay smooth.
72. As a designer, I want each redesigned screen to reference the visual system, so that the app remains cohesive.
73. As a designer, I want reference images saved in the Wayfinder path, so that future agents can inspect the visual inspiration.
74. As a designer, I want the screen-by-screen handoff to include states, not only happy paths, so that implementation can finish without guessing.
75. As a QA reviewer, I want visual acceptance criteria for each screen family, so that the redesign can be verified objectively.
76. As a QA reviewer, I want screenshot coverage across device sizes, so that compact-phone problems are caught early.
77. As a QA reviewer, I want keyboard-open screenshots for form screens, so that hidden inputs are caught before release.
78. As a QA reviewer, I want light and dark screenshots for each important screen, so that theme drift is visible.
79. As a QA reviewer, I want offline and sync screenshots, so that reliability states are not forgotten.
80. As a project owner, I want the redesign spec to be decision-ready, so that implementation can proceed without re-litigating every screen.

## Low-Stock Level Alert Extension

- As an owner, I want mobile low-stock alerts to show the affected product, unit or variant, current available stock, and reorder threshold, so that I know why the item needs attention.
- As an owner or manager, I want alert actions such as restock, adjust stock, acknowledge, or snooze to be reachable from the dashboard and inventory detail screens, so that I can respond quickly.
- As an attendant, I want sale and inventory screens to warn me about low or out-of-stock items without exposing owner-only alert settings, so that I do not promise unavailable stock.
- As an owner, I want an empty low-stock alert state, so that a healthy inventory does not look like missing data.
- As a user, I want low-stock alert text and color treatment to remain clear in light and dark mode, so that the warning is not color-only.

## Implementation Decisions

- The redesign is a UI and UX specification for the existing EwaTrade mobile Retail Ops app. It does not introduce new domain behavior, schema, API contracts, auth semantics, sync semantics, or billing rules.
- The local issue tracker artifact for this spec is this `spec.md` file under the mobile UI redesign Wayfinder folder, with `Status: ready-for-agent`.
- The downloaded reference images in `.designs/wayfinder-mobile-ui-redesign/assets/reference-pins/` are the visual source material. The redesign should adapt their patterns, not copy their travel, furniture, delivery, or service-marketplace content literally.
- The recommended visual direction is light-first with dark mode. Light mode uses bright surfaces, subtle separators, compact rounded cards, and deep teal/green actions. Dark mode uses a matte near-black canvas, charcoal cards, crisp white text, muted secondary copy, and restrained green/amber accents.
- The redesign should avoid a one-note palette. Teal/green is primary, near-black is structural, amber/orange is reserved for money, warning, and attention, and neutral surfaces carry most of the UI.
- The app shell should use a rounded floating bottom navigation pattern with a central create-sale/add action. The exact tab count and owner/attendant differences are decided by the Wayfinder shell ticket.
- All screen families should use a shared interaction vocabulary: pill filters, segmented controls, status chips, compact cards, timeline rows, bottom sheets, sticky/floating CTAs, quantity controls, and haptic pressables.
- Floating bottom sheets should be the default for focused forms and transient operational tasks when they do not need a full-screen workflow. Full-screen flows remain appropriate for auth, multi-step onboarding, and dense management screens.
- Every input-heavy screen or sheet must be keyboard-safe by design. The handoff must explicitly cover keyboard-open layout for signup, OTP, first product setup, quantity entry, customer entry, staff invite, product edit, and conflict/follow-up forms.
- Placeholders must use direct prompt copy rather than fake sample data. Use prompts such as "Enter your email address", not example emails, people, businesses, addresses, or numbers.
- The redesign must preserve the existing owner and attendant role split. Owner screens include admin metrics, staff, subscription, product management, link management, and settings. Attendant screens prioritize sale creation, customer lookup, assigned/available inventory, recent sales, and sync state.
- The first-product setup flow must remain lightweight while covering item name, unit name, unit price, optional variants/sub-units with prices, and starting stock.
- Create-sale is the highest-priority speed workflow. It must optimize item/variant selection, quantity adjustment, customer selection, payment method selection, total visibility, and receipt/success feedback.
- Product parents with variants should be display-only in create-sale lists. Sellable variants are selectable. Products without variants expose the primary unit as selectable.
- Product and inventory management screens should handle missing product images gracefully with icon or neutral visual placeholders.
- Low-stock alerts should use a reusable alert row/card pattern that shows severity, available quantity, threshold, threshold source, and age. The mobile UI should distinguish low-stock from out-of-stock, and should keep alert-management actions owner/manager-only while allowing attendants to see role-safe warnings.
- Share-link management should be treated as a serious sales workflow, with clear link creation, native share/copy feedback, analytics, deactivation, and shared-link order follow-up.
- Offline mode should use a persistent top banner that is visible but not blocking. Sync status should distinguish offline, pending, syncing, synced, failed, and conflict.
- Conflict review should use a calm operational pattern: affected item/order, business impact, recommended action, retry/acknowledge controls, and role-appropriate permission gating.
- Subscription screens should remain operational and plan-focused, not marketing-like. They show current plan, tier comparison, usage against limits, and upgrade handoff state.
- The final handoff should be screen-by-screen and include purpose, entry points, primary actions, secondary actions, layout notes, component references, states, dark/light treatment, keyboard/bottom-sheet notes, accessibility requirements, and implementation ordering.
- The implementation should use Expo and React Native patterns already accepted by the project. NativeWind remains the default styling approach.
- The implementation must avoid unnecessary `className` plus `style` mixing on the same React Native component. Where dynamic styling requires `style`, convert that component's relevant styling fully and intentionally.
- Shared primitives should be planned for buttons, icon buttons, pressables, inputs, OTP inputs, quantity steppers, banners, status chips, product rows, customer rows, timeline rows, empty states, floating bottom sheets, and keyboard-safe screen wrappers.
- GND-inspired pressable/haptic button behavior should be preserved during implementation through shared primitives rather than repeated per-screen code.
- The redesign should not require implementation in the Wayfinder itself. The Wayfinder tickets resolve decisions and produce the final redesign handoff.

## Testing Decisions

- Tests should verify external user-facing behavior and visual acceptance, not internal component structure.
- The highest seam for implementation QA should be workflow-level mobile checks that exercise the real screen flows: auth, first product setup, dashboard, create sale, customer lookup, share links, offline sync, conflict review, subscription, and settings.
- The design-handoff seam should verify that each screen family has purpose, entry points, primary/secondary actions, state coverage, dark/light notes, keyboard notes, bottom-sheet notes, and accessibility notes before coding starts.
- Visual QA should include screenshots for light mode, dark mode, compact phone viewports, keyboard-open states, bottom-sheet states, empty states, loading states, errors, offline banner, sync failure, and conflict review.
- Create-sale QA should include item/variant lists, display-only parent rows, selectable variants, quantity stepper, numeric keyboard entry, total preview, customer lookup/new customer, payment method, success, insufficient stock, and offline sale state.
- Auth QA should include login, signup, Gmail entry, email signup, OTP entry, OTP resend, loading, invalid OTP, keyboard-open state, and dark mode.
- First-product QA should include no-variant setup, variant setup, price entry, stock entry, validation, keyboard-open state, success, and offline/unavailable fallback where applicable.
- Dashboard QA should verify owner and attendant role variants, hidden owner-only actions for attendants, empty new-user state, offline banner, and summary card readability.
- Product/inventory QA should verify search, filters, product detail, variant rows, low-stock state, empty-stock state, edit flows, share action, and missing-image placeholder behavior.
- Low-stock alert QA should verify active-alert rows, empty alert state, threshold copy, out-of-stock severity, owner/manager actions, attendant read-only warnings, light/dark contrast, and compact-phone text fit.
- Share-link QA should verify link generation, copied/shared feedback, analytics rows, active/inactive state, deactivation, shared-link order follow-up, payment/fulfillment status, and delivery/order timeline visuals.
- Offline/sync QA should verify offline banner placement, queued changes, pending/syncing/synced/failed/conflict states, retry behavior, and manager-only conflict acknowledgement.
- Accessibility QA should verify readable contrast, touch targets, text fit, focus order where applicable, status text that is not color-only, and safe-area handling.
- Performance QA should verify virtualized behavior for long product and customer lists and avoid broad rerenders in fast sale flows.
- NativeWind/style QA should scan changed mobile UI components for unnecessary `className` plus `style` mixing.
- Prior art should come from existing mobile QA scripts, Mobile Retail Ops MVP checks, GND keyboard/haptic patterns, and the current `.scratch/mobile-retail-ops-mvp` screenshot artifacts.

## Out of Scope

- Implementing the redesigned screens in code.
- Changing database schema, Prisma models, migrations, API contracts, tRPC procedure names, auth behavior, sync semantics, or subscription entitlement rules.
- Building a full customer ecommerce app.
- Redesigning web storefront checkout beyond the mobile surfaces that manage shared product links and shared-link order follow-up.
- Creating final production brand identity, logo work, or marketing site design.
- Introducing new paid billing provider behavior or app-store purchase flows beyond visual plan surfaces.
- Adding delivery rider or dispatch app screens.
- Replacing existing architectural rules around Midday-style structure, tRPC APIs, service/repository boundaries, and Prisma-owned schema.

## Further Notes

- The screen-by-screen Wayfinder should still be worked through after this spec. The spec defines the redesign destination; the Wayfinder tickets resolve the detailed design decisions.
- The current recommended first frontier is to resolve the screen inventory and the visual-token/component-vocabulary tickets before prototyping individual screens.
- The downloaded reference images should remain in the Wayfinder folder so future agents can inspect the exact visual inspiration without relying on Pinterest availability.
- Any implementation handoff created later should include the final screen list, component inventory, visual QA checklist, and rollout order.
