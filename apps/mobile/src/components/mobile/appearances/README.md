# Mobile presentation modules

`classic/` preserves the earlier production appearance. `market-day/` owns the
approved colorful redesign. Both receive current feature state and callbacks
through a shared presentation contract. Expo routes stay thin; feature controllers
own mutations, queries, auth, navigation, and local form state outside this folder.

## Selection

Release defaults and per-screen rollout live in
`src/lib/mobile-design/release-config.json`. Classic is the default. Expo reads
that same file when selecting native splash assets. Changing native assets
requires a new binary; preview preferences affect only the React presentation.

Internal builds expose Design System > Switch design appearance. Select a
whole-app preference, then override individual screens if needed. Inherit on a
screen uses the whole-app choice; Inherit for the whole app uses release policy.
Reset clears both. Writes complete before publishing a new preference; failed
saves retain the active choice. Preferences hydrate before the app opens.
Production ignores stored preview choices and follows release configuration.

Light/Dark/System remains independent of Classic/Market Day.

## Integration inventory

| Screen | Shared controller | Module status | Acceptance |
| --- | --- | --- | --- |
| Login | `mobile/login/login-screen.tsx` | Both views extracted | Pending |
| Onboarding | `mobile/onboarding/onboarding-screen.tsx` | Both views extracted | Pending |
| Staff onboarding | `mobile/staff-onboarding/staff-onboarding-screen.tsx` | Both views extracted; common invitation states retained | Pending |
| Startup splash | `mobile/startup-splash-gate.tsx` | Both React views + build asset selection | Pending |
| Verify email | `mobile/verify-email/verify-email-screen.tsx` | Both views extracted; shared OTP actions | Pending |
| App lock | `mobile/app-lock/` + security gate | Both settings/unlock views; shared controllers | Pending |
| Sign Up | `mobile/sign-up/sign-up-screen.tsx` | Both layouts and category choices; shared four-step form | Pending |
| Business Home | `mobile/dashboard/operations-dashboard-screen.tsx` | Classic cards + Market Ledger; shared operations | Pending |
| Sales Rep Home | `mobile/dashboard/operations-dashboard-screen.tsx` | Classic cards + Shift Ledger; shared role gates | Pending |
| Orders | `mobile/orders/orders-screen.tsx` | Classic cards + Dispatch Ledger; shared paginated list | Pending |
| Order Detail | `mobile/order-detail/order-detail-screen.tsx` | Classic overview + Dispatch Docket; shared payment/fulfilment sheets | Pending |
| Catalog | `mobile/catalog/catalog-screen.tsx` | Classic operational list + Market Stockbook; shared query and Add navigation | Pending |
| Catalog item detail | `mobile/catalog-item/catalog-item-screen.tsx` | Classic overview + Market Item Card; shared query and navigation | Pending |
| More | `mobile/more/more-screen.tsx` | Classic settings + Market Desk; shared theme/sign-out sheets and offline review | Pending |
| Global Search | `mobile/global-search/global-search-screen.tsx` | Classic grouped rows + Market Finder; shared server search and navigation | Pending |
| Updates | `mobile/updates/updates-screen.tsx` + existing automatic host | Classic cards + Release Ticket; shared manual and automatic update owners | Pending |
| Create Sale | `mobile/create-sale/use-create-sale.ts` + stable workflow chrome | Classic checkout + Counter Slip; shared Items/Customer/Review and child pickers/form | Pending |
| Closeout | `mobile/closeout/use-closeout.ts` | Classic declarations + Shift Tally; shared exact-quantity review and create/finalize commands | Pending |
| First Product setup | `mobile/catalog-setup/use-catalog-setup.ts` + `use-catalog-variants.ts` | Classic forms + Market Starter; shared main sections, helpers, unit/variant editors and confirmations | Pending |
| New Business | `mobile/new-business/use-new-business.ts` | Classic setup + Market Workspace; shared four-step form, currency and guarded creation | Pending |
| Catalog browser modal | `mobile/catalog/catalog-modal-screen.tsx` + shared Catalog controller | Independent `catalog-picker` key; reused Classic/Stockbook slots and stable workflow chrome | Pending |
| Stock Intake | `mobile/stock-intake/use-stock-intake.ts` | Classic inventory form + Stock Journal; shared exact draft, balance/team selection and compact review | Pending |
| Unit Conversion | `mobile/unit-conversion/use-unit-conversion.ts` | Classic unit form + Packing Bench; shared exact conservation, bounded source/target selection and compact review | Pending |
| Remaining 15 packages | Existing production owners | Extraction pending | Pending |

`MODULARIZED_SCREENS` tracks integrated source, not tested readiness. Unextracted
screens retain their current UI until migrated; a whole-app setting is not yet
a claim of full release coverage. Missing Market Day implementations fall back
to Classic after a screen is connected to the selection boundary.

## Source provenance and implementation rules

Closeout uses a shared controller and exact projection for current-Store staff
custody balances. Classic preserves declaration cards; Shift Tally adds ruled
rows and unit-safe counts. Both use the same compact review, measured footers,
keyboard-aware list, online/permission gates and retained create/finalize retry
identities. Retry retention is scoped to the mounted workflow, not a new outbox.
Shared `workflow-chrome.tsx` now serves Closeout and Create Sale through stable
feature wrappers. All operational and visual acceptance remains deferred.

Create Sale now connects both appearances through a shared draft/command hook,
focused Items/Customer/Review sections and a stable workflow chrome. Counter Slip
is selected in entry-18. Both pickers and the customer sheet receive the selected
appearance; non-Create-Sale callers still default to Classic. Initial-item loading,
picker retry states, pending/duplicate-submission guards and scheduled eligibility
are shared. The controller remains mounted when appearance changes; focus/scroll
continuity and measured footer/keyboard geometry still require deferred QA.

Classic Login, onboarding, staff, OTP and App Lock layouts were recovered from `e4cd41bb`.
Current unified-login routing, customer return targets, required names, invitation
behavior, button alignment and keyboard corrections remain current. Do not copy
historical controllers or restore retired Customer History login.

Classic Sign Up uses the pre-Market multi-step appearance at `67c3c736`, with
the current four-step flow, bottom search, required contact/profile fields,
Google/OTP payloads and Quick Fill retained in one shared controller. The old
420px keyboard offset is not restored: both designs retain Android native
resize and the current 48px iOS clearance. Only presentation-local scroll state
resets when the selected view changes; form values remain in the controller.

Dashboard Classic presentation comes from
`442f29d2`, retaining current readiness, queued-work and navigation behavior.
Market Ledger and Shift Ledger live in the Market Day module; their previous
paths are compatibility exports. Both dashboard routes share one controller.
The shell supports a className-only content path, and scoped variables retain
safe-area offsets and native hairline widths without mixing style and className.

Orders also recovers its Classic cards, filters and rows from `442f29d2`.
Its current first-order gate, date/status/search state, page loading, cached and
queued rows, customer navigation and create actions stay in one controller.
The two appearances own masthead, summary, filters, rows, section spacing and
status-bar surfaces. The installed styled FlatList maps contentContainerClassName
to native content styles; scoped variables preserve safe-area/dock clearance.
The former Dispatch Ledger and AdminOrdersScreen paths remain compatibility
exports. No old query or offline policy was restored.

Catalog preserves the existing pre-Market operational list in Classic. Market
Stockbook selects the same query/controller and row mapper, adding loaded-result
counts, numbered rows, a compact Product/Service sheet and bottom search/Add bar.
The sheet only selects a kind; existing full-screen setup owns drafts, validation
and mutations. Search/type state survives appearance changes. Dynamic footer
height and dock clearance use scoped list variables; open-keyboard search has
zero additional gap. Missing price/stock is explicitly unknown. Compatibility
exports remain for old fixtures.

Catalog item detail preserves the existing pre-Market read-only overview in
Classic and selects Market Item Card through the same controller. No item editor
or stock modal is invented. The shared price projection distinguishes an unset
fixed price from quote-required; Create Order passes the same item ID to its
existing separately scoped workflow. Market's scroll/safe-area geometry uses
className with scoped variables. This page has no keyboard inputs.

More preserves the pre-Market menu in Classic and selects Market Desk with
shared role/readiness filtering and action handlers. Theme saving/rollback and
offline review remain controller-owned; the shared compact Appearance and
sign-out sheets include save failure, queue warning and a measured fixed action
footer. Neither sheet has an input or keyboard-avoidance offset. Frame metrics
and theme previews use scoped variables/className. Unknown settings/counts
remain unavailable and review actions guard pending/offline attempts.

Global Search keeps one debounced server-query controller and Classic / Market
Finder presentation slots. Results require a settled online query and current
data; old placeholders are not exposed for changed or short input. The shared
bottom search primitive supports an optional input cap and measured footer
height. Both scroll frames reserve that measured height and use native iOS
keyboard insets; the input remains keyboard-sticky without a second avoidance
offset. Result routes and quick-action permission conditions are unchanged.

Updates keeps the manual SDK subscription and guarded check/download/restart
commands in one feature controller. Classic preserves the original cards; Market
selects Release Ticket. Both use shared ActionButton metrics and bounded progress.
The existing automatic full-screen host selects matching presentation without
replacing its launch/foreground hook. Unknown progress remains unknown, and
preparation/restart percentages are not invented. Native update execution and
manual/automatic lifecycle coordination remain deferred acceptance work.

Use className with semantic colors. Market Day utilities map to the central
palette through NativeWind variables. Do not mix className and inline style on
an element. Market Day splash/nameplate and OTP layouts now use className;
the splash keeps computed measurements in a scoped NativeWind variable provider.
The Quiet Seal frame and shared OTP/PIN primitives also use className. Its
scroll container imports the installed styled ScrollView, which maps
contentContainerClassName separately from className; scoped variables carry
the live safe-area insets. Shared action labels use a scoped foreground variable
and explicit native text metrics. The last Order Detail labelStyle consumer has
migrated to labelClassName; the shared button no longer needs an inline label
style escape hatch.

Order Detail restores the Classic overview retained from `2682d921` and isolates
Dispatch Docket. Both use the shared delivery-schedule hook and current command
controller. Payment and line/all-product confirmations select appearance-specific
summaries, payment choices, warnings and action layouts while keeping form state,
Quick Fill, modal refs and callbacks shared. Classic does not restore the old
280px payment keyboard offset or one-tap stock commit. Both keep the current
24px sheet clearance and explicit confirmation. The detail screen itself has no
inputs and uses a restrained 24px offset. Legacy imports remain compatibility
exports; the Expo route imports the feature controller directly.

Extracted text uses `[-rn-line-height:N]` when preserving an exact original
native line height. The installed NativeWind theme overrides numeric `leading-*`
as unitless CSS; the installed react-native-css custom `-rn-` property path
directly maps numeric values to native properties. Choice labels similarly use
`[-rn-include-font-padding:false]` and `[-rn-text-align-vertical:center]` to
retain Android-safe text metrics without inline style. Runtime QA remains open.

The owner deferred tests, builds, device operations, and screenshots. Track all
acceptance gates in the canonical Scratch program. The first later QA task is
whole-app and per-screen switching, including persistence and cold launch.
