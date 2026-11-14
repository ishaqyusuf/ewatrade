# Chat receipt reading and matching

14 November 2026. Owner request: a merchant shares a bank transfer receipt
(photo or PDF) with the assistant on WhatsApp or Telegram. OpenAI reads it, the
assistant works out what the money was, and records it after the merchant confirms.

Status: owner selected v18 and asked to implement it all (14 Nov 2026). Source
implemented and verified on Development; hosted channels need the settings below.
The cashier approval request (19l) was added the same day (see its section).

## What the owner asked for

1. **Customer payment for an order.** Match the receipt to the unpaid order by the
   sender's name. If the sender is someone else, use the remark (narration), for
   example "Funmi Bello order". If nothing matches, ask: "I can't match this to an
   order. What is it for? Reply with the name on the order." Then find the order
   from the typed name.
2. **Several accounts take payments.** A cashier or sales rep's own account is a
   business money account too. The recipient account on the receipt picks which
   account the payment goes into.
3. **Transfer between own accounts.** When both sender and recipient are the
   business's accounts (for example the rep sweeping the day's money to the
   owner's account), record a transfer, not income.
4. **Money out.** When the sender is a business account and the recipient is not,
   the remark picks the record: "transport" becomes a Transport expense, and
   "personal use" becomes an owner withdrawal.
5. **Receipt plus a caption makes a new order.** "20 crates of eggs for this
   customer": the customer comes from the receipt sender, the item and quantity
   come from the caption, and the account comes from the recipient. The merchant
   confirms before anything is recorded.
6. **Confirm or approve.** Confirm in the chat, or approve on the site through a
   link.

## Design

Workshop `ewatrade/assistant/conversations`, direction 01 v18
`df879890-3ef5-44e2-831a-1efae72e4b07`, family **19 · Payment receipts**,
12 proposed scenes:

| # | Scene | Result |
| --- | --- | --- |
| 19a | Receipt matches an unpaid order | Payment on S-1038 |
| 19b | Remark names the customer | Payment on S-1036 (paid by someone else) |
| 19c | No match: ask what it's for | Typed name finds the order, or record money in |
| 19d | Part payment and paying too much | Amount left, or extra kept as customer credit |
| 19e | Transfer between your accounts | Transfer Bisi Opay → Main bank |
| 19f | Money out with a remark | Transport expense or owner withdrawal |
| 19g | Receipt and caption make a new order | New order, size inferred from the amount or asked |
| 19h | Paid into an account that isn't yours | Choose the account or add it |
| 19i | Receipt already recorded | Nothing drafted |
| 19j | Can't read the receipt | Clearer photo or typed fallback |
| 19k | PDF receipt from the bank app | Same as a photo |
| 19l | Cashier sends a receipt for approval | Owner or admin approves by link |

[Review](https://workshop.localhost/ewatrade/assistant/conversations/directions/01?rev=df879890-3ef5-44e2-831a-1efae72e4b07#wa/rc-order-match/sent)

## What already exists

- **Receipt extraction.** `packages/payments/src/receipt-extractor.ts`
  (`createReceiptExtractor`, OpenAI Responses API with a strict schema) and
  `receipt-assessment.ts` (`parseReceiptExtraction`, `receiptAmountMinor`,
  duplicate check). Today these serve only the storefront manual-payment receipt
  job, which reads order-attachment storage.
- **WhatsApp media.** `apps/api/src/assistant/whatsapp-media/ingest.ts` stores
  images and PDFs behind `ASSISTANT_WHATSAPP_MEDIA_ENABLED`. In GENERAL chats,
  photos are attachment-only and never read (`assistant-attachment-process.ts`,
  `chat-attachments.ts`).
- **Telegram media.** `apps/api/src/assistant/telegram-media.ts` replies "text
  only" and stores nothing.
- **Write actions.** `payment_record`, `money_in_record`, `money_transfer_simple`,
  `expense_record_simple`, `money_movement` (owner withdrawal) and `order_create`.
  `payment_record` and `order_create` are held back from native chat confirmation
  (`stagedNativeReviewActions`) and use review links (`/r/<short>`).
- **Matching helpers.** `similarSaleNames` handles customer names. Owing orders
  can be found by customer name (`readOrders`, `owing: true`). Money accounts store
  optional `bankAccountNumber` and `bankAccountHolder`. Nothing matches an account
  by number yet.

## Delivery

1. **Read receipts in chat.** A receipt-reading path for GENERAL chat images and
   PDFs that reuses the extractor and parser on assistant-attachment storage. It
   decides first whether the file is a transfer receipt. Other photos stay
   attachment-only. It adds its own enable flag, daily request and image caps, and
   QA-business rules. A missing amount means asking, never guessing.
2. **Matcher.** A pure, tested module:
   - Account side: match the recipient and sender to money accounts by account
     number (full, or last 4 with a matching holder or bank).
   - Direction: money in, money out, or own transfer.
   - Counterparty: match the customer and owing order by sender name, remark and
     caption, using `similarSaleNames`.
   - Duplicates: by bank reference, then by amount, accounts and minute.
3. **Drafts and confirmation.**
   - Route each case to the existing action and show the review shown in the
     design.
   - Native confirm for `payment_record` and `order_create` on WhatsApp needs the
     policy change. Otherwise the review link applies.
   - Staff without the permission get the approval path.
   - Overpayment goes to the existing customer credit.
   - Revise prompt rules L41 ("payment via link") and L71 ("photos are never
     analysed").
4. **Telegram.** Download and store inbound photos and documents through the
   same pipeline. Mirror the scenes in `assistant/telegram-system`.
5. **Verification.** Matcher unit tests, integration tests on the guarded QA
   database, and a Development run with real receipts. Update Brain docs.

## Schema

`AssistantReceiptRead` (migration `20261114012434_assistant_receipt_reads`) keeps
one row per receipt attachment: the untrusted extraction, the amount in minor
units, the normalized bank reference for duplicate checks, the matcher outcome and
the question asked, the drafted proposal, any excess over the order balance, and
provider usage. It cascades with the conversation. It records no money.

## Decisions for the owner

Answered 14 Nov 2026: owners and admins confirm in chat, staff without the
permission get the approval link; overpayments are kept as customer credit;
Telegram follows the same flows without a separate Workshop pass.

No product code, schema, provider call, or deployment in this checkpoint.

## Implementation — 14 November 2026

Commits `1f5c6fe77` (reader, matcher, schema), `ef21d259d` (chat wiring and
payment receipt attachment), `703b9c5b9` (Telegram) and `680589ef0` (account
numbers printed with the bank name).

- **Reader** `packages/payments/src/chat-receipt.ts`: OpenAI Responses API,
  `gpt-4.1-mini` by default, strict schema with sender and recipient name,
  account and bank, remark, reference, date, status and document kind. Images
  are normalized to JPEG; PDFs go as a file input. `store: false`.
- **Matcher** `packages/assistant/src/general/receipt-match.ts`: pure. Account
  by number (full, masked, or printed with the bank name), else saved holder
  name with an agreeing bank. Both sides ours means a transfer; only the sender
  ours means money out, with the remark choosing an expense category or owner
  withdrawal; only the recipient ours means money in, matched by order number,
  then the remark, the caption, then the sender's name. Same customer with
  several orders takes the exact balance, else asks.
- **Chat** `apps/api/src/assistant/general-receipt-chat.ts` runs in the shared
  turn before the simple money collectors, so WhatsApp, Telegram and the app
  chat behave the same. One read per attachment (`AssistantReceiptRead`), then:
  `payment_record` (with `receiptAttachmentId`, attached to the order's Notes &
  photos on confirm), `money_transfer_simple`, `expense_record_simple` (saved
  category, else Operating expenses), `money_movement` owner withdrawal, or
  `sale_record` for "not for an order". Questions (which order, which account,
  what for) are answered by the next message: a name, a list number, an account
  name or a purpose word. A completed earlier read with the same bank reference
  is refused. Failed, reversed, multi-transfer and foreign-currency receipts are
  refused. A caption that orders goods (“20 crates of eggs for this customer”)
  hands the server-read facts to the model, which prepares the order with the
  payment through `prepareOrder`.
- **Overpayment** records the order's balance; the extra becomes the customer's
  credit through a second reviewed `customer_receipt` when the owner replies
  `credit` after confirming. The design showed one confirmation for both.
- **Telegram** stores a single photo or photo/PDF document as the chat's ready
  attachment (`apps/api/src/assistant/telegram-file.ts`); albums, voice notes and
  other files keep the text-only reply.
- **Staff** without the needed permission get the approval request below (19l).

### Cashier approval request (19l) — 14 November 2026

- A cashier's receipt that matches an action they can't record (payment,
  own-account transfer, expense, owner withdrawal) is saved on the
  `AssistantReceiptRead` row as `approvalAction` + `approvalSummary`, status
  `APPROVAL_OFFERED`. The chat shows "🔁 Transfer to approve … Ada or Kemi
  approves transfers" and asks `ask` or `cancel` (no buttons; plain reply).
- `ask` → `APPROVAL_PENDING` for 3 days. Owners/Admins whose role can record the
  action are told "Bisi sent a transfer to approve" with the link
  `/receipt-approval/<id>`, on their linked WhatsApp (only inside WhatsApp's
  24-hour window: new `server_notice` outbox kind on their newest completed
  inbox, rechecked by delivery) and on Telegram (direct send to the linked
  chat, allow-lists apply). QA businesses only reach chats when
  `ASSISTANT_RECEIPT_QA_LIVE=true`. Every pending request also shows in the
  dashboard Overview's **Needs you** card.
- Opening the link drafts the action as the approver's own proposal (their
  latest chat), so the usual review card, Edit and Confirm apply. Approve claims
  the request and confirms in one serializable transaction (records once; a
  second approval is refused). Decline closes it and cancels the draft.
- The cashier's chat gets "✅ Transfer recorded … Approved by Ada" or "❌ Ada
  declined …": an assistant message in their conversation plus the same
  WhatsApp/Telegram notice. Payments approved this way don't attach the
  cashier's photo to the order (the file belongs to the cashier's chat); the
  note says the receipt was sent in chat. Not built: email to owners, mobile
  app approval screen, push notifications.
- Code: `apps/api/src/assistant/general-receipt-approval.ts`,
  `packages/db/src/queries/assistant-whatsapp/server-notice.ts`,
  `apps/dashboard/src/app/receipt-approval/[id]`. Commits `c65386843`,
  `5df5612a6`.

### Settings for hosted channels

- An OpenAI key with Responses access: `ASSISTANT_RECEIPT_OPENAI_API_KEY`, or the
  assistant `OPENAI_API` key. `CATALOG_IMAGE_OPENAI_API_KEY` is image-scoped and
  returns 401 for this call.
- WhatsApp: `ASSISTANT_WHATSAPP_MEDIA_ENABLED=true`, and add `payment_record`
  to `ASSISTANT_WHATSAPP_NATIVE_REVIEW_ACTIONS` so owners confirm payments in
  chat (otherwise the review link is used).
- Telegram: release the payment, transfer and expense capabilities in
  `ASSISTANT_TELEGRAM_RELEASED_CAPABILITY_IDS`.
- Money accounts need their account number (or holder and bank) in Finance to
  be matched.

### Verification

- Unit: reader 6 tests, matcher 15 tests, Telegram parser 16 tests, Telegram API
  61 tests, media turn and channel review 14 tests.
- Guarded Development QA integration test (own QA business, removed after):
  every receipt outcome above, payment confirmed with the receipt on the order,
  Telegram photo and PDF ingest. 26 assertions.
- Live Development turn as the Claude Web Test Farms QA owner: a rendered receipt
  read by `gpt-4.1-mini` (about 1,700 input tokens, 4–5 s) matched ORD-035 by
  sender and GTBank current account by number and drafted the payment review.
  That run set the GTBank current account's number to `0123454417` in that QA
  business.
- 19l integration (same test, 46 assertions): cashier offer, `ask`, owner
  list/open/approve, double approval refused, cashier told, decline cancels the
  draft, `cancel` before asking.
- 19l browser check (Heritage Wash & Care QA, temporary book, accounts and
  cashier removed after): Needs you row, approval page with receipt facts and
  review card, Decline. Opening the page took about 10 s on Neon.
- Not run: a real WhatsApp or Telegram delivery, hosted environments.
