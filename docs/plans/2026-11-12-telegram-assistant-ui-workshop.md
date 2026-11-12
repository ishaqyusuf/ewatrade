# EwaTrade Telegram assistant UI plan

The Telegram Workshop will cover all 18 scenario families from the [WhatsApp Hybrid v42 baseline](https://workshop.localhost/ewatrade/assistant/whatsapp-system/directions/03?rev=a8810486-c7b7-454d-9f7b-375f9710d843), which contains 164 reference cases. Keep the reference case IDs where the user intent maps directly. Give Telegram-only cases their own IDs and record how each platform-specific case is adapted or deferred. Keep subsequent revisions under `ewatrade/assistant/telegram-system` and retain prior replays.

Use Claude Opus 5.5 (`claude-opus-5-5`) at explicit `high` effort for each design batch. Codex checks the current EwaTrade behavior, supplies the case brief, reviews the result and publishes it in Workshop. If Opus is unavailable, pause authoring and obtain explicit owner permission before using another author.

## Design direction

- Use a private Telegram bot chat with the EwaTrade avatar, bot subtitle, Telegram chat wallpaper, incoming and outgoing bubbles, timestamps, outgoing checkmarks, native **Start**, and the text composer. Follow the client's light and dark themes. Telegram owns the chat chrome. Use EwaTrade's account and workspace styles for the screens opened from chat. [Telegram chat appearance](https://telegram.org/blog/animated-backgrounds#ios-semi-transparency-new-app-icons)
- Use Telegram deep links for bot entry and inline URL buttons for authenticated EwaTrade destinations. Later batches can use command menus for navigation and inline callbacks for exact draft actions. Verify each against the Bot API and the current channel before treating it as supported. [Telegram bot features](https://core.telegram.org/bots/features) · [Bot API inline buttons](https://core.telegram.org/bots/api#inlinekeyboardbutton)
- Design Mini Apps only for later cases where the review or input genuinely needs a form. Treat them as a product proposal. If approved, inherit Telegram theme and viewport parameters and validate the launch data on the server. EwaTrade still owns account, scope and action authorization. [Telegram Mini Apps](https://core.telegram.org/bots/webapps)

## First batch · Scenarios 1 and 2

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

## Remaining batches

| Batch | Scenario families | Telegram design questions |
| --- | --- | --- |
| 2 | 3–6 · Verification problems, returning users, new accounts, roles and scope | Keep login recovery and sign-up in EwaTrade. Cover linked commands, workspace changes, access removal and role refusals. |
| 3 | 7–8 · Saved chats, long answers and reads | Show how Telegram chat continues, how compact results open the exact saved answer and where paging belongs. Map only released reads to the current baseline. |
| 4 | 9–10 · Writes, setup and imports | Design callback buttons for exact draft review, corrections and receipt replay. Route complex forms and setup to authenticated EwaTrade. |
| 5 | 11–13 · Files, voice and continuation links | Map media handling and retry states. Separate currently supported text from proposed uploads and transcription. Design saved answer and review handoff. |
| 6 | 14–18 · Recovery, safety, forms, formatting and payment links | Cover disconnect, stale actions and outages. Compare native buttons with Mini Apps where the form calls for it. Keep money effects behind the existing canonical review and label unsupported cases as proposals. |

## Review and acceptance

- Each batch includes an interactive replay for every in-scope case, including recovery. Use synthetic identities and local transitions. Keep case IDs stable and distinguish current behavior, proposed behavior and capabilities awaiting release in the review record.
- For batch 1, verify the matching-account flow, mismatch and stale-link recovery, workspace choice and the identical unlinked copy for known and unknown accounts. Check the shared Workshop panel, a state and scenario switch, theme, mobile size, and preference retention after navigation.
- Review the exact Workshop revision before authorizing implementation. For later product acceptance, reuse the existing Preview link evidence and verify changed behavior in actual Telegram against the candidate, including privacy and scope checks for any new entry handling.
