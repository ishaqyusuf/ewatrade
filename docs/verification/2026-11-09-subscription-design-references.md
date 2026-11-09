# Mobile Plan & billing references — 9 November 2026

The owner rejected the previous alternatives as web-like and bloated. The latest
instruction is to show plan/billing examples from Pinterest, Dribbble (interpreting
“Gripo”) and comparable libraries before further refinement. This reference review
is the current handoff; unfinished EwaTrade drafts remain preserved, unselected.

## Visual shortlist

These are view-only inspiration, not verified reusable UI kits. Public visibility
is not a reuse licence. Judgments below describe the observed captures, not current
commercial pricing or product availability.

| Reference | Observed pattern | Source / public preview |
| --- | --- | --- |
| Revolut, captured iOS plan screen | Plan tabs, compact benefit rows and a bottom action. Strongest starting point for the requested Benefits direction. | [Pinterest pin](https://www.pinterest.com/pin/paywall-subscription-ui-from-revolut-ios-app--962151907901123256/) · [Public image](https://i.pinimg.com/736x/32/04/14/3204146be84aff7a09d27ffecc6662c1.jpg) |
| Planner 5D, captured comparison | Two plan columns, concise feature labels and a fixed bottom action. Relevant to the full comparison. | [Public billing gallery](https://screensdesign.com/explore/screens/billing/) · [Public comparison preview](https://media.screensdesign.com/avs-pp/440a32d4f2114f878a2fdbdd1a7ad197.webp) |
| v0, captured account/usage/billing sheet | Native grouped settings; current plan/usage and billing maintenance have distinct rows. | [Public billing gallery](https://screensdesign.com/explore/screens/billing/) · [Public screen preview](https://media.screensdesign.com/avs-pp/e82c071c603545daaf31c7b68a059be6.webp) |
| Ahmed Tamjid subscription concept | Compact selectable plan rows, restrained typography and one primary action. A concept, not evidence of a shipped app. | [Creator source](https://dribbble.com/shots/24336111-Subscription-plan-UI-mobile-app) · [Selection image](https://cdn.dribbble.com/userupload/15055685/file/original-a03cac6c7e7bf76d3dd2c5515c58ea72.png?resize=752x&vertical=center) |

Additional inspected concepts: [Alomgir Hossen](https://dribbble.com/shots/26563339-Subscription-plan-Mobile-app-UI)
and [Diana Larussa](https://dribbble.com/shots/27169529-Subscription-Management-Screen-Mobile-App-UI).
The first leans toward an acquisition paywall; the second models multiple teacher
subscriptions, so neither is a direct domain model for EwaTrade's owner plan.
Broader candidates were searched across original creator pages, Pinterest,
Mobbin-related results, Refero and real-app galleries. No licensed-asset ranking
is claimed: the request is visual examples, not downloadable kits.

## Inspection and limitations

Search and original creator pages were opened on 9 November 2026. The four
shortlisted visual samples were inspected in the in-app browser. Original sources
and previews are linked above; no remote media was downloaded into the repository.
Source/sample tabs were retained as user-facing deliverables.

Pinterest automated fetches returned 403, but the specific public pin rendered
normally in the existing browser. Its old Refero destination returned 404, so the
working pin is the reference. The ScreensDesign gallery exposes the public
comparison image; the full Planner 5D replay is Pro-gated and was not unlocked.
The public preview, not the locked replay, supports this comparison reference.
No new login, purchase, paid library subscription or permission grant was made.

The recommendation is to use Revolut's plan navigation and benefit hierarchy,
Planner 5D's comparison structure and v0's native maintenance grouping as separate
pattern references. EwaTrade's actual owner/business relationship, purchase/activation
separation, relevant higher-tier choices and complete benefit facts still govern
its eventual design. No reference's price, billing period, trial or entitlement is
being adopted.

## Preserved draft work before reference steering

Exact Opus authoring ran successfully at `claude-opus-5-5` with explicit high
effort. Init metadata and final modelUsage confirm that exact model. The safe,
restricted, no-MCP/no-Chrome author job received only sanitized static preview
source, synthetic screenshots, public product facts and skill references. Only
StructuredOutput was available. Impeccable and Copywriting were both supplied.
Codex integrated the authored layouts and made explicit copy/controller corrections.

Latest archived drafts under the same Workshop path and stable a/b keys:

- a/v17 `243c0a51-e51d-4c4c-81a4-9427cfb66544`, Upgrade benefits.
- b/v17 `bd291917-c197-44cb-bc74-707df90ae82b`, Side-by-side comparison.

The drafts remove the normal owner-subscription card, role/business context row
and main release action. Current plan is fixed; alternatives are Free→Starter/
Growth/Pro, Starter→Growth/Pro, Growth→Pro and Pro→current benefits/Manage. Unknown
plans do not invent an upgrade relationship. Conditional activation remains
explicit for a verified purchase on an uncovered business. Maintenance is in a
floating Subscription settings sheet; removing a plan retains a confirmation
explaining Free limits, kept records/staff and continuing store renewal.

Coordinator integration corrects exact financial-state copy instead of ambiguous
substring matching: cancelled purchase, ended access, refund/revocation and restore
failure remain distinct. All 53 state IDs remain; normal subscribed screens have
no status card. Monthly order scope is confirmed from existing Usage/marketing
context. Canonical feature keys are preserved with shorter display labels; features
absent from both compared plans are omitted. Monthly prices remain visible for
paid owners. Storefront Full catalog is bounded by the visible catalog limit and
published-item note. Default synthetic NGN prices match the unchanged top hero;
the translated long-price scenario remains available.

The existing click handler was updated in the preview adapter to route tab actions
before legacy purchase attributes: selecting a plan never starts checkout. A
separate eligible purchase action still opens confirmation. Current subscribers
manage changes through their store and cannot start a parallel purchase.

These drafts are NOT review-passed or ready for implementation. Normal phone
renders and first-direction tier/purchase checks ran. The broader runner stopped
at a settings-focus return assertion; it has not been diagnosed or accepted.
No claim of all-state browser verification or a new independent finish-review
pass is made. One static detector pass on the new lower styles/modules returned
zero findings, which is not design or native acceptance. Complete focused QA and
fresh independent visual/copy review remain after the reference direction is
settled. Old 205/56-check receipts belong to the earlier rejected revisions.

The selected/implemented a/v9 `e33d8ec7-faa5-453c-a84b-f72d9ca5fb00`, rejected
v10/v14 alternatives and all intermediate history remain preserved; c/v13 is
unchanged, implementation count remains one. The upper plan/vertical Usage
renderer and base CSS remain byte-identical in both drafts. No new selection,
native/product billing/catalog implementation, provider action or deployment.

## Handoff and Brain impact

Owner reference preference is the next input. Continue the two requested Benefits
and Full comparison refinements from the preserved sources after that preference;
do not silently revive the rejected owner card or duplicate current/Free tabs.
This is a design continuation point, not cancellation of the app/marketing alignment
objective. Existing runtime storefront caps await the separately selected app work.

Local-only Brain updated: `.brain/features/mobile-owner-ledger.md` and
`.brain/tasks/subscription-benefits-alignment-2026-11-09.md`. No API, schema,
permission, assistant authority or provider contract changed. Only this owned
handoff/reference receipt is included in the local commit; unrelated billing and
privacy work is preserved.

Documentation-only source smoke passed: 51 tests / 254 assertions across four
existing files, plus QA tooling types. Scope was this owned receipt via `--files`;
unrelated concurrent billing/privacy edits were excluded. Offline QA doctor passed
at work start. This does not qualify the unfinished preview QA, native runtime,
provider or release acceptance.
