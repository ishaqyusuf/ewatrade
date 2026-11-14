# Chat receipt reading and matching

14 November 2026. Owner request: a merchant shares a bank transfer receipt
(photo or PDF) with the assistant on WhatsApp or Telegram. OpenAI reads it, the
assistant works out what the money was, and records it after the merchant confirms.

Status: owner selected v18 and asked to implement it all (14 Nov 2026). Implementation in progress.

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
