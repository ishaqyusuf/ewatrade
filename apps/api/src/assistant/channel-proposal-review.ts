import {
  type WhatsAppActionReview,
  type WhatsAppProposalSource,
  renderWhatsAppActionReviewBody,
  whatsAppProposalSourceSchema,
} from "@ewatrade/assistant/channels/action-review"
import {
  type GeneralAction,
  type GeneralProposal,
  generalMoney,
  generalProposalSchema,
  simpleExpenseStep,
  simpleMoneyInStep,
  simpleSaleQuestions,
  simpleSaleStep,
  simpleTransferStep,
} from "@ewatrade/assistant/general/contracts"
import { isSimpleProductCreate } from "@ewatrade/assistant/general/product-create"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import type { GeneralContext } from "./general-context"
import type { generalProposalWithReview } from "./general-proposals"
import {
  isProposalApprovalValid,
  proposalApprovalToken,
  proposalDigest,
} from "./proposal-security"

type ProposalRow = Parameters<typeof generalProposalWithReview>[1]
export type ChannelProposalSource = {
  id: string
  revision: number
  payloadHash: string
  status: string
  action: string
  actionVersion: number
  expiresAt: Date
}
export type ChannelProposalReviewProjection =
  | { kind: "review"; review: WhatsAppActionReview }
  | { kind: "app_review"; reason: "unavailable" | "incomplete" }
const fallback = (
  reason: "unavailable" | "incomplete",
): ChannelProposalReviewProjection => ({ kind: "app_review", reason })
function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(allStrings)
  return value && typeof value === "object"
    ? Object.values(value).flatMap(allStrings)
    : []
}
/** Canonical adapters for these reviews emit exact text lines and no card presentation. */
const linesOnlyReviewActions: ReadonlySet<GeneralAction["action"]> = new Set([
  "payment_record",
  "order_attachment_add",
  "service_intake",
  "service_job_line_transition",
  "service_job_assign",
  "shipment_create",
  "shipment_receive",
  "shipment_cost_adjust",
])
const shipmentCreateLastLine =
  "Confirming expects the shipment. Nothing is added to stock and no bill or payment is recorded until it arrives."
const shipmentReceiveLastLine =
  "Adds the stock and posts one unpaid supplier bill at landed cost. No payment is recorded."
/** The shipment command's own decimal normalization, so 3.20 reads as 3.2. */
function exact(value: string) {
  try {
    return parseExactDecimal(value, { allowZero: true })
  } catch {
    return value
  }
}
const serviceIntakeLastLine =
  "No customer message, stock movement or service handoff. Payment is a recorded receipt, not a provider charge."
const serviceWorkLastLine =
  "No payment or handoff is recorded. Work history retains the original event identity."
/** Job, customer, balance and the fixed no-payment line every work review ends with. */
function serviceWorkFrame(
  lines: readonly string[],
  reason: string | undefined,
) {
  return (
    /^\S.* · \S/.test(lines[0] ?? "") &&
    lines.filter((line) => line.startsWith("Order balance: ")).length === 1 &&
    (!reason || lines.includes(`Reason: ${reason}`)) &&
    lines.at(-1) === serviceWorkLastLine
  )
}
function completeFacts(
  proposal: GeneralProposal,
  currencyCode: string,
  businessName: string,
) {
  const payload = proposal.payload
  const presentation = proposal.presentation
  const lines = proposal.review ?? []
  const finalSaleInstruction =
    payload.action === "sale_record" &&
    simpleSaleStep(payload) === "review" &&
    proposal.question === simpleSaleQuestions.review
  if (
    (!presentation && !linesOnlyReviewActions.has(payload.action)) ||
    !lines.length ||
    (proposal.question && !finalSaleInstruction) ||
    (proposal.choices?.length &&
      !(
        payload.action === "sale_record" &&
        simpleSaleStep(payload) === "review" &&
        proposal.choices.every((choice) => choice.text === "Change customer")
      ))
  )
    return false
  const shown = allStrings({ review: proposal.review, presentation }).join("\n")
  const has = (value: string | undefined) =>
    value === undefined || shown.includes(value)
  const scopedBook = presentation?.sections?.some((section) =>
    section.rows?.some(
      (row) =>
        row.label === "Book" &&
        row.value === `${businessName} · ${currencyCode}`,
    ),
  )
  const fact = (label: string) =>
    presentation?.facts?.find((entry) => entry.label === label)?.value
  const bookTimezone = presentation?.facts?.some(
    (fact) => fact.label === "Book timezone" && Boolean(fact.value.trim()),
  )
  if (
    shown.includes("…") ||
    /\b(?:truncated|partial (?:review|result)|more (?:rows|items) omitted|amount pending|price needed)\b/i.test(
      shown,
    )
  )
    return false
  switch (payload.action) {
    case "payment_links_create":
      return (
        presentation !== undefined &&
        currencyCode === "NGN" &&
        payload.orderIds.length <= 5 &&
        presentation.table?.rows.length === payload.orderIds.length &&
        presentation.table.columns.map((column) => column.label).join(",") ===
          "Order,Due" &&
        presentation.table.rows.every(
          (row) => row.cells.length === 2 && row.cells.every(Boolean),
        ) &&
        presentation.facts?.some(
          (fact) => fact.label === "Receiving account" && Boolean(fact.value),
        ) === true &&
        presentation.facts?.some(
          (fact) => fact.label === "Bank" && /ending \d{4}$/.test(fact.value),
        ) === true &&
        presentation.facts?.some(
          (fact) => fact.label === "Account holder" && Boolean(fact.value),
        ) === true &&
        presentation.facts?.some(
          (fact) =>
            fact.label === "Link lifetime" &&
            fact.value === `${payload.lifetimeMinutes} minutes`,
        ) === true &&
        presentation.facts?.some(
          (fact) =>
            fact.label === "Amount" &&
            fact.value ===
              (payload.allowPartial ? "Customer may pay part" : "Fixed amount"),
        ) === true &&
        shown.includes("no payment is recorded") &&
        shown.includes("All links are created together")
      )
    case "customer_create":
      return has(payload.name) && has(payload.phone) && has(payload.email)
    case "customer_update":
      return (
        Boolean(presentation?.table?.rows.length) &&
        [payload.name, payload.phone, payload.email].every(
          (value) => value === null || has(value),
        )
      )
    case "product_create":
      return (
        isSimpleProductCreate(payload) &&
        !payload.photoAssetId &&
        !payload.illustrationId &&
        payload.priceMinor !== undefined &&
        has(payload.name) &&
        has(payload.description) &&
        has(payload.canonicalUnitName) &&
        has(generalMoney(payload.priceMinor, currencyCode)) &&
        has(payload.openingStock)
      )
    case "money_transfer_simple":
      return (
        simpleTransferStep(payload) === "review" &&
        payload.attachmentIds.length === 0 &&
        Boolean(
          payload.bookId &&
            payload.effectiveAt &&
            payload.fromAccountName &&
            payload.toAccountName,
        ) &&
        has(payload.fromAccountName) &&
        has(payload.toAccountName) &&
        has(payload.note) &&
        has(payload.effectiveAt) &&
        has(generalMoney(payload.amountMinor ?? 0, currencyCode)) &&
        scopedBook &&
        bookTimezone &&
        /\b(?:recorded|already made|already paid)\b/i.test(shown)
      )
    case "expense_record_simple":
      return (
        simpleExpenseStep(payload) === "review" &&
        payload.attachmentIds.length === 0 &&
        Boolean(
          payload.effectiveAt && payload.bookId && payload.categoryName,
        ) &&
        has(payload.description) &&
        has(payload.categoryName) &&
        has(payload.accountName) &&
        has(payload.payeeName) &&
        has(payload.effectiveAt) &&
        has(generalMoney(payload.amountMinor ?? 0, currencyCode)) &&
        scopedBook &&
        bookTimezone &&
        (payload.paid
          ? /\bpaid\b/i.test(shown)
          : /\bunpaid|not paid\b/i.test(shown))
      )
    case "money_in_record":
      return (
        simpleMoneyInStep(payload) === "review" &&
        payload.attachmentIds.length === 0 &&
        Boolean(payload.effectiveAt && payload.accountName) &&
        has(payload.accountName) &&
        has(payload.description) &&
        has(payload.effectiveAt) &&
        has(generalMoney(payload.amountMinor ?? 0, currencyCode)) &&
        scopedBook &&
        bookTimezone &&
        /\bowner funds\b/i.test(shown)
      )
    case "sale_record":
      return (
        simpleSaleStep(payload) === "review" &&
        payload.attachmentIds.length === 0 &&
        Boolean(payload.accountName) &&
        has(payload.accountName) &&
        has(payload.customerName) &&
        has(payload.description) &&
        has(generalMoney(payload.receivedMinor ?? 0, currencyCode)) &&
        (payload.totalMinor === undefined ||
          has(generalMoney(payload.totalMinor, currencyCode))) &&
        scopedBook &&
        bookTimezone &&
        shown.includes("Time of confirmation") &&
        /\b(?:cash|bank.transfer)\b/i.test(shown) &&
        /\b(?:stock|catalog.free|no inventory)\b/i.test(shown)
      )
    case "stock_receive": {
      // Stock before → after in the balance unit, plus the entered unit and its factor.
      const onHand = fact("On hand")
      const unitCost = fact("Unit cost")
      return (
        presentation?.summary.amountLabel === "received" &&
        /^\+\S+ \S/.test(presentation.summary.amount ?? "") &&
        onHand !== undefined &&
        /^\S+ → \S+ \S/.test(onHand) &&
        lines.includes(`On hand: ${onHand}`) &&
        lines.some((line) =>
          /^Receive \S+ .+ · factor \S+ · canonical increase \S+$/.test(line),
        ) &&
        lines.includes(
          `Source: ${payload.source} · Reason: ${payload.reason}`,
        ) &&
        (payload.supplierName === undefined ||
          lines.some((line) =>
            line.startsWith(`Supplier name: ${payload.supplierName} (`),
          )) &&
        (payload.categories ?? []).every((category) => has(category.name)) &&
        payload.effectiveAt !== undefined &&
        lines.includes(`Effective: ${payload.effectiveAt}`) &&
        (payload.unitCostMinor === undefined
          ? unitCost === "unknown" &&
            shown.includes("no purchase payment recorded")
          : unitCost === generalMoney(payload.unitCostMinor, currencyCode) &&
            shown.includes("not purchase recognition or payment"))
      )
    }
    case "payment_record":
      // Order, amount and method, receiving account, and remaining balance.
      return (
        Boolean(payload.moneyAccountId) &&
        lines.length === (payload.note ? 5 : 4) &&
        /^\S.* · \S+$/.test(lines[0] ?? "") &&
        lines[1] ===
          `${generalMoney(payload.amountMinor, currencyCode)} · ${payload.method.replaceAll("_", " ")}` &&
        /^Received into: \S/.test(lines[2] ?? "") &&
        /^Balance after: [^-\s][^-]*$/.test(lines[3] ?? "") &&
        (!payload.note || lines[4] === payload.note)
      )
    case "product_price_update": {
      const was = fact("Was")
      const next = generalMoney(payload.priceMinor, currencyCode)
      return (
        presentation?.summary.amountLabel === "new price" &&
        presentation.summary.amount === next &&
        was !== undefined &&
        was !== "No fixed price" &&
        was !== next &&
        lines.includes(`Price: ${was} → ${next}`) &&
        lines.includes(`Reason: ${payload.reason}`) &&
        shown.includes("Applies in every Store") &&
        shown.includes("Past orders keep their saved prices")
      )
    }
    case "order_attachment_add":
      // The order, what is added (file or note) and that the order itself is unchanged.
      return (
        lines.length === (payload.note ? 3 : 2) &&
        (payload.attachmentId
          ? /^Attach this (?:photo|file) to \S+ · \S/.test(lines[0] ?? "")
          : Boolean(payload.note) &&
            /^Add a note to \S+ · \S/.test(lines[0] ?? "")) &&
        (!payload.note || lines[1] === `Note: ${payload.note}`) &&
        lines.at(-1) ===
          "Adds it to the order's Notes & photos. The order's items, totals and payments do not change."
      )
    case "service_intake": {
      // Customer, every line with its price and work, total, payment and balance, promise, effects.
      const count = payload.lines.length
      const payment = lines[count + 2] ?? ""
      return (
        lines.length >= count + 7 &&
        /^Customer: \S/.test(lines[0] ?? "") &&
        has(payload.customerName) &&
        has(payload.customerPhone) &&
        lines
          .slice(1, count + 1)
          .every((line) =>
            /^\S.*: \S+ × .+ = .+ · (?:tracked Job Line|charge-only Order line) · authorization \S.*\.$/.test(
              line,
            ),
          ) &&
        /^Subtotal .+ · service charge .+ · total .+\.$/.test(
          lines[count + 1] ?? "",
        ) &&
        payment.startsWith(
          `Initial recorded payment ${generalMoney(payload.initialPaymentMinor ?? 0, currencyCode)}`,
        ) &&
        / · balance .+\.$/.test(payment) &&
        lines.some((line) => line.startsWith("Assignee: ")) &&
        lines.some((line) => line.startsWith("Promised time: ")) &&
        lines.at(-1) === serviceIntakeLastLine
      )
    }
    case "service_job_line_transition":
      // The exact line, its current state and the next one.
      return (
        serviceWorkFrame(lines, payload.reason) &&
        /^\S.* · \S.* · \S+\. Current work: \S+\. Authorization: \S+\.$/.test(
          lines[1] ?? "",
        ) &&
        lines[2] === `Next work state: ${payload.toStatus}.` &&
        !lines.some((line) => line.startsWith("Assign to "))
      )
    case "service_job_assign":
      // The job and the named person; no work state changes.
      return (
        serviceWorkFrame(lines, payload.reason) &&
        lines.filter((line) =>
          /^Assign to \S.*\. Assignment history is retained\.$/.test(line),
        ).length === 1 &&
        !lines.some((line) => line.startsWith("Next work state: "))
      )
    case "shipment_create": {
      // Every line's quantity, price, freight share and landed cost, the rates, freight and total.
      const count = payload.lines.length
      return (
        lines.length === count + 5 &&
        / · from \S/.test(lines[0] ?? "") &&
        payload.lines.every((line, index) => {
          const row = lines[index + 1] ?? ""
          return (
            row.includes(
              ` · ${exact(line.expectedQuantity)} at ${line.sourceCurrencyCode} ${exact(line.sourceUnitPrice)} · `,
            ) &&
            row.includes(" freight = ") &&
            / each(?: · new item, .+)?$/.test(row)
          )
        }) &&
        (lines[count + 1] ?? "").startsWith("Rates: ") &&
        payload.rates.every((rate) =>
          (lines[count + 1] ?? "").includes(
            `1 ${rate.currencyCode} = ${rate.rate} `,
          ),
        ) &&
        (lines[count + 2] ?? "").startsWith(
          `Freight ${payload.freightCurrencyCode} ${exact(payload.freightAmount)} = `,
        ) &&
        (lines[count + 2] ?? "").endsWith(", split by value.") &&
        /^Landed total .+\.$/.test(lines[count + 3] ?? "") &&
        lines.at(-1) === shipmentCreateLastLine
      )
    }
    case "shipment_receive": {
      // What arrived of what was expected, stock before → after, the unpaid bill and what is left.
      const count = payload.lines.length
      return (
        lines.length === count * 2 + 4 &&
        / · from \S/.test(lines[0] ?? "") &&
        payload.lines.every((line, index) => {
          const row = lines[index * 2 + 1] ?? ""
          return (
            row.includes(` · ${exact(line.quantity)} of `) &&
            row.includes(" still expected · ") &&
            /^Stock \S+ → \S+ \S/.test(lines[index * 2 + 2] ?? "")
          )
        }) &&
        /^Bill to .+: .+ · unpaid\.$/.test(lines[count * 2 + 1] ?? "") &&
        /^(?:Still expected: .+|Nothing else is expected)\.$/.test(
          lines[count * 2 + 2] ?? "",
        ) &&
        lines.at(-1) === shipmentReceiveLastLine
      )
    }
    case "shipment_cost_adjust":
      // The line still expected, the cost and reason, landed before → after, and what keeps its cost.
      return (
        lines.length === 5 &&
        / · from \S/.test(lines[0] ?? "") &&
        / still expected$/.test(lines[1] ?? "") &&
        (lines[2] ?? "").startsWith(
          BigInt(payload.amountMinor) < BigInt(0) ? "−" : "+",
        ) &&
        (lines[2] ?? "").includes(` ${payload.reason} · `) &&
        /^Landed .+ → .+ each for what is still expected\.$/.test(
          lines[3] ?? "",
        ) &&
        (lines[4] ?? "").endsWith("Past sales don't change.")
      )
    default:
      return false
  }
}
const titles: Partial<Record<GeneralAction["action"], string>> = {
  payment_links_create: "Create payment links",
  customer_create: "Add saved customer",
  customer_update: "Update saved customer",
  product_create: "Add simple product",
  money_transfer_simple: "Record money transfer already made",
  expense_record_simple: "Record simple expense",
  money_in_record: "Record owner funds already received",
  sale_record: "Record simple sale",
  stock_receive: "🧾 Review stock received",
  payment_record: "🧾 Review payment already received",
  product_price_update: "🧾 Review price change",
  order_attachment_add: "🧾 Review addition to order",
  service_intake: "🧾 Review job",
  service_job_line_transition: "🧾 Review work update",
  service_job_assign: "🧾 Review work assignment",
  shipment_create: "🧾 Review shipment",
  shipment_receive: "🧾 Receive shipment",
  shipment_cost_adjust: "🧾 Cost change",
}
/** Fixed channel wording for effects the canonical lines leave implicit. */
const channelNotes: Partial<Record<GeneralAction["action"], string>> = {
  stock_receive: "Adds stock only. No bill or payment is recorded.",
  payment_record:
    "Records money already received for this order. No bill or other payment is recorded.",
  service_intake:
    "Creates the job with its work queued. Nothing is sent to the customer.",
}
/** Exact current canonical app review in, token-free channel projection out. Does not grant authority. */
export function projectChannelProposalReview(
  sourceRow: ChannelProposalSource,
  unparsed: unknown,
  scope: { businessName: string; storeName: string; currencyCode: string },
  now = Date.now(),
): ChannelProposalReviewProjection {
  const parsed = generalProposalSchema.safeParse(unparsed)
  if (!parsed.success || !Number.isFinite(now)) return fallback("unavailable")
  const proposal = parsed.data
  if (
    sourceRow.status !== "PENDING" ||
    proposal.status !== "PENDING" ||
    sourceRow.actionVersion !== 1 ||
    proposal.id !== sourceRow.id ||
    proposal.revision !== sourceRow.revision ||
    sourceRow.action !== proposal.payload.action ||
    sourceRow.payloadHash !== proposalDigest(proposal.payload) ||
    !proposal.approvalToken ||
    sourceRow.expiresAt.getTime() !== Date.parse(proposal.expiresAt) ||
    sourceRow.expiresAt.getTime() <= now
  )
    return fallback("unavailable")
  const source: WhatsAppProposalSource = {
    proposalId: sourceRow.id,
    revision: sourceRow.revision,
    payloadHash: sourceRow.payloadHash,
  }
  if (
    !whatsAppProposalSourceSchema.safeParse(source).success ||
    !completeFacts(proposal, scope.currencyCode, scope.businessName)
  )
    return fallback("incomplete")
  const title = titles[proposal.payload.action]
  if (!title) return fallback("incomplete")
  const review: WhatsAppActionReview = {
    source,
    title,
    businessName: scope.businessName,
    storeName: scope.storeName,
    reviewLines: [
      ...(proposal.review ?? []),
      ...(channelNotes[proposal.payload.action]
        ? [channelNotes[proposal.payload.action] as string]
        : []),
    ],
    presentation: proposal.presentation,
    complete: true,
    requiresPresentation: !linesOnlyReviewActions.has(proposal.payload.action),
    expiresAt: proposal.expiresAt,
  }
  return renderWhatsAppActionReviewBody(review, { now }).kind === "review"
    ? { kind: "review", review }
    : fallback("incomplete")
}

/** Uses the existing canonical review builder; caller still owns locked binding/proposal authority. */
export async function buildChannelProposalReview(
  ctx: GeneralContext,
  row: ProposalRow,
  now = Date.now(),
): Promise<ChannelProposalReviewProjection> {
  const secret = process.env.ASSISTANT_APPROVAL_SIGNING_KEY ?? ""
  if (
    secret.length < 32 ||
    !Number.isFinite(now) ||
    !isProposalApprovalValid(
      row,
      proposalApprovalToken(row, secret),
      secret,
      new Date(now),
    )
  )
    return fallback("unavailable")
  const proposal = await (
    await import("./general-proposals")
  ).generalProposalWithReview(ctx, row)
  return projectChannelProposalReview(
    row,
    proposal,
    {
      businessName: ctx.tenantContext.tenant.name,
      storeName: ctx.tenantContext.activeStore?.name ?? "",
      currencyCode:
        ctx.tenantContext.activeStore?.currencyCode ??
        ctx.tenantContext.tenant.currencyCode,
    },
    now,
  )
}
