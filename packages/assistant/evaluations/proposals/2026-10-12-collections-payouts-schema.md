# Proposed schema: collection intents and payouts (F01/F02/F04/F05)

12 October 2026. **Persistence foundation applied on Development.** The coordinator
materialized the reviewed schema at `packages/db/prisma/models/collections-payouts.prisma`.
Prisma generated/applied `20261012160840_collections_payouts`; root `db:generate`,
`db:migrate --local` and `db:push --local` succeeded on verified `ewatrade_qa_v1`.
The actual schema tightens Tenant/Book/supplier/source foreign keys, qualifies
provider event identity by provider, and uses a separate HELD-capable event enum.
Actor IDs remain scalar audit references, following existing financial records;
privacy inventory/retention integration is required before any command is enabled.
The original model sketch below is historical; the Prisma schema is authoritative.
See [coordinator evidence](../runs/2026-10-12-collections-payouts-coordinator.md).
No handwritten migration SQL, provider operation or Preview/Production change.

Contracts this persists: `packages/payments/src/collection-intent.ts` and
`payout-intent.ts`. Owner policy: `.brain/decisions/2026-10-12-collection-payout-and-canary-policy.md`.

## Design rules the schema enforces

- One open collection intent per order: a partial unique index is not expressible
  in Prisma, so the opening command locks the order row (`SELECT … FOR UPDATE`)
  and checks `decideOpenCollection` in the same transaction.
- Provider events are written in **their own** transaction before settlement, so a
  refused settlement can never erase money the provider says it received.
- Held provider money is a row (`CollectionHold`) until a reviewed refund or
  customer-credit resolution; resolution is unique per hold.
- Payout reference is unique and fixed at approval; one payout keeps it for life.
- No full bank account number column exists anywhere.
- The payouts stop is a per-business setting row, not an env switch.

## Original model sketch (superseded by the reviewed Prisma schema)

```prisma
model CollectionIntent {
  id                String              @id @default(cuid())
  tenantId          String
  storeId           String
  sourceKind        String              // "commercial_order" (v1)
  orderId           String
  clientIntentId    String
  provider          String
  providerReference String              @unique
  amountMinor       Int                 // partial allowed: 0 < amount <= balance at opening
  currencyCode      String
  status            HostedPaymentStatus @default(CREATED)
  checkoutUrl       String?
  expiresAt         DateTime            // 10 min – 72 h after createdAt
  createdByUserId   String?             // null for a customer-initiated link
  cancelledAt       DateTime?
  cancelledByUserId String?
  paidAt            DateTime?
  failedAt          DateTime?
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
  tenant            Tenant              @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  store             Store               @relation(fields: [storeId], references: [id], onDelete: Restrict)
  order             CommercialOrder     @relation(fields: [orderId], references: [id], onDelete: Restrict)
  events            CollectionProviderEvent[]
  holds             CollectionHold[]

  @@unique([tenantId, clientIntentId])
  @@index([orderId, status, expiresAt])
  @@index([tenantId, storeId, status, createdAt])
}

model CollectionProviderEvent {
  id              String                      @id @default(cuid())
  intentId        String?                     // null when no intent matched the reference
  provider        String
  providerEventId String                      @unique
  payloadHash     String
  eventType       String                      // paid | failed
  amountMinor     Int
  currencyCode    String?                     // never defaulted
  outcome         PaymentProviderEventOutcome @default(RECEIVED)
  holdReason      String?                     // decideProviderSettlement reason when held
  receivedAt      DateTime                    @default(now())
  processedAt     DateTime?
  intent          CollectionIntent?           @relation(fields: [intentId], references: [id], onDelete: Restrict)
  hold            CollectionHold?

  @@index([intentId, receivedAt])
  @@index([provider, outcome, receivedAt])
}

model CollectionHold {
  id                 String                  @id @default(cuid())
  tenantId           String
  intentId           String
  orderId            String
  eventId            String                  @unique
  amountMinor        Int
  currencyCode       String
  reason             String                  // source_mismatch | amount_mismatch | currency_mismatch | source_already_settled | source_unavailable | provider_mismatch
  resolution         String?                 // provider_refund | customer_credit
  resolvedAt         DateTime?
  resolvedByUserId   String?
  refundCommandId    String?                 @unique // provider refund outbox row
  customerLedgerEntryId String?              @unique // credit entry when kept as credit
  createdAt          DateTime                @default(now())
  intent             CollectionIntent        @relation(fields: [intentId], references: [id], onDelete: Restrict)
  event              CollectionProviderEvent @relation(fields: [eventId], references: [id], onDelete: Restrict)

  @@index([tenantId, resolvedAt, createdAt])
}

model PayoutBeneficiary {
  id                    String    @id @default(cuid())
  tenantId              String
  supplierId            String                // v1 purpose: supplier bills
  version               Int
  country               String
  currencyCode          String
  bankCode              String
  bankName              String
  accountName           String                // provider-resolved, person-confirmed
  accountSuffix         String                // last 4 only
  providerRecipientCode String                // e.g. RCP_…; full account number is never stored
  status                String                // UNVERIFIED | VERIFIED | DISABLED
  verifiedAt            DateTime?
  verifiedByUserId      String?
  createdByUserId       String
  createdAt             DateTime  @default(now())
  payouts               PayoutIntent[]

  @@unique([tenantId, supplierId, version])
  @@index([tenantId, supplierId, status])
}

model PayoutIntent {
  id                 String            @id @default(cuid())
  tenantId           String
  bookId             String
  billId             String            // supplier bill being paid (v1)
  beneficiaryId      String            // a specific beneficiary version
  debitAccountId     String
  amountMinor        BigInt
  feeMinor           BigInt            // business pays; posted to "Bank & transfer charges"
  totalDebitMinor    BigInt
  currencyCode       String
  reviewDigest       String
  provider           String
  providerReference  String            @unique // po_<hash>, fixed at approval
  providerTransferCode String?
  status             String            // APPROVED | SUBMITTING | RECEIVED | PENDING | UNKNOWN | SUCCEEDED | FAILED | REVERSED | ABANDONED | BLOCKED | REJECTED
  submissionCount    Int               @default(0)
  submissionClaimedAt DateTime?        // outbox claim; one worker at a time
  draftedByUserId    String            // Owner/Admin/Manager
  approvedByUserId   String            // Owner/Admin only
  stepUpVerifiedAt   DateTime          // in-app step-up bound to reviewDigest
  approvedAt         DateTime          @default(now())
  settledAt          DateTime?
  postedJournalEntryId String?         @unique // only after authoritative SUCCEEDED
  correctionJournalEntryId String?     @unique // after REVERSED following success
  beneficiary        PayoutBeneficiary @relation(fields: [beneficiaryId], references: [id], onDelete: Restrict)
  events             PayoutProviderEvent[]

  @@index([tenantId, status, approvedAt])
  @@index([billId])
}

model PayoutProviderEvent {
  id              String        @id @default(cuid())
  payoutId        String?
  provider        String
  providerEventId String        @unique
  payloadHash     String
  status          String        // provider status as received
  outcome         PaymentProviderEventOutcome @default(RECEIVED)
  receivedAt      DateTime      @default(now())
  processedAt     DateTime?
  payout          PayoutIntent? @relation(fields: [payoutId], references: [id], onDelete: Restrict)

  @@index([payoutId, receivedAt])
}

model BusinessPayoutSetting {
  tenantId          String    @id
  payoutsStopped    Boolean   @default(false)
  stoppedAt         DateTime?
  stoppedByUserId   String?   // Owner only
  stopReason        String?
  updatedAt         DateTime  @updatedAt
}
```

## Privacy and retention

New rows that name people or money (`CollectionIntent.createdByUserId`,
`CollectionHold.resolvedByUserId`, beneficiary account name/suffix, payout
actors) must join the account-privacy inventory, as S02 did for invitation
outbox rows. Beneficiary rows are business payee records, not staff/customer
personal data, but the confirming user ID is.

## Follow-up commands (after the migration)

1. `openCollectionIntent` (lock order → `decideOpenCollection` → create) and
   `cancelCollectionIntent`.
2. `recordCommercialOrderPayment` gains the `decideManualReceipt` check against
   open intents under the same order lock.
3. Webhook: persist `CollectionProviderEvent` (own transaction) → settle via
   `recordCommercialOrderPaymentInTransaction` or create `CollectionHold`.
4. `resolveCollectionHold` (refund outbox or customer credit entry).
5. Payout: beneficiary create/verify, draft, approve (role + step-up + digest),
   outbox dispatcher (claim → submit/verify/resubmit-same-reference), webhook,
   posting on success, correction on reversal, payouts stop setting.
