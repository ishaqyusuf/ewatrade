# EwaTrade Telegram assistant UI plan

The Telegram Workshop will cover all 18 scenario families from the [WhatsApp Hybrid v42 baseline](https://workshop.localhost/ewatrade/assistant/whatsapp-system/directions/03?rev=a8810486-c7b7-454d-9f7b-375f9710d843), which contains 164 reference cases. Keep the reference case IDs where the user intent maps directly. Give Telegram-only cases their own IDs and record how each platform-specific case is adapted or deferred. Keep subsequent revisions under `ewatrade/assistant/telegram-system` and retain prior replays.

Use Claude Opus 5.5 (`claude-opus-5-5`) at explicit `high` effort for each design batch. Codex checks the current EwaTrade behavior, supplies the case brief, reviews the result and publishes it in Workshop. If Opus is unavailable, pause authoring and obtain explicit owner permission before using another author.

## Design direction

- Use a private Telegram bot chat with the EwaTrade avatar, bot subtitle, Telegram chat wallpaper, incoming and outgoing bubbles, timestamps, outgoing checkmarks, native **Start**, and the text composer. Follow the client's light and dark themes. Telegram owns the chat chrome. Use EwaTrade's account and workspace styles for the screens opened from chat. [Telegram chat appearance](https://telegram.org/blog/animated-backgrounds#ios-semi-transparency-new-app-icons)
- Use Telegram deep links for bot entry and inline URL buttons for authenticated EwaTrade destinations. Later batches can use command menus for navigation and inline callbacks for exact draft actions. Verify each against the Bot API and the current channel before treating it as supported. [Telegram bot features](https://core.telegram.org/bots/features) · [Bot API inline buttons](https://core.telegram.org/bots/api#inlinekeyboardbutton)
- Design Mini Apps only for later cases where the review or input genuinely needs a form. Treat them as a product proposal. If approved, inherit Telegram theme and viewport parameters and validate the launch data on the server. EwaTrade still owns account, scope and action authorization. [Telegram Mini Apps](https://core.telegram.org/bots/webapps)

## First batch · Scenarios 1 and 2

The [screen plan for scenarios 1 and 2](./2026-11-12-telegram-workshop-scenarios-1-2.md) sets out the Telegram features, kit styling, three directions, per-case states and copy for this batch.

Current Preview evidence establishes a signed-in link flow and two enabled customer capabilities. The Dashboard creates a five-minute, single-use link scoped to the current Business and Store. Telegram **Start** claims the link and shows a masked Telegram account ID. An authenticated EwaTrade session confirms the same mask and scope before the bot can access business data. [Telegram feature record](../../.brain/features/assistant-telegram.md) · [Account link implementation](../../apps/dashboard/src/components/assistant-telegram/connect-telegram.tsx) · [Telegram ingress](../../apps/api/src/assistant/telegram-runtime.ts)

| Case | Telegram design and expected result |
| --- | --- |
| **1a** `e-fast` | From EwaTrade, create the link, open the bot or scan the desktop QR, tap Start, compare the mask on both surfaces, confirm in EwaTrade and return to the private chat. |
| **1b** `e-diff` | A different Telegram account claims the link. Show its mask in both places. The merchant leaves the claim unapproved, creates a replacement and opens it in the correct Telegram account. |
| **1c** `e-expired` | Exercise expired and already-used variants. Both use neutral recovery and route to a new link. Any existing grant stays in place. |
| **2a** `o-hello` | First contact shows native Start. A plain Start or an unlinked greeting points to EwaTrade account settings with one primary action. |
| **2b** `o-one` | Continue through EwaTrade sign-in to the one eligible Business and Store, then reuse the 1a confirmation path. |
| **2c** `o-many` | Select Business and Store in signed-in EwaTrade before creating the link. The selected scope appears at confirmation, and the unlinked chat receives no workspace list. |
| **2d** `o-none` | After sign-in, show the no-eligible-Business-or-Store state in EwaTrade. The private chat keeps the same generic entry message. |
| **2e** `o-unknown` | Show the same neutral entry message. Any sign-in result stays inside EwaTrade. The bot collects no email, password or verification code and reveals no account status. |

The current bot responds to a bare `/start` with account-settings instructions, replies to successful claims with the masked ID, and silently drops invalid link claims and ordinary unlinked text. The prototype proposes an inline URL button on the entry and claim messages, a neutral greeting for unlinked text, and neutral invalid-link recovery copy. The mismatch recovery uses EwaTrade's existing ability to create a fresh scoped link. The app-side sign-in and scope screens show the handoff in context. Once linked, use a supported command such as `/scope` to demonstrate access with a user-initiated reply. [Link and authority source](../../packages/db/src/queries/assistant-telegram/link.ts) · [Telegram ingress](../../apps/api/src/assistant/telegram-runtime.ts)

## Sequencing

Owner instruction, 12 November 2026: finish every design batch before starting implementation. The owner selected 02 · Telegram-native for batch 1, and later batches extend that direction only.

## Batch 2 · Families 3–6 (published)

Published 12 November 2026 as 02 · Telegram-native v2, revision `41fb3d27-d0eb-456e-8c61-c2e89e5d4a29`. It contains 16 new cases. The selection stays on v1 (`a1d386e1`) until the owner reviews v2.

| WhatsApp case | Telegram |
| --- | --- |
| `v-stale`, `v-session` | Designed. When someone confirms after the 5-minute link has expired, or taps an old Open EwaTrade button, EwaTrade says the link expired and the bot edits the claim message to the same text. Expiry is applied on the next touch, so it needs no scheduled job. |
| `v-email`, `v-wrong`, `v-expired`, `v-cool`, `v-locked`, `v-nomail`, `v-sendfail` | Adapted. These belong to EwaTrade's existing sign-in in Telegram's in-app browser. The bot is not involved. |
| `v-old` | Covered by 1c. An older link gets the same neutral stale-link reply. |
| `c-return`, `c-help`, `c-register`, `c-addbiz` | Designed. The connected chat keeps the pinned scope and the linked command menu. `/help` lists tappable commands, and `/start` while connected confirms the scope without changing it. Adding a business hands off to EwaTrade. |
| `c-switch` | Designed. `/scope` → **Change in EwaTrade** → choose the Store → new link → START → confirm. The claim message is edited to the new scope, and the pin is replaced. |
| `c-second` | Designed. A second EwaTrade account tries to connect a Telegram account that is already connected. The bot and EwaTrade both say nothing changed and point to `/disconnect`. |
| `c-addbiz-n` | Deferred to batch 6 (forms and Mini Apps). |
| `r-full` | Designed. Sign-up happens in EwaTrade (Create your store → email code → workspace), followed by the normal connection. |
| `r-dup`, `r-under13`, `r-cancel`, `r-resume`, `r-lapsed` | Adapted. EwaTrade's existing sign-up rules apply. The bot keeps its unlinked reply. |
| `a-cashier`, `a-cashier-menu`, `a-mgr`, `a-other` | Designed. Refusals use the WhatsApp copy. `/help` lists only what the role can use. Questions about another Store or business get a **Change Store** or **Change in EwaTrade** button. |
| `a-lost`, `a-expired` | Designed. The pinned Connected message is edited to Disconnected and unpinned, the menu returns to the unlinked commands, and the next message explains what happened, with an EwaTrade button. |
| `a-role` | Designed. Confirm shows Telegram's callback toast “Not saved”, clears the review buttons and replies with the WhatsApp refusal copy. |

## Batch 3 · Families 7–8 (published)

Published 12 November 2026 as 02 · Telegram-native v3, revision `f2ede755-8c49-4a13-8cf2-8b9c668e287b`. It adds 19 cases. Comparison, 01 and 03 were republished at the same time (`ccb8c814`, `a73c2f90`, `7ba9c980`), with no design change, because every Preview panel dropdown now has ‹ › chevrons.

| WhatsApp case | Telegram |
| --- | --- |
| `l-chats`, `l-new` | `/chats` and `/new` join the connected command menu. `/chats` lists saved chats in one inline keyboard, which WhatsApp's three-button limit did not allow. Choosing a chat edits the list to show the chat being continued, so its buttons cannot be reused. |
| `l-long`, `rd-products` | Shows the first three items and **View full response**, which opens the same saved answer in EwaTrade in Telegram's browser. |
| `rd-open` | **‹ Previous / Next ›** callback buttons edit the same message in place, ten rows a page. This is the alternative to the full-response handoff. |
| `l-ambig` | Two Chinedus appear as buttons. The choice edits the question to “Which Chinedu? Chinedu Eze ✓”. |
| `l-correct` | The user sends the correction as a Telegram reply to the answer, and the bot answers for yesterday. |
| `rd-item` | **Recent moves** opens an expandable blockquote. Callback buttons never post a user message. |
| `rd-search`, `rd-price`, `rd-low`, `rd-today`, `rd-debts`, `rd-sup`, `rd-bal`, `rd-svc`, `rd-count` | Use the WhatsApp Hybrid content. The scope footer is dropped because the pinned message already shows it, and “as of” stays for live figures. Follow-ups are callback buttons, and app handoffs are URL buttons. |
| `rd-staff`, `rd-rep` | Hand off to EwaTrade, as in WhatsApp. |

## Batches 4–6 · Families 9–18 (published)

Published 12 November 2026 as 02 · Telegram-native v4, revision `a722c2e1-5caf-4a09-b15a-9be57383a590`. It was designed in three parallel sessions and integrated here. It adds 116 cases, and every one of the 18 WhatsApp families is now mapped: 159 cases in total, with all 175 case runs passing QA. The per-case mapping, the proposals and the unverified points are in [batches 4–6 mapping](./2026-11-12-telegram-workshop-batches-4-6.md).

| Batch | Families | Cases | Main Telegram pieces |
| --- | --- | --- | --- |
| 4 | 9 Writes · 10 Setup, products, import | 31 | Canonical Confirm / Edit / Cancel reviews. Decided reviews are edited to show a status line. Receipts reply to the review. Double taps and uncertain saves return the same receipt. Missing facts are grouped. Setup and imports hand off to EwaTrade. |
| 5 | 11 Files and photos · 12 Voice notes · 13 Continue in the app | 41 | Photo, document, album and voice bubbles with upload states. Transcript review. Header chat actions. The EwaTrade review handoff edits the same message into the receipt or a new link. Today the bot answers no media. |
| 6 | 14 Control · 15 Safety · 16 Forms · 17 Formatting · 18 Payment links | 44 | Disconnect asks first. Stop bot and RESTART. Outage retries are edited in place. Password messages are deleted. Forwarded reviews are refused. Pidgin replies. A Mini App compared with native buttons for the six forms. A Telegram HTML formatter. Payment links with `copy_text`. |

## Implementation

On 12 November 2026 the owner selected 02 v4 (`a722c2e1`) and said "Start implementation". The work goes in six phases, in family order:

| Phase | Families | Status |
| --- | --- | --- |
| 1 · Linking and first contact | 1–3 | **Done locally**, commit `9fbe45403`, Workshop implementation recorded. Not deployed. BotFather description and default commands are pending a release-time provider action. |
| 2 · Connected entry, roles, access ending | 4–6 | **Done locally**, commits `0b79ef8b0`, `cba80271d`, `756daa72f`, `f9360ccd5`, `9f395074a`, `5c6398dd9` and `21b9e9f55`. Workshop implementation recorded. Role-aware /help, /scope with Change in EwaTrade, Switch Store pin swap, the c-second busy state, lazy a-lost and a-expired, and the a-role refusal. Pending: Change Store buttons on model refusals (a-cashier, a-mgr, a-other) need a structured signal; the a-role toast is answered before the turn. The c-second hand-over (owner chose detach, don't delete) is done in `2f8955e64`, `1f7252caf` and `333360660`: once the first EwaTrade user's access has ended (`/disconnect`, revoked or expired), a second user's confirmed link re-keys the old identity to `detached:<id>` and keeps its history; while that access is live it stays busy. Not deployed. |
| 3 · Telegram HTML renderer, chats and reads | 7–8, 17 | **Done locally**, commits `9cce23b44`, `b4b3fbba7`, `ede88ec7d`, `a69185b61`, `dfd8284a4`, `5a0a836ae` and `938ed3c9f`. Not deployed. Replies and receipts are Telegram HTML (escaped, `<code>` exact values, no scope footer, "as of" kept, expandable quotes within 4096 characters, URL buttons). `/new` and `/chats` switch the saved General chat, with the list edited in place. Long reads show the first three rows and **View full response**. `l-ambig` choices are buttons edited after the pick. Pending: ‹ Previous / Next › paging (`rd-open`), read follow-up buttons, the draft follow-up after continuing a chat, `fmt-menu`, `fmt-account`, and HTML review bodies (`fmt-draft`, `fmt-literal`, with phase 4). |
| 4 · Review status lines and receipts | 9–10 | **Done locally**, commits `31e552258`, `1187b5ef5`, `3cb5f1811`. Telegram review layout (Draft N, local expiry), decided reviews edited in place with a status line, receipts as replies, tap-only toasts, Review it again. Pending: Replaced by draft N, Check status, account picker, native receive/payment/price reviews, multi-product and setup drafts. Not deployed. |
| 5 · Media and EwaTrade handoff | 11–13 | **Done locally**, commits `94b875bc1` and `d83cc66f9`. Not deployed. Photos, files, albums, videos and voice notes get a text-only reply that quotes them (`f-today`, `v-today`), one per album. Approve, cancel or edit in EwaTrade edits the Telegram review-link message (`x-review`, `x-link-cancel`, `x-link-edited`, `x-link-used`). Uploads, attaching, transcription, the voice budget and length limit, PDF receipts and expired-link edits are pending owner decisions 4 and 5. |
| 6 · Control, safety, Mini App forms, payment links | 14–16, 18 | **Done locally**, commits `ebaa9b7c8`, `69cf41317`, `53343edc2`, `68f92c2bf`, `57f96892c`. `/disconnect` asks first, Stop bot revokes, passwords are deleted, forwarded reviews refused, typed cancel explained. Pending: Try again on outages, message limit, support screen, the Stop bot welcome-back reply, Pidgin (model). Mini App forms: only the `initData` check exists, not wired. Payment links stay gated. Not deployed. |

## Open owner decisions

Collected from every batch. None of these blocks the design review.

1. **First contact:** should the bot delete the user's `/start` message after handling it? Telegram requires START once per chat.
2. **Receipts:** should a receipt reply to the review, as designed, or be edited onto the review?
3. **Money writes:** should expense, money in and transfer stay Owner or Admin only in Telegram, as in WhatsApp?
4. **Media:** should the text-only reply to photos and voice notes ship first? Today they get no answer. What length limit should voice notes have? Should receipts be sent as PDFs in chat?
5. **Expired links:** should the bot edit an expired review link to “Get a new link” itself? That needs a job, so check it against the Trigger.dev budget.
6. **Control:** should `/disconnect` ask first? Should a typed “cancel” cancel the only open draft?
7. **Forms:** should the Mini App be the default for sale, expense and receive stock, with chat buttons for customer and product?
8. **Language and sharing:** which reply languages should be supported, with reviews kept in English? Is a Telegram share option needed beyond **Copy message** and **Open WhatsApp**?

## Review and acceptance

- Each batch includes an interactive replay for every in-scope case, including recovery. Use synthetic identities and local transitions. Keep case IDs stable and distinguish current behavior, proposed behavior and capabilities awaiting release in the review record.
- For batch 1, verify the matching-account flow, mismatch and stale-link recovery, workspace choice and the identical unlinked copy for known and unknown accounts. Check the shared Workshop panel, a state and scenario switch, theme, mobile size, and preference retention after navigation.
- Review the exact Workshop revision before authorizing implementation. For later product acceptance, reuse the existing Preview link evidence and verify changed behavior in actual Telegram against the candidate, including privacy and scope checks for any new entry handling.
