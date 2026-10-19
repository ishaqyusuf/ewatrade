import {
  type GeneralAnswer,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import type { createGeneralDomainCaller } from "../general-callers"

type Caller = ReturnType<typeof createGeneralDomainCaller>["finance"]
type SupplierPage = Awaited<ReturnType<Caller["suppliers"]>>
type RegistrationPage = Awaited<ReturnType<Caller["purchaseRecognitions"]>>
type PurchasePage = Awaited<ReturnType<Caller["purchases"]>>
type Statement = Awaited<ReturnType<Caller["supplierStatement"]>>
type Categories = Awaited<ReturnType<Caller["expenseCategories"]>>
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
function money(value: string, currency: string) {
  if (!/^-?(0|[1-9]\d{0,19})$/.test(value) || !/^[A-Z]{3}$/.test(currency))
    throw Error("Exact recorded money unavailable")
  return generalMoney(value, currency)
}
const pageNote = (more: boolean, preserved: string) =>
  `${more ? `More records available; preserve ${preserved} when continuing.` : "End of this list."} This page is not a complete total; long labels may be shortened.`

export function suppliersReadAnswers(
  page: SupplierPage,
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  const rows = page.data.slice(0, 10)
  return [
    {
      id: `supplier_page_${crypto.randomUUID()}`,
      title: "Suppliers",
      value: `${rows.length} identities on this page`,
      scope: "Selected Finance Book · supplier identities",
      asOf,
      detail: `${pageNote(Boolean(page.nextCursor) || page.data.length > rows.length, "the same Book and search")} Ask which saved supplier when names are ambiguous. These identities do not report amounts paid, payable, advances or goods received.`,
    },
    ...rows.map(
      (row): GeneralAnswer => ({
        id: `supplier_identity_${crypto.randomUUID()}`,
        title: clip(row.name, 160),
        value: clip(row.code, 160),
        scope: "Selected Finance Book · supplier identity",
        asOf,
        detail:
          "Saved supplier name and code. Not a balance, payout beneficiary, supplier payment or proof of goods received.",
      }),
    ),
  ]
}

export function purchaseRegistrationsReadAnswers(
  page: RegistrationPage,
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  const rows = page.items.slice(0, 10)
  const scope = `Selected Finance Book and supplier · ${page.currencyCode}`
  return [
    {
      id: `purchase_registration_page_${crypto.randomUUID()}`,
      title: "Registered purchases",
      value: `${rows.length} on this page`,
      scope,
      asOf,
      detail: `${pageNote(Boolean(page.nextCursor) || page.items.length > rows.length, "the original Book and supplier")} Includes agreements without invoices. Registration creates no payable or stock. Inspect original recognition events separately for invoice, ownership, receipt and corrections.`,
    },
    ...rows.map(
      (row): GeneralAnswer => ({
        id: `purchase_registration_${crypto.randomUUID()}`,
        title: clip(row.description, 160),
        value: `${money(row.amountMinor, page.currencyCode)} agreed`,
        scope,
        asOf,
        detail: `Original agreement effective ${row.agreedAt.toISOString()}. This is agreed cost, not paid money, a recognized invoice, current payable or stock receipt. Description may be shortened; open the original record for all lines.`,
      }),
    ),
  ]
}

export function purchaseBillsReadAnswers(
  page: PurchasePage,
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  const rows = page.items.slice(0, 10)
  const scope = `Selected Finance Book · all Stores · ${page.currencyCode}`
  return [
    {
      id: `purchase_bill_page_${crypto.randomUUID()}`,
      title: "Purchase bills",
      value: `${rows.length} on this page · ${page.count} matching`,
      scope,
      asOf,
      detail: `Complete matching bill controls: incurred ${money(page.summary.incurredMinor, page.currencyCode)}, settled against bills ${money(page.summary.paidMinor, page.currencyCode)}, outstanding ${money(page.summary.outstandingMinor, page.currencyCode)}. These cover all matching bills, not sums of this page. Settled includes advances, not all new cash. ${pageNote(Boolean(page.nextCursor) || page.items.length > rows.length, "the Book, supplier and status")} Registrations without recognized bills are excluded. No physical receipt, ownership or bank settlement is proved.`,
    },
    ...rows.map(
      (row): GeneralAnswer => ({
        id: `purchase_bill_list_item_${crypto.randomUUID()}`,
        title: clip(row.payeeName, 160),
        value: `${money(row.outstandingMinor, page.currencyCode)} outstanding`,
        scope,
        asOf,
        detail: `${clip(row.description, 260)}. Status ${row.status}; effective ${row.incurredAt.toISOString()}. Original total ${money(row.totalMinor, page.currencyCode)}; settled ${money(row.paidMinor, page.currencyCode)}. ${row.status === "VOID" ? "Voided bill; cannot be paid. " : ""}Settlement may include allocated advances. Inspect the exact saved bill for bounded payment/allocation history; no new cash or physical receipt is inferred.`,
      }),
    ),
  ]
}

export function supplierStatementReadAnswers(
  statement: Statement,
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  const rows = statement.data.slice(0, 10)
  const scope = `Selected Finance Book · ${statement.currencyCode} · snapshot ${statement.snapshotSequence}`
  return [
    {
      id: `supplier_statement_${crypto.randomUUID()}`,
      title: clip(`Supplier statement · ${statement.supplier.name}`, 160),
      value: `${money(statement.payableMinor, statement.currencyCode)} payable`,
      scope,
      asOf,
      detail: `Complete snapshot supplier advance ${money(statement.advanceMinor, statement.currencyCode)} is separate from payable. ${rows.length} recorded entries on this page, not their sum or a complete entry count. ${pageNote(Boolean(statement.nextCursor) || statement.data.length > rows.length, "the original Book, supplier and snapshot")} Entries are bookkeeping, not verified bank settlement, physical receipt or purchase ownership.`,
    },
    ...rows.map(
      (row): GeneralAnswer => ({
        id: `supplier_statement_entry_${crypto.randomUUID()}`,
        title: clip(`${row.kind.replaceAll("_", " ")} · ${row.side}`, 160),
        value: money(row.amountMinor, statement.currencyCode),
        scope,
        asOf,
        detail: `${clip(row.description, 300)}. Effective ${row.effectiveAt.toISOString()}; recorded ${row.recordedAt.toISOString()}; journal sequence ${row.sequence}. ${row.reversalOfId ? "Reversal entry linked to an original posting." : row.reversal ? "Original posting has a linked reversal; do not count it again as active settlement." : "Original recorded entry; no linked reversal is shown."} Debit/credit side is the original supplier-entry side, not a cash direction. Complete supplier controls above supersede page sums.`,
      }),
    ),
  ]
}

export function expenseCategoriesReadAnswers(
  page: Categories,
  asOf = new Date().toISOString(),
): GeneralAnswer[] {
  const rows = page.accounts.slice(0, 10)
  const scope = `Selected Finance Book · ${page.book.currencyCode} · expense category identities`
  return [
    {
      id: `expense_category_page_${crypto.randomUUID()}`,
      title: "Expense categories",
      value: `${rows.length} identities on this page`,
      scope,
      asOf,
      detail: `${pageNote(Boolean(page.nextCursor) || page.accounts.length > rows.length, "the original Book and account-code cursor")} Active operating-expense categories only; this is not incurred spending, an expense bill, a money account or a balance. Ask which category when names are ambiguous.`,
    },
    ...rows.map(
      (row): GeneralAnswer => ({
        id: `expense_category_${crypto.randomUUID()}`,
        title: clip(row.name, 160),
        value: clip(row.code, 160),
        scope,
        asOf,
        detail:
          "Saved active operating-expense category identity. No expense was recorded, no money moved and no spending total was read.",
      }),
    ),
  ]
}
