# Telegram Workshop · batches 4–6 mapping

These batches cover WhatsApp families 9–18 in [Workshop 02 · Telegram-native v4](https://workshop.localhost/ewatrade/assistant/telegram-system/directions/02), revision `a722c2e1-5caf-4a09-b15a-9be57383a590`. They were designed on 12 November 2026 by Claude Opus 5.5 at high effort, in three parallel sessions, then integrated and published once. They contain 116 cases. With all three batches' extensions loaded, the full workshop has 159 cases, and all 175 case runs pass the QA loop.

Each section below is that batch session's mapping record, copied from the Workshop source notes (`workshop/work/ewatrade/assistant/telegram-system/notes/`). Behaviour marked as a proposal is not in the product.


## Batch 4 · Writes (family 9) and Setup, products, import (family 10)

Direction 02 · Telegram-native only. Files: `common/data-4.js`, `common/tg-4.css` (`common/ext-4.js` is unchanged; no engine primitive was needed). 31 Telegram cases: 26 in family 9 (4 of them Telegram-only `t-` cases) and 5 in family 10. QA loop: 31/31 `ok`, and 90/90 across the whole dev build.

### Case mapping

All 28 WhatsApp cases in families 9–10 are mapped. All of them are designed; none are deferred.

| WhatsApp case | Telegram case | Treatment |
| --- | --- | --- |
| w-sale · Record a sale | `w-sale` | Designed. Full-sentence sale goes straight to the canonical review with Confirm / Edit / Cancel. Confirm shows a toast, clears the keyboard, adds "✓ Confirmed" to the review, and the receipt replies to the review. View receipt opens the sale in the in-app browser. |
| w-sale-dup · Confirm tapped twice | `w-sale-dup` | Designed. The second tap arrives before the keyboard clears. It gets an "Already saved as S-1042" toast and the same receipt (S-1042), saying nothing was saved twice. |
| w-sale-unknown · Save result uncertain | `w-sale-unknown` | Designed. The review shows "Checking the save…". The reply says not to record again and offers Check status. The check edits that reply in place into the receipt ("saved once"). |
| w-sale-stale · Money account changed before confirm | `w-sale-stale` | Designed. Confirm is refused. The review is dimmed with "Not saved · account closed", and a reply asks where the money went. Picking an account opens draft 2 with the changed fact highlighted, then Confirm leads to the receipt. |
| w-cust · Add a customer | `w-cust` | Designed (one message → review → receipt). |
| w-custupd · Update a customer | `w-custupd` | Designed. The old value is struck through and the new one is bold. |
| w-prod · Add a product | `w-prod` | Designed. The receipt has "Add photo in EwaTrade", which opens the product page. |
| w-exp · Record an expense (Owner/Admin) | `w-exp` | Designed. The review says it records only and doesn't move money. |
| w-in · Record money in (Owner/Admin) | `w-in` | Designed. |
| w-tr · Record a transfer (Owner/Admin) | `w-tr` | Designed. |
| w-recv · Receive stock (proposed native) | `w-recv` | Designed as a **proposal**: an in-chat canonical review. Today this action is an app review. |
| w-recv-today · Receive stock, draft reviewed through a link | `w-recv-today` | Adapted to EwaTrade. A URL button opens the saved draft in the in-app browser, where it is approved. Back in Telegram, the draft message gets "✓ Approved in EwaTrade" and a reply carries the result. |
| w-pay · Record payment on an order (proposed native) | `w-pay` | Designed as a **proposal**. Grouped missing facts are answered as a reply quote, then the canonical review and the receipt. |
| w-price · Change a price (proposed native) | `w-price` | Designed as a **proposal**. |
| w-count · Stock count (app continuation) | `w-count` | Adapted to EwaTrade. Hand-off via URL button to the count page. |
| batch-burst · Short message burst | `batch-burst` | Designed. Three quick messages get one review. |
| batch-register · Registration checklist | covered by `r-full` (family 5, batch 2) | Covered by another case. Account creation stays in signed-in EwaTrade per the brief, so no in-chat registration checklist. |
| batch-product · Product, basic and optional details together | `batch-product` | Designed. The checklist keeps optional details in a collapsed expandable quote. "Only what's missing" leads to one review. |
| batch-customer · Optional contact never blocks | `batch-customer` | Designed. A name only is enough for the review → receipt. |
| batch-sale · All missing payment facts together | `batch-sale` | Designed. "Which Chinedu?" is answered by an inline keyboard, edited in place. Then one grouped question, answered as a reply, leads to one review. |
| batch-expense · Paid status and account together | `batch-expense` | Designed, Telegram-native. One inline keyboard answers both facts in a single tap ("Paid · Cash till (Yaba)"). |
| batch-stock · Optional cost, same review | `batch-stock` | Adapted to EwaTrade. No cost is assumed, and the app review shows "Cost: Not provided". |
| batch-finance · One transfer checklist | `batch-finance` | Designed. |
| p-today · Add many products today (app) | `p-today` | Adapted to EwaTrade. Hand-off to the products page, with an "Add one product here" fallback button. |
| p-native · Add many products, native drafts (proposed) | `p-native` | Designed as a **proposal**. Up to 3 lines get one canonical review covering all three, then the receipt. |
| p-biz-today · Business setup today (app) | `p-biz-today` | Adapted to EwaTrade. Hand-off to the setup page. |
| p-biz · Business setup interview (proposed) | `p-biz` | Designed as a **proposal**, Telegram-native. One message of multi-select toggles (Products, Services, Cash, Transfer, Customers can pay later; each tap adds ✓ in place) replaces three questions, then the canonical review. |
| p-import · Spreadsheet import (review in app) | `p-import` | Adapted to EwaTrade. The document bubble goes to row review in the in-app browser. On return, the bot message gets "✓ Imported in EwaTrade" and the result replies to it. |
| — | `t-sale-edit` | Telegram-only. Edit → "What would you like to change in this draft?" (the product's exact text) → a typed reply leads to draft 2. The old review is dimmed with "Replaced by draft 2 ↓" and changed facts are highlighted. |
| — | `t-sale-cancel` | Telegram-only. Cancel edits the review in place: dimmed, "Cancelled · nothing was saved". |
| — | `t-review-expired` | Telegram-only. A stale Confirm on an expired review. The toast plus a status line on the review say it expired, then "Review it again" leads to a fresh draft 2 → receipt. |
| — | `t-sale-credit` | Telegram-only split of the WhatsApp `w.sale.review.credit` state. With nothing paid, it becomes an order with a balance that is reviewed in EwaTrade. |

### Telegram features used

- Inline callback keyboards: Confirm / Edit / Cancel in one row with the product's exact labels; choice lists (customer, account); one-tap combined answers; toggle buttons with ✓ that edit the message in place (`p-biz`).
- Edit in place: spent keyboards removed; decided reviews keep their facts plus one status line (Confirmed, Cancelled, Expired, Replaced by draft N, Not saved); the uncertain-save message turns into the receipt; choice questions show the picked answer.
- Callback toasts (answerCallbackQuery): Saving…, Cancelled, Send your change, Already saved as S-1042, This review expired, Not saved, Checked.
- Reply quotes: receipts and follow-ups quote the review they belong to; the user answers grouped questions as a reply.
- Expandable blockquote for optional product details; muted hint lines for examples.
- URL buttons to Telegram's in-app browser for EwaTrade review, receipt, count, products, setup and import pages.
- Document bubble for the sent spreadsheet (`.t4-doc`, own style in `tg-4.css`).
- Pinned scope and command menu inherited from the connected chat. No WhatsApp scope footer.

### Review body

The review follows the product's body order (`renderWhatsAppActionReviewBody`): title, Business, Store, draft revision, facts, then expiry. Three presentation changes are design proposals:
- "Draft 1" instead of "Draft revision: 1".
- Expiry in local time ("Review expires: 9:50 AM") instead of an ISO UTC timestamp.
- A blank line between the header block and the facts, instead of a blank line between every fact.

Expiry times in the scenes are 5 minutes after the review, matching the runtime's `+5 min` cap.

### Proposals (not in the product today)

- Toast text. The product answers callbacks with no text (`answerCallbackQuery(callbackId)`).
- Editing a decided review to add a status line. Today the product only clears its keyboard.
- Receipts as a reply quote to the review. Today the receipt is a new, unquoted message.
- The second-tap toast plus a quoted "Already saved" receipt. Today a repeated tap re-sends the result text.
- The uncertain-save "Checking…" message and the Check status button.
- Account-closed recovery with an account picker that leads to draft 2.
- "Review it again" after an expired review. Today the product says "This review has expired or changed. Ask me for the current draft." Expired reviews are only marked when tapped, so there is no timer job, in line with the Trigger.dev cost budget.
- Native in-chat review for receive stock, order payment and price change (`w-recv`, `w-pay`, `w-price`). These are app reviews today.
- Multi-product drafts in chat (`p-native`), the setup toggle message (`p-biz`), and spreadsheet intake in Telegram (`p-import`). Telegram document intake belongs to batch 5's file handling.
- Updating the Telegram draft message after approval or import in EwaTrade (`w-recv-today`, `p-import`), and the reply that carries the result.
- The EwaTrade pages (receipt, order review, stock review, count, products, product, setup, import) are illustrative layouts, not the current dashboard screens.

### Not verified

- Whether Telegram's in-app browser keeps the EwaTrade session for the review links (assumed signed in, as in batches 1–3).
- Whether the product can quote the review message (`reply_parameters`) when the receipt is sent from the callback worker.
- Real timing of the double-tap window before the keyboard clear lands.

### Open questions for the owner

1. Receipt placement: reply to the review (designed) or edit the receipt onto the review itself? Replying keeps the exact approved facts readable next to the receipt.
2. Should money write reviews (expense, money in, transfer) stay Owner/Admin only in Telegram, as in WhatsApp? Batch 4 assumes yes and shows the Owner.

## Batch 5 · families 11–13 (files and photos, voice notes, continue in the app)

Direction 02 · Telegram-native only. Files: `common/data-5.js`, `common/ext-5.js`, `common/tg-5.css`.
41 designed cases: 12 in family 11, 8 in family 12, 21 in family 13. All 41 pass the QA loop (`02 <id> ok`, no stuck steps, no console errors). Checked visually in light and dark.

### What the bot handles today

Checked in `packages/communications/src/telegram.ts` (`parseAssistantTelegramUpdate`) and `apps/api/src/assistant/telegram-runtime.ts`:

- The bot accepts only private-chat **text** messages and **callback queries**. A photo, document, voice note, album or video has no `message.text` (a photo caption is `caption`, not `text`), so the parser returns `null` and the bot **replies with nothing**. No file is downloaded; there is no `getFile` call.
- Outgoing methods are `sendMessage`, `sendChatAction` (only `typing`), `answerCallbackQuery` and `editMessageReplyMarkup`. There is no `editMessageText`, `sendDocument` or `sendPhoto` yet.
- A draft that needs a review is sent today as **“Review this saved draft in EwaTrade.”** with one URL button, **Review in EwaTrade** (`savedChat(...).link` plus `proposalId`). So the basic family 13 handoff exists today. The receipt edited back into Telegram, the refreshed link and the expired-link edits are proposals.

So every family 11 and 12 behaviour beyond “text only” is a proposal: uploads, attaching, transcription, size and type checks, and the bot sending files.

### Mapping

| WhatsApp case | Telegram case | Treatment |
| --- | --- | --- |
| **11 · Files and photos** | | |
| f-today · Photo sent · today | `f-today` | Designed. First state shows today's real behaviour (no reply). Next state is the proposed text-only reply quoting the photo, with **Open chat in EwaTrade**, which opens the same chat in the in-app browser. |
| f-photo · Attach a receipt photo | `f-photo` | Designed (proposed). Upload with progress ring and clock, then a reply quoting the photo: “I keep it as the original — I don't read what's in it.” Attach / Other order / Discard act as Confirm / Edit / Cancel on that exact action. The same message becomes “Photo attached ✓” with a callback toast and **View order**. |
| f-photo · Other order (state) | `t-f-pick` | Designed. The same message changes in place to an order list with ‹ Back. |
| f-photo · Discard (`f.photo.no`) | `t-f-discard` | Designed. Edit in place and a toast; nothing saved. |
| f-bad · Unsupported file type | `f-bad` | Designed (proposed). A ZIP file card, then a type refusal quoting the file. |
| f-big · File too large | `f-big` | Adapted. A 38 MB XLSX card. The refusal names the real 20 MB limit for bot downloads (Bot API `getFile`) and hands off to **Upload in EwaTrade** (import page). |
| f-late · Choosing after the file expired | `f-late` | Designed (proposed). Yesterday's question is tapped today. The callback edits the message to say the photo is gone; nothing is saved. |
| — | `t-f-resend` | Telegram-only. The phone fails to upload (red badge). Tap the badge, choose **RESEND** in Telegram's dialog, upload again, then the bot replies. This is Telegram client behaviour; the bot sees nothing until the upload succeeds. |
| — | `t-f-fetch` | Telegram-only (proposed). The bot couldn't download the file; **Try again** shows a toast and edits the same message into the attach question. |
| — | `t-f-pdf` | Telegram-only (proposed). A supplier invoice PDF with a caption, attached to purchase P-221. Shows the document card while sending and after it is sent. |
| — | `t-f-album` | Telegram-only (proposed). Three photos sent together arrive as separate updates with one `media_group_id`; the bot waits and asks once. |
| — | `t-f-receipt` | Telegram-only (proposed). The bot sends receipt S-1042 as a PDF. The header shows the **sending file** chat action (`upload_document`). |
| **12 · Voice notes** | | |
| v-today · Voice note · today | `v-today` | Adapted. First state is today's real behaviour (no reply), then a text-only reply asking the user to type. I dropped WhatsApp's “open chat in app to attach” because voice notes in the EwaTrade chat are not confirmed. |
| v-review · Voice → check text → sale | `v-review` | Designed (proposed). A voice bubble with waveform, duration and unplayed dot. The reply quotes the voice note and shows the transcript as a blockquote with Use this / Edit text / Cancel. **Use this** marks the message “Used ✓” and sends the exact sale review (Confirm sale / Edit / Cancel). Confirm edits the review into “Sale S-1042 saved ✓” with a toast. |
| v-review · Edited (state) | `t-v-edit` | Designed. **Edit text** asks for the corrected text as a reply; the user's reply quotes that message and leads to the same sale review. |
| v-review · Cancel (`v.cancel`) | `t-v-cancel` | Designed. Edit in place and a toast. |
| v-fail · Not understood | `v-fail` | Designed (proposed). |
| v-budget · Paused for today | `v-budget` | Designed (proposed). |
| — | `t-v-retry` | Telegram-only (proposed). Transcription failed; **Try again** edits the same message into “Here's what I heard”. |
| — | `t-v-long` | Telegram-only (proposed). A length refusal for a 3:48 voice note. The 1-minute limit is a placeholder for the owner to decide. |
| **13 · Continue in the app** | | |
| x-review · Open the exact draft, approve, receipt | `x-review` | Designed. **Review in EwaTrade** opens the focused review in Telegram's in-app browser. Approve shows the saved page; closing the browser (×) returns to the chat, where the **same message** is now the receipt with its button removed. |
| x-signin · Sign in, back to the same review | `x-signin` | Designed. The sign-in and code happen on the EwaTrade page, never in the chat. |
| x-switch · App on another workspace | `x-switch` | Designed. No draft details are shown. |
| x-big · Large table or report goes to the app | — | Covered by batch 3 `rd-rep` (the same `r.reports` reply) and `l-long` / `rd-products` for long lists. |
| x-link-product · Rich product draft (Eggs) | `x-link-product` | Designed. The crate and carton questions are edited in place as they are answered. The typed correction (sent as a reply) retires revision 1 by editing its message and removing its button, then sends revision 2 with a new link. Approve edits revision 2 into “Product added ✓”. |
| x-link-expired | `x-link-expired` | Designed. Tapping after 16 minutes shows the expired page. Back in the chat, the same message offers **Get a new link** / **Cancel draft**; the new link is edited in with a toast. Proposal: the bot could make this edit itself when the link expires, so the old button is never shown. |
| x-link-used · Opened again after approval | `x-link-used` | Designed. The chat no longer has the button (it was removed by the receipt edit). The last state is the old link reopened from browser history, which shows “no longer active”. |
| x-link-cancel | `x-link-cancel` | Designed. Cancelling on the page edits the chat message to “Draft cancelled in EwaTrade. Nothing was saved.” |
| x-link-edited | `x-link-edited` | Designed. Saving an edit moves the page to the new link and edits the **same** Telegram message to the new link, so the chat has no stale button. The old link reopened from history shows “changed”. Then approve on the new link and get the receipt. |
| x-link-access · Wrong account or access removed | `x-link-access` | Designed. Both reasons show the same page; no details are revealed. |
| x-link-uncertain · Couldn't verify | `x-link-uncertain` | Designed. Couldn't verify → Check status → “no longer active”. In the chat, the button is removed and the message says it is checking. A minute later a **new** message with the delayed result arrives (so it notifies), and the old message drops the “checking” line. |
| fca-product-draft-first | `fca-product-draft-first` | Designed. The editable 30-egg default, then the exact correction to 24. The chat message is edited to the updated draft with a new link. |
| fca-taxonomy | `fca-taxonomy` | Designed. A category suggestion; nothing invented. |
| fca-order-continuation | `fca-order-continuation` | Designed. One kept order draft, then the order-only item. The catalog path (`Add to catalog`) is shown as a button only. |
| fca-service-partial | `fca-service-partial` | Designed. Known work is filled in and the socks price is blank. I removed the per-item prices that WhatsApp never stated. |
| x-response-web · Web fallback | `x-response-web` | Adapted. In Telegram, every link already opens the web page in the in-app browser, so there is no separate web fallback. The saved answer (batch 3 `answer` screen) leads to **Continue in EwaTrade**, the same chat with a follow-up. |
| x-response-signin | `x-response-signin` | Designed. |
| x-response-scope | `x-response-scope` | Designed with the explicit switch. **Stay here** is shown as a button but not designed as a separate state. |
| x-response-access | `x-response-access` | Designed. |
| x-response-unavailable | `x-response-unavailable` | Designed. **Open assistant** opens an empty chat; nothing is regenerated. |
| x-response-short | `x-response-short` | Designed. Every match is in the chat; the link is kept, as in WhatsApp. |
| x-response-empty | `x-response-empty` | Designed. A complete reply with no link. |

### Telegram features used

- Media bubbles (in `ext-5.js` as `window.TG5`): photo with caption, album grid, document card (type colour, name, size and type), voice note (play button, waveform, duration, unplayed dot). All drawn in SVG and CSS, with no image files.
- Upload states on outgoing media: progress ring and clock while sending, red badge when not sent, and Telegram's **Message not sent · RESEND** dialog.
- Reply quotes of the user's media at the top of bot replies, with a thumbnail or icon (`reply_parameters`).
- Header chat actions: `typing` while reading or transcribing, and **sending file** when the bot uploads a document. The new `act` op shows any label until the next bot message.
- Edit in place for every follow-up on the same decision, with callback toasts. Spent buttons are removed when a draft settles.
- Blockquote for the transcript.
- Telegram's in-app browser for every EwaTrade page. The user returns with × instead of a “Back to Telegram” button.

Engine additions are wrappers in `ext-5.js` (`apply`, `tg`, `msg`) with three new ops: `act`, `out … mid/st` and `mst`. Batch-owned message ids use an `x5` prefix because the engine already gives date separators the ids `d1`, `d2`, …

### Proposals (not built)

- Accepting photos, documents, albums and voice notes, which needs parser and inbox support, `getFile` downloads, storage and retention. The “short hold until you choose” in `f-late` also needs a retention rule.
- Transcription, its daily budget (`v-budget`), the retry state and a length limit (1 minute is a placeholder).
- Attaching files to orders and purchases, and any attachment display in EwaTrade order and purchase pages.
- Bot-sent documents (`t-f-receipt`), which needs `sendDocument`, a receipt PDF and the `upload_document` chat action.
- `editMessageText` for every in-place edit: the receipt on the review message, the new link on the same message, and expiry edits. Today the runtime only edits reply markup.
- A text-only reply for media (`f-today`, `v-today`). This is the smallest change and could ship first.

### Not verified

- Whether the EwaTrade assistant chat accepts attachments or voice. The `f-today` handoff page shows an attach clip as WhatsApp's copy implies.
- Whether EwaTrade sessions carry into Telegram Android's in-app browser. It depends on the user's setting (in-app browser or Chrome Custom Tabs), which is why `x-signin` and `x-response-signin` exist.
- The 20 MB download limit applies to the hosted Bot API. A local Bot API server raises it, but the runtime calls `api.telegram.org`.

### Open questions for the owner

1. Should the text-only media reply (`f-today` / `v-today`) ship before the rest? Today these messages get no answer at all.
2. Should the bot edit an expired review link into **Get a new link** on its own, without waiting for a tap?
3. What length limit, if any, should voice notes have?
4. Is a PDF receipt sent in the chat (`t-f-receipt`) wanted, or should receipts stay as links?

## Batch 6 · Families 14–18 in 02 · Telegram-native

Families: 14 · Control and recovery, 15 · Safety and language, 16 · Forms (proposed), 17 · Message formatting and 18 · Payment links (planned).

Files: `common/data-6.js`, `common/ext-6.js` and `common/tg-6.css`. Built with `python3 build.py --dev 6`. All cases are `dirs: ["02"]`.

**Result:** all 46 WhatsApp cases in families 14–18 are mapped. There are 44 Telegram cases: 43 keep their WhatsApp ID and 1 is new (`t-lang`). Every case passed the QA loop (`02 <id> ok`, 44/44).

### Consistency with batch 4

Drafts use the same canonical review body as batch 4 and the product: title, Business, Store, `Draft N`, facts, an optional italic note and `Review expires: …`. All three actions are in one row: **Confirm · Edit · Cancel**. After a decision the review keeps its facts. The keyboard is removed and a status line is added (`✓ Confirmed`, `Cancelled · nothing was saved`, `Replaced by draft 2 ↓`, `Expired · nothing was saved`). The receipt is a reply that quotes `<title> · draft N`. My status-line classes are `t6-st` and `t6-old`. They copy batch 4's `t4-st` and `t4-old`, so either set can be kept when merging.

Batch 4 already designs three cases that overlap these families. I did not duplicate them:
- `t-review-expired` (9g): Confirm tapped on an expired review.
- `w-sale-unknown` (9c): the save result is uncertain, with a Check status button.
- `w-sale-dup` (9b): Confirm tapped twice, which returns the same receipt.

### Mapping

#### 14 · Control and recovery

| WhatsApp case | Telegram case | Treatment |
| --- | --- | --- |
| `k-cancel` | `k-cancel` | Designed. Typing “cancel” with no draft says there is nothing to cancel, confirms the scope and points to a tappable `/disconnect`. **Proposed copy:** today the product answers any typed cancel or confirm with “Use the buttons on the exact draft review…”. |
| `k-cancel-draft` | `k-cancel-draft` | Designed. A typed “cancel” gets a reply that quotes the review and says to tap Cancel. This follows the product rule that typed words never decide a review. Tapping Cancel shows a toast and edits the review in place to show Cancelled. |
| `k-disc` | `k-disc` | Designed. **Proposed:** `/disconnect` asks first with **Disconnect / Keep connected** (Keep, then ask again, then Disconnect). The message is edited to the product's notice, “Telegram disconnected from EwaTrade ✓”, and adds what still works. The Connected message is edited to Disconnected, the pin is removed and the menu changes back to the unlinked commands. **Product today:** `/disconnect` takes effect at once. It sits in the command menu, where a stray tap is easy, so asking first is worth considering. |
| `k-stop` | `k-stop` | Designed with a Telegram equivalent: ⋮ → **Stop bot** → Telegram's block confirmation → the **RESTART** bar. On RESTART, the bot explains that stopping disconnected the chat, edits the Connected message, unpins it and offers **Connect in EwaTrade**. **Proposed:** EwaTrade would revoke the connection when Telegram reports the block (`my_chat_member` → kicked). I did not find that handling in `telegram-runtime.ts`. While a user has the bot blocked, the bot cannot send or edit, so cleanup waits for RESTART. |
| `k-relink` | `k-relink` | Designed. A chat that was disconnected yesterday → “Hi” → **Open EwaTrade** → the normal app link round trip (`linkRoundTrip`) → the claim message is edited to Connected and pinned. |
| `k-outage` | `k-outage` | Designed. The error message has a **Try again** callback. Tapping it shows the toast “Checking again…” and edits the same message into the answer, so the error does not stay in the chat. |
| `k-window` | — | **Not applicable.** Telegram has no 24-hour customer-service window. A bot can reply at any time after the user starts it. A slow answer is covered by `k-outage` and by batch 5's continuation cases. |
| `k-unknown` | covered by 9c `w-sale-unknown` (batch 4) | Same intent: the confirmation result did not arrive. Batch 4's Check status flow is the Telegram design. |
| `k-quota` | `k-quota` | Designed and adapted. Telegram has no per-connection message quota, so the limit is EwaTrade's own assistant limit. **Proposed:** I found no such limit in the product. **Continue in EwaTrade** opens the saved chat in Telegram's in-app browser. |
| `k-support` | `k-support` | Designed. A **Contact support** URL button opens an EwaTrade support form, which shows what is shared, then a sent screen with a reference. **Proposed:** the support screen is not built. |
| `k-privacy` | `k-privacy` | Designed and adapted. In Telegram, the bot sees the Telegram name, user ID and the messages sent in this chat, but not the phone number, contacts or other chats. **My assistant data** opens Account › Assistant data in EwaTrade. |

Stale buttons: the product already clears a review's keyboard after Confirm, Edit or Cancel. An old button can still be tapped only before the keyboard is cleared or after a review expires. Those cases are 9b, 9g, `s-old` and `fmt-failure`.

#### 15 · Safety and language

| WhatsApp case | Telegram case | Treatment |
| --- | --- | --- |
| `s-pw` | `s-pw` | Designed. **Proposed:** the bot deletes the incoming message with `deleteMessage`, which bots can do in private chats. It replies that the message was deleted, that EwaTrade never asks for passwords and that the password was not used, and adds **Change password** (EwaTrade, in-app browser). **Product today:** `isWhatsAppCredentialSubmission` drops the message silently and sends no reply, and the message stays visible in the chat. The unlinked onboarding variant is not needed, because the Telegram bot never asks for an email or code. |
| `s-unit` | `s-unit` | Designed. The unit question has buttons. The choice edits the question in place (“Rice 50kg bag × 2 bags ✓”), and the next question follows. |
| `s-amount` | `s-amount` | Designed. An exact-amount check (“I'll use exactly ₦150”) → the canonical Record payment review → Confirm → receipt. |
| `s-date` | `s-date` | Designed. A “Which Friday?” button is edited in place, and the canonical Record expense review dated Fri 16 Oct follows. |
| `s-inject` | `s-inject` | Designed. Uses the WhatsApp Hybrid copy. |
| `s-old` | `s-old` | Adapted. In Telegram the old Confirm button disappears when Cancel is tapped. The case shows Cancel in place, then a typed “confirm”, which gets “That draft was cancelled… Nothing was saved.” **Proposed copy**, as for `k-cancel`. |
| `s-forward` | `s-forward` | Adapted. A review forwarded from Kemi shows Telegram's “Forwarded from” header, and the bot refuses it. The product binds callbacks to the original chat and message (`readAssistantTelegramActionReview`), so a forwarded copy cannot confirm anything. |
| — | `t-lang` (new) | Designed. **Proposed:** a Pidgin question gets a Pidgin answer with the figures unchanged. Buttons, reviews and receipts stay in English so amounts and actions read the same for everyone. |

#### 16 · Forms (proposed Mini App)

The six WhatsApp Flows forms become a **Telegram Mini App**, opened from an inline `web_app` button. It is drawn as Telegram's bottom sheet with Telegram's header (× or ←, title, ⋮). The full-width **MainButton** is at the bottom, and the colours come from Telegram's `themeParams` (Day and Night). Sections, radio cells and pickers follow Telegram's settings style. Every form ends in **Send for review**. The sheet closes, the launcher message is edited to “Sent for review ✓” and the canonical review appears in chat. Confirm leads to the receipt. **Edit** on a form review is a `web_app` button, because a callback cannot open a Mini App. It reopens the form with the same answers, and the old review is closed as “Replaced by draft 2 ↓”. `fl-old` is the native comparison: the same sale done entirely with inline-keyboard steps.

| WhatsApp case | Telegram case | Treatment |
| --- | --- | --- |
| `fl-signup` | covered by `r-full` (batch 2) | Adapted to EwaTrade. Account and identity forms stay in signed-in EwaTrade (brief rule), so there is no Mini App sign-up. |
| `fl-sale` | `fl-sale` | Designed. Three steps (customer and item, payment, check the amounts) → review → Confirm → receipt. The launcher also offers **Answer in chat**. |
| `fl-cust` | `fl-cust` | Designed. One screen → review → **Edit** reopens the form → draft 2 → Confirm → receipt. |
| `fl-prod` | `fl-prod` | Designed. One screen → review → Confirm → receipt with **Add photo in EwaTrade**. |
| `fl-exp` | `fl-exp` | Designed. One screen, “records only” → review → Confirm → receipt. |
| `fl-recv` | `fl-recv` | Designed. Two steps → review → Confirm → receipt with **Record supplier bill**. The native stock receive is itself proposed. Today receiving stock is reviewed in EwaTrade (see batch 4, `w-recv-today`). |
| `fl-invalid` | `fl-invalid` | Designed. Blank fields show inline errors in Telegram's destructive colour. The rule that the full price must be more than the amount received is checked by EwaTrade before the sheet closes, so WhatsApp's chat recovery step is not needed. |
| `fl-ambig` | `fl-ambig` | Designed. The check step shows the amount large and in words (“one hundred and fifty naira”). Tapping ← to fix it to 150,000 gives a check screen in words, then the review. |
| `fl-unit` | `fl-unit` | Designed. Choosing kg for rice shows an inline warning, and the unit picker is highlighted. Changing to bag → step 2 → review. |
| `fl-close` | `fl-close` | Designed. × on a half-filled form shows Telegram's closing confirmation (“Changes that you made may not be saved.”). After Close anyway, nothing is saved. **Open form** again shows the answers kept. **Proposed:** keep the draft answers on the EwaTrade server for the signed form session, not in Telegram CloudStorage, so business data stays in EwaTrade. |
| `fl-expired` | `fl-expired` | Designed. The Store is switched to Surulere in EwaTrade while the form is open. On Send, the Mini App shows “This form can't be used”. The launcher is edited to say why, with **Open new form**, which opens for Surulere. |
| `fl-dup` | `fl-dup` | Designed for the form part. While sending, the MainButton shows progress and is locked, so a second tap does nothing and one draft arrives. Confirm tapped twice is batch 4's 9b. |
| `fl-old` | `fl-old` | Adapted into the comparison. Telegram clients open Mini Apps, so “can't open forms” becomes **Answer in chat**: the same sale through seven inline-keyboard and typed steps, each edited to “✓” after it is answered. |
| `fl-signup-dup` | covered by EwaTrade sign-up | Adapted. EwaTrade's existing sign-up rules apply (as `r-dup` in batch 2). |
| `fl-under13` | covered by EwaTrade sign-up | Adapted. EwaTrade's existing sign-up rules apply (as `r-under13` in batch 2). |

The plan deferred `c-addbiz-n` (add a business by native interview) to this batch. I recommend leaving it covered by `c-addbiz` (batch 2): creating a business is account scope, which stays in signed-in EwaTrade. No case was added.

Comparison: the Mini App keeps the sale to one sheet with three steps, a check screen and one message back in chat. The native path posts about 14 messages for the same sale, but needs no new surface. My recommendation is the Mini App for multi-field money forms (sale, expense, receive stock) and chat for short ones (customer, one-line product).

#### 17 · Message formatting

Telegram mapping (parse mode HTML): WhatsApp `*bold*` → `<b>`, `_italic_` → `<i>` and `` `literal` `` → `<code>` (tap to copy). Exact amounts, quantities, phone numbers and references go in `<code>`. Lists stay plain text (`•` or `1.`), because Telegram has no list markup. Emoji headers stay as the shared formatter writes them. The WhatsApp “(1/2)” chunks become one message with an expandable blockquote (Telegram allows 4096 characters per message). Numbered “Reply Choose 1” menus become inline keyboards that are edited in place. Literal text needs only `& < >` escaped, so `A_B *Shop*` shows as written.

| WhatsApp case | Telegram case | Treatment |
| --- | --- | --- |
| `fmt-ai` | `fmt-ai` | Designed. Bold title, `•` list with `<code>` quantities, italic note and “as of”. |
| `fmt-draft` | `fmt-draft` | Designed. The 📝 review with `<code>` price and stock → Confirm → ✅ receipt reply. |
| `fmt-receipt` | `fmt-receipt` | Designed. The ✅ “Saved in EwaTrade” receipt with a `<code>` phone number, reached through its review. |
| `fmt-clarify` | `fmt-clarify` | Designed. One plain line. |
| `fmt-menu` | `fmt-menu` | Designed. An inline-keyboard menu, where Check stock edits the same message into the Stock submenu with a ‹ Menu button. The scope line is dropped because the pin shows it. |
| `fmt-account` | `fmt-account` | Adapted. The 🔐 connect message with **Open EwaTrade**. Telegram never asks for an email in chat, so the WhatsApp email prompt has no Telegram form. |
| `fmt-failure` | `fmt-failure` | Designed. Confirm on yesterday's review: the toast “Not saved”, the review closed as Expired and a reply using the product's text (“This review has expired or changed…”). |
| `fmt-literal` | `fmt-literal` | Designed. The literal name, an 18-digit amount and the reference in `<code>`. |
| `fmt-long` | `fmt-long` | Designed. 24 items in one message inside an expandable blockquote, the repeated footnote written once, and **View full response**. |

**Product today:** Telegram replies reuse the WhatsApp text renderer (`renderWhatsAppActionResultChunks`). The Telegram HTML mapping is a proposal for a Telegram renderer.

#### 18 · Payment links (planned)

The chat creates or shares a link and reads its status. It never confirms a payment: “I have paid” is only a claim, and staff confirm what arrived in the authenticated EwaTrade review. Customer messages are prepared for the merchant, who sends them. Nothing goes to the customer automatically.

| WhatsApp case | Telegram case | Treatment |
| --- | --- | --- |
| `bk-link` | `bk-link` | Designed. The account choice edits the same message → the canonical review (“Creates the link only…”) → Confirm → a receipt reply with the link. A second message holds the prepared customer text in a blockquote, with **Copy message** (`copy_text`, Telegram's “Copied to clipboard”) and **Open Ifeanyi's WhatsApp** (URL with the text filled in). |
| `bk-link-svc` | `bk-link-svc` | Designed. The order choice and then the account choice edit one message → review → created. |
| `bk-link-batch` | `bk-link-batch` | Designed. One message lists all 7 orders as ☐/☑ toggle buttons, edited in place (no three-button limit). Select first 5 → Continue → account → one review for all 5 (they are created together, or none are) → a receipt with one **Copy for …** button per customer, **Next 2 orders** and **All links in EwaTrade**. |
| `bk-link-state` | `bk-link-state` | Designed. Four reads: claim not yet recorded (with **Evaluate in EwaTrade**), part paid, paid and link expired (with **New link**). |
| `bk-claim-notice` | `bk-claim-notice` | Designed. A proactive notification with **Open order** and **Evaluate**. A reply “confirm it, I got the money” is refused with the WhatsApp copy. |
| `bk-claim-outcome` | `bk-claim-outcome` | Designed. **Evaluate** opens the EwaTrade review in Telegram's browser → Confirm received → Payment recorded → Back to Telegram. The notification is edited into the result, and a prepared customer message follows with Copy and WhatsApp buttons. |

Sample data changes: the WhatsApp customer “Ishaq Yusuf” is now **Ifeanyi Obi**, so an invented name is used. The Owner is “Ada” to match the Telegram world. Dates moved to the Telegram sample week (today is Tue 20 Oct): links work until 23 Oct, ORD-122 was paid on 18 Oct and ORD-119's link expired on 17 Oct. Copy about the customer uses “they”.

### Telegram features used

- Inline keyboards with no three-button limit, including multi-select toggles.
- Messages edited in place: answers, choices, retries, paging menus and status lines.
- Callback toasts, reply quotes, the pinned scope message and the command menu.
- The chat ⋮ menu with **Stop bot**, Telegram's block confirmation and the **RESTART** bar.
- `deleteMessage` on an incoming message in a private chat.
- Forwarded-message header.
- `<code>` tap-to-copy, blockquote and expandable blockquote.
- `copy_text` buttons.
- The in-app browser for EwaTrade screens (support, assistant data, change password, saved chat, payment review).
- Mini Apps: inline `web_app` buttons, bottom sheet, `themeParams` colours, MainButton with a progress state, BackButton and the closing confirmation.

### Proposals (not in the product)

- All of family 16 (Mini App forms) and the Telegram HTML renderer in family 17.
- `/disconnect` asks first, and the revoke on Stop bot.
- Deleting a password message and replying to it.
- The “nothing to cancel” and “that draft was cancelled” copy.
- The assistant message limit, the support screen and Pidgin replies.
- All of family 18 (payment links are planned and gated).
- Engine additions (in `ext-6.js` only): `mini`, `popup`, `del`, `out.oid` and `restart` ops; `mini:`, `miniback`, `miniclose` and `pop:` controls; a toast for copy buttons.

### Not verified

- Whether Telegram keeps callback buttons on a forwarded bot message. The design relies on the product's chat and message binding either way.
- The exact Android Mini App header look (title placement, colours set with `setHeaderColor`) and the closing-confirmation wording. I drew them from memory of the Bot API and Telegram for Android.
- `copy_text` buttons need Bot API 7.11 or newer and a current client.
- That `deleteMessage` succeeds on every incoming message within 48 hours in private chats.
- The `my_chat_member` handling for Stop bot, and any existing assistant message limit, in the product.

### Open questions for the owner

1. Should `/disconnect` ask first (proposed) or stay immediate (today)?
2. Should a typed “cancel” cancel the only open draft, or keep today's rule that only the buttons decide?
3. Should forms default to the Mini App or to chat buttons? My recommendation is the Mini App for sale, expense and receive stock, and chat for customer and product.
4. Which languages should replies follow (Pidgin, Yoruba, Hausa, Igbo), with reviews and receipts kept in English?
5. Payment-link sharing: are **Copy message** and **Open WhatsApp** enough, or should a Telegram share option be added?
