/**
 * A customer statement for chosen dates, as printed on the PDF. Built by
 * `getCustomerStatementDocument` (packages/db) from the customer ledger and
 * rendered by `renderCustomerStatement` (./statement-pdf). Amounts are exact
 * minor units as strings; a positive balance is owed, a negative one is
 * paid ahead.
 */
export type CustomerStatementDocument = {
  accountId: string
  customerId: string
  currencyCode: string
  snapshotSequence: string
  timezone: string
  /** Local dates (YYYY-MM-DD), both inclusive. */
  from: string
  through: string
  issuedAt: string
  business: {
    name: string
    storeName: string | null
    address: string | null
    phone: string | null
    email: string | null
  }
  customer: { name: string; phone: string | null; email: string | null }
  openingMinor: string
  chargedMinor: string
  paidMinor: string
  closingMinor: string
  lines: CustomerStatementLine[]
  /** Receiving bank accounts set up in Finance; empty when hidden or none. */
  paymentAccounts: Array<{
    bankName: string
    accountNumber: string
    accountHolder: string
    mobileMoney: boolean
  }>
}

export type CustomerStatementLine = {
  id: string
  effectiveAt: string
  title: string
  detail: string | null
  side: "DEBIT" | "CREDIT"
  amountMinor: string
  runningMinor: string
}

const methodWords: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  POS: "POS",
  CUSTOMER_CREDIT: "Paid ahead",
  OTHER: "Other",
}

/**
 * Customer-facing words for one statement line. Merchant notes are never
 * printed; only the kind, the Order number and the payment method.
 */
export function customerStatementLineWords(input: {
  kind: string
  orderNumber: string | null
  method: string | null
}) {
  const order = input.orderNumber ? `Order ${input.orderNumber}` : null
  const method = input.method ? (methodWords[input.method] ?? "Other") : null
  switch (input.kind) {
    case "OPENING_DEBT":
      return { title: "Starting balance", detail: "Owed before this account" }
    case "OPENING_CREDIT":
      return {
        title: "Starting balance",
        detail: "Paid ahead before this account",
      }
    case "ORDER_CHARGE":
      return { title: order ?? "Order", detail: null }
    case "ORDER_PAYMENT":
      return { title: "Payment", detail: order ?? method }
    case "RECEIPT":
      return { title: "Payment", detail: method }
    case "CREDIT_NOTE":
      return { title: "Credit note", detail: order }
    case "REFUND":
      return { title: "Paid-ahead money returned", detail: method }
    case "REVERSAL":
      return { title: "Correction", detail: order }
    default:
      return { title: "Entry", detail: order }
  }
}

/**
 * Opening balance plus the period's lines in date order, with a running
 * balance, the period's charges and payments, and the closing balance.
 */
export function customerStatementPeriod(input: {
  openingMinor: bigint
  entries: ReadonlyArray<
    Omit<CustomerStatementLine, "runningMinor" | "amountMinor"> & {
      amountMinor: bigint
    }
  >
}) {
  let running = input.openingMinor
  let charged = BigInt(0)
  let paid = BigInt(0)
  const lines: CustomerStatementLine[] = input.entries.map((entry) => {
    if (entry.amountMinor < BigInt(0))
      throw new Error("Statement amounts are never negative.")
    if (entry.side === "DEBIT") {
      running += entry.amountMinor
      charged += entry.amountMinor
    } else {
      running -= entry.amountMinor
      paid += entry.amountMinor
    }
    return {
      ...entry,
      amountMinor: entry.amountMinor.toString(),
      runningMinor: running.toString(),
    }
  })
  return {
    openingMinor: input.openingMinor.toString(),
    chargedMinor: charged.toString(),
    paidMinor: paid.toString(),
    closingMinor: running.toString(),
    lines,
  }
}

/** "amina-bello-statement-2026-10-01-to-2026-10-31.pdf" */
export function customerStatementFilename(input: {
  customerName: string
  from: string
  through: string
}) {
  const slug = input.customerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
  return `${slug || "customer"}-statement-${input.from}-to-${input.through}.pdf`
}

/** Exact minor units in the en-NG layout ("₦14,500.00"), never through floats. */
export function customerStatementMoney(value: string, currency: string) {
  const amount = BigInt(value)
  const absolute = amount < BigInt(0) ? -amount : amount
  const whole = (absolute / BigInt(100)).toString()
  const fraction = (absolute % BigInt(100)).toString().padStart(2, "0")
  const sample = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount < BigInt(0) ? -1234.56 : 1234.56)
  const layout = /1([^0-9]*)234([^0-9]*)56/.exec(sample)
  if (!layout) throw new Error("Currency formatting is unavailable.")
  const digits = whole.replace(/\B(?=(\d{3})+(?!\d))/g, layout[1] ?? ",")
  return sample.replace(layout[0], () => `${digits}${layout[2]}${fraction}`)
}

/** "₦14,500.00 owed", "₦2,000.00 paid ahead" or "₦0.00"; never a minus sign. */
export function customerStatementBalanceWords(value: string, currency: string) {
  const amount = BigInt(value)
  if (amount > BigInt(0))
    return `${customerStatementMoney(value, currency)} owed`
  if (amount < BigInt(0))
    return `${customerStatementMoney((-amount).toString(), currency)} paid ahead`
  return customerStatementMoney("0", currency)
}
