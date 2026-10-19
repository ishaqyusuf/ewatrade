import {
  type GeneralAnswer,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import type { createGeneralDomainCaller } from "../general-callers"

type Caller = ReturnType<typeof createGeneralDomainCaller>
type CustomerPage = Awaited<ReturnType<Caller["customerLedger"]["accounts"]>>
type Recognition = Awaited<ReturnType<Caller["finance"]["purchaseRecognition"]>>
type Purchase = Awaited<ReturnType<Caller["finance"]["purchase"]>>
type CustomerPageRead = Pick<
  CustomerPage,
  "accounts" | "nextCursor" | "coverage" | "completeness"
> & { customer: Pick<CustomerPage["customer"], "name"> }
type RecognitionRead = Pick<
  Recognition,
  | "supplierName"
  | "description"
  | "amountMinor"
  | "currencyCode"
  | "agreedAt"
  | "corrected"
  | "invoiceBillId"
> & {
  events: Array<
    Pick<
      Recognition["events"][number],
      "stage" | "effectiveAt" | "reversalOfId" | "reversalId" | "reason"
    >
  >
}
type PurchaseRead = Pick<
  Purchase,
  | "payeeName"
  | "description"
  | "currencyCode"
  | "totalMinor"
  | "paidMinor"
  | "cashPaidMinor"
  | "activeAllocatedMinor"
  | "releasedAllocationMinor"
  | "outstandingMinor"
  | "voidedAt"
  | "currentSupplierTotals"
  | "coverage"
  | "recognitionId"
  | "paymentsHasMore"
  | "supplierEntriesHasMore"
  | "allocationsHasMore"
> & {
  payments: Array<
    Pick<
      Purchase["payments"][number],
      "amountMinor" | "effectiveAt" | "reversedAt"
    > & { account: Pick<Purchase["payments"][number]["account"], "name"> }
  >
  supplierEntries: readonly unknown[]
  allocations: Array<
    Pick<
      Purchase["allocations"][number],
      "amountMinor" | "effectiveAt" | "releasesHasMore"
    > & { releases: readonly unknown[] }
  >
}

const clip = (value: string, maximum: number) => {
  if (value.length <= maximum) return value
  let result = ""
  for (const { segment } of new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment(value)) {
    if (result.length + segment.length > maximum - 1) break
    result += segment
  }
  return `${result}…`
}
function money(minor: string, currency: string) {
  if (!/^-?(0|[1-9]\d{0,19})$/.test(minor) || !/^[A-Z]{3}$/.test(currency))
    throw Error("Exact recorded money unavailable")
  return generalMoney(minor, currency)
}

/** This RPC returns identities/revisions only; account balances have not been read. */
export function customerAccountsReadAnswers(
  page: CustomerPageRead,
  input: { currencyCode?: string; afterCurrency?: string },
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  const shown = page.accounts.slice(0, 10)
  const more = Boolean(page.nextCursor) || page.accounts.length > shown.length
  return [
    {
      id: `customer_accounts_${crypto.randomUUID()}`,
      title: clip(page.customer.name, 160),
      value: `${shown.length} account identities on this page`,
      scope: "Current business · all Stores · customer ledger",
      asOf,
      detail: `${input.afterCurrency ? "Continuation page" : "First page"}; currency filter: ${input.currencyCode ?? "all currencies"}. ${more ? "More accounts available; continue with the same customer and currency filter." : "End of this account-identity list."} This read returns account identities, revisions and snapshots only, not debt, credit, cash collected or bank balances. An absent account never proves zero debt or no unpaid orders. Unintegrated orders are excluded; long labels may be shortened.`,
    },
    ...shown.map(
      (account): GeneralAnswer => ({
        id: `customer_account_identity_${crypto.randomUUID()}`,
        title: `${account.currencyCode} customer account`,
        value: "Account identity only",
        scope: "Customer ledger account · all Stores",
        asOf,
        detail: `Saved account revision ${account.revision}; posted-ledger snapshot ${account.snapshotSequence}. Balances have not been read. Preserve this exact customer and currency when continuing; never add different currencies together.`,
      }),
    ),
  ]
}

/** Separate registration, active original stages and their correction events. */
export function purchaseRecognitionReadAnswers(
  document: RecognitionRead,
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  const scope = `Selected Finance Book · ${document.currencyCode}`
  const shown = document.events.slice(0, 20)
  const stages = ["INVOICE", "OWNERSHIP", "RECEIPT"]
    .map(
      (stage) =>
        `${stage}: ${document.events.some((event) => event.stage === stage && !event.reversalOfId && !event.reversalId) ? "active recorded event" : "no active recorded event"}`,
    )
    .join("; ")
  return [
    {
      id: `purchase_agreement_${crypto.randomUUID()}`,
      title: clip(document.supplierName, 160),
      value: `${money(document.amountMinor, document.currencyCode)} agreed`,
      scope,
      asOf,
      detail: `${clip(document.description, 260)}. Agreement effective ${document.agreedAt.toISOString()}. ${stages}. ${document.corrected ? "Correction events are present." : "No correction event is recorded in this result."} ${shown.length} of ${document.events.length} saved events shown. Registration is agreed cost, not payable, paid money or goods received. A saved invoice link or historical receipt alone is not current payable or stock evidence.`,
    },
    ...shown.map(
      (event): GeneralAnswer => ({
        id: `purchase_recognition_event_${crypto.randomUUID()}`,
        title: `Purchase ${event.stage.toLowerCase()} event`,
        value: event.reversalOfId
          ? "Correction event"
          : event.reversalId
            ? "Corrected original event"
            : "Active original event",
        scope,
        asOf,
        detail: `Effective ${event.effectiveAt.toISOString()}. ${event.reason ? `Recorded reason: ${clip(event.reason, 360)}. ` : ""}${event.reversalOfId ? "This reverses an original event; it is not another active recognition." : event.reversalId ? "This original has been reversed; do not count it as an active stage." : "Recorded original stage; invoice, ownership and receipt remain separate facts."} Whole-document matching applies; receipt correction requires an existing supplier-return source. No unsupported partial recognition or cash transfer is implied.`,
      }),
    ),
  ]
}

/** Complete canonical bill/supplier controls stay separate from bounded payment/allocation history. */
export function purchaseBillReadAnswers(
  bill: PurchaseRead,
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  const scope = `Selected Finance Book · ${bill.currencyCode}`
  const payments = bill.payments.slice(0, 10)
  const allocations = bill.allocations.slice(0, 10)
  const partial =
    bill.paymentsHasMore ||
    bill.payments.length > payments.length ||
    bill.supplierEntriesHasMore ||
    bill.supplierEntries.length > 10 ||
    bill.allocationsHasMore ||
    bill.allocations.length > allocations.length ||
    bill.allocations.some(
      (entry) => entry.releasesHasMore || entry.releases.length > 10,
    )
  return [
    {
      id: `purchase_bill_${crypto.randomUUID()}`,
      title: clip(bill.payeeName, 160),
      value: `${money(bill.outstandingMinor, bill.currencyCode)} outstanding`,
      scope,
      asOf,
      detail: `${bill.voidedAt ? "Voided bill; cannot be paid. " : "Recorded purchase bill. "}${clip(bill.description, 180)}. Complete bill controls: total ${money(bill.totalMinor, bill.currencyCode)}; settled ${money(bill.paidMinor, bill.currencyCode)}; recorded cash payments ${money(bill.cashPaidMinor, bill.currencyCode)}; active advances applied ${money(bill.activeAllocatedMinor, bill.currencyCode)}; released allocations ${money(bill.releasedAllocationMinor, bill.currencyCode)}. Settled includes advances, not all new cash. These are bookkeeping facts, not proof of bank/provider settlement.`,
    },
    {
      id: `purchase_supplier_controls_${crypto.randomUUID()}`,
      title: "Supplier control balances",
      value: `${money(bill.currentSupplierTotals.payableMinor, bill.currencyCode)} payable`,
      scope,
      asOf,
      detail: `Supplier advance ${money(bill.currentSupplierTotals.advanceMinor, bill.currencyCode)} is separate. Complete supplier snapshot through journal ${bill.currentSupplierTotals.throughJournalSequence}, across this supplier's postings in the selected Book; these are not this bill's totals. ${payments.length} recent payments and ${allocations.length} allocations shown below. ${partial ? "History is incomplete; omitted targets must not be guessed." : "Returned payment/allocation history is within this display bound."} Supplier-entry details and allocation release rows are not listed. Bill lines and receipt/valuation sources are not shown; ${bill.recognitionId || bill.coverage.receipts === "SEPARATE_RECOGNITION_SOURCE" ? "inspect the separate recognition record" : "inspect each original line's recorded movement"}. Never infer physical receipt, ownership, stock availability or profit from settlement totals.`,
    },
    ...payments.map(
      (payment): GeneralAnswer => ({
        id: `purchase_payment_${crypto.randomUUID()}`,
        title: clip(payment.account.name, 160),
        value: money(payment.amountMinor, bill.currencyCode),
        scope: `${scope} · original bill payment`,
        asOf,
        detail: `Effective ${payment.effectiveAt.toISOString()}. ${payment.reversedAt ? "This payment was reversed; it is not active settlement." : "No reversal is recorded for this payment."} Recorded bookkeeping only; no bank or provider transfer is verified. Complete bill totals above supersede sums of this limited history.`,
      }),
    ),
    ...allocations.map(
      (allocation): GeneralAnswer => ({
        id: `purchase_allocation_${crypto.randomUUID()}`,
        title: "Original supplier advance allocation",
        value: money(allocation.amountMinor, bill.currencyCode),
        scope,
        asOf,
        detail: `Effective ${allocation.effectiveAt.toISOString()}. ${allocation.releases.length} release records returned${allocation.releasesHasMore ? "; more releases exist" : ""}; their details are not shown. This is the original allocated amount, not inferred remaining allocation or new cash paid. Complete active/released bill totals above are authoritative; releasing an allocation restores advance/payable and does not transfer money.`,
      }),
    ),
  ]
}
