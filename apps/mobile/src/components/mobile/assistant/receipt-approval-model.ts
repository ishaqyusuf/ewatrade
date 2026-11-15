import {
  type GeneralAction,
  generalActionSummary,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"

export type ApprovalRow = { label: string; value: string; detail?: string }

/** What the approver is asked to save, shaped for the summary card (Workshop mobile/receipt-approval 03). */
export type ApprovalSummary = {
  amount: string | null
  from?: string
  to?: string
  /** One plain line when there is no from → to, e.g. an expense description. */
  line?: string
  rows: ApprovalRow[]
}

const whole = (value: string) => value.replace(/\.00$/, "")
const money = (minor: number | string, currencyCode: string) =>
  whole(generalMoney(minor, currencyCode))

const clock = (at: Date) =>
  at
    .toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s?([ap])\.?m\.?$/i, " $1m")
    .toLowerCase()

/** "Today, 6:03 pm", "Yesterday, 6:01 pm", "14 Nov, 6:01 pm" or "14 Nov 2025, 6:01 pm". */
export function approvalWhen(value: string | Date, now = new Date()) {
  const at = new Date(value)
  if (!Number.isFinite(at.getTime())) return ""
  const start = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((start(now) - start(at)) / 86_400_000)
  const day =
    days === 0
      ? "Today"
      : days === 1
        ? "Yesterday"
        : at.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            ...(at.getFullYear() === now.getFullYear()
              ? {}
              : { year: "numeric" }),
          })
  return `${day}, ${clock(at)}`
}

const words = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()

export function approvalSummary(
  action: GeneralAction,
  currencyCode: string,
  now = new Date(),
): ApprovalSummary {
  const date = (iso?: string) =>
    iso ? [{ label: "Date", value: approvalWhen(iso, now) }] : []
  const note = (value?: string) =>
    value?.trim() ? [{ label: "Note", value: value.trim() }] : []
  switch (action.action) {
    case "money_transfer_simple":
      return {
        amount:
          action.amountMinor === undefined
            ? null
            : money(action.amountMinor, currencyCode),
        from: action.fromAccountName,
        to: action.toAccountName ?? action.newToAccount?.name,
        rows: [...date(action.effectiveAt), ...note(action.note)],
      }
    case "expense_record_simple":
      return {
        amount:
          action.amountMinor === undefined
            ? null
            : money(action.amountMinor, currencyCode),
        line: action.description,
        rows: [
          ...date(action.effectiveAt),
          ...(action.accountName
            ? [{ label: "Paid from", value: action.accountName }]
            : []),
          ...(action.payeeName
            ? [{ label: "Paid to", value: action.payeeName }]
            : []),
          ...(action.categoryName
            ? [{ label: "Category", value: action.categoryName }]
            : []),
        ],
      }
    case "money_movement":
      return {
        amount: money(action.amountMinor, currencyCode),
        line: action.description,
        rows: date(action.effectiveAt),
      }
    case "payment_record":
      return {
        amount: money(action.amountMinor, currencyCode),
        line: `${words(action.method.replaceAll("_", " "))} payment for an order`,
        rows: note(action.note),
      }
    default:
      return {
        amount: null,
        line: generalActionSummary(action, currencyCode),
        rows: [],
      }
  }
}

const RECEIPT_LABELS: Record<string, string> = {
  "Amount on receipt": "Amount",
}

/**
 * The receipt as read, for the paper slip: the amount on top, then rows, with
 * names kept as printed. "From" and "To" split into the name and its bank and
 * account line.
 */
export function receiptSlip(facts: Array<{ label: string; value: string }>) {
  let amount: string | null = null
  const rows: ApprovalRow[] = []
  for (const fact of facts) {
    if (fact.label === "Amount on receipt") {
      amount = fact.value
      continue
    }
    if (fact.label === "From" || fact.label === "To") {
      const [name = "", ...rest] = fact.value.split(" · ")
      rows.push({
        label: fact.label,
        value: name,
        ...(rest.length ? { detail: rest.join(" · ") } : {}),
      })
      continue
    }
    rows.push({
      label: RECEIPT_LABELS[fact.label] ?? fact.label,
      value: fact.value,
    })
  }
  const bank = facts
    .find((fact) => fact.label === "From")
    ?.value.split(" · ")[1]
  const reference = facts.find((fact) => fact.label === "Reference")?.value
  return {
    amount,
    rows,
    caption: [bank, reference].filter(Boolean).join(" · "),
  }
}
