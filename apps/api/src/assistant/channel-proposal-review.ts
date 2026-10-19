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
function completeFacts(
  proposal: GeneralProposal,
  currencyCode: string,
  businessName: string,
) {
  const payload = proposal.payload
  const presentation = proposal.presentation
  const finalSaleInstruction =
    payload.action === "sale_record" &&
    simpleSaleStep(payload) === "review" &&
    proposal.question === simpleSaleQuestions.review
  if (
    !presentation ||
    !proposal.review?.length ||
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
  const scopedBook = presentation.sections?.some((section) =>
    section.rows?.some(
      (row) =>
        row.label === "Book" &&
        row.value === `${businessName} · ${currencyCode}`,
    ),
  )
  const bookTimezone = presentation.facts?.some(
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
    case "customer_create":
      return has(payload.name) && has(payload.phone) && has(payload.email)
    case "customer_update":
      return (
        Boolean(presentation.table?.rows.length) &&
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
    default:
      return false
  }
}
const titles: Partial<Record<GeneralAction["action"], string>> = {
  customer_create: "Add saved customer",
  customer_update: "Update saved customer",
  product_create: "Add simple product",
  money_transfer_simple: "Record money transfer already made",
  expense_record_simple: "Record simple expense",
  money_in_record: "Record owner funds already received",
  sale_record: "Record simple sale",
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
    reviewLines: proposal.review ?? [],
    presentation: proposal.presentation,
    complete: true,
    requiresPresentation: true,
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
