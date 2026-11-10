import { z } from "zod"
import type { GeneralAction } from "../general/contracts"
import { exactPlainText, whatsAppProposalSourceSchema } from "./action-review"

type Order = Extract<GeneralAction, { action: "order_create" }>
export const WHATSAPP_ORDER_REVIEW_VERSION = "whatsapp-order-review-v1"
export const orderReviewPageReferenceSchema = z
  .object({
    type: z.literal("data-whatsapp-order-review-page"),
    data: z
      .object({
        source: whatsAppProposalSourceSchema,
        index: z.number().int().min(0).max(60),
      })
      .strict(),
  })
  .strict()
export function nativeOrderChoiceIssues(p: Order): string[] {
  const issues: string[] = []
  if (!p.lines.length || p.lines.some((line) => "custom" in line))
    issues.push(
      "Choose the exact saved product, option and selling unit for every line.",
    )
  if (!p.customerChoice)
    issues.push("Choose a saved customer or explicitly agree Walk-in.")
  if (p.customerChoice === "saved" && !p.customerId)
    issues.push(
      "Select the exact saved customer. A new customer needs a separate confirmation.",
    )
  if (p.customerChoice === "walk_in" && (p.customerId || p.customerName))
    issues.push("Walk-in must not also select or create a named customer.")
  if (!p.paymentChoice)
    issues.push("Was the sale unpaid, part paid or paid in full?")
  if (p.paymentChoice === "unpaid" && p.initialPayment)
    issues.push("Unpaid cannot also record a received payment.")
  if (
    (p.paymentChoice === "partial" || p.paymentChoice === "full") &&
    !p.initialPayment
  )
    issues.push("Enter the amount already received and its payment method.")
  if (p.initialPayment && !p.initialPayment.moneyAccountId)
    issues.push("Choose the existing account that received this payment.")
  if (p.fulfillNow === undefined)
    issues.push(
      "Were the goods handed over now or will they be collected later?",
    )
  return issues
}
/** Exact canonical lines only; no clipping or model summaries. Each stock line stays with its item. */
export function renderNativeOrderReviewPages(input: {
  source: z.infer<typeof whatsAppProposalSourceSchema>
  businessName: string
  storeName: string
  expiresAt: string
  lines: readonly string[]
  itemCount: number
}): string[] | undefined {
  const { lines, itemCount } = input
  if (itemCount < 1 || itemCount > 30 || lines.length < itemCount * 3 + 7)
    return
  const frame = `Business: ${input.businessName}\nStore: ${input.storeName}\nDraft revision: ${input.source.revision}\nReview expires: ${input.expiresAt} (UTC).`
  if (![frame, ...lines].every(exactPlainText)) return
  const body = `🧾 Review sale\n${frame}\n\n${lines.join("\n")}`
  // Dispatch appends bounded typed instructions and up to three native controls.
  if (body.length <= 680) return [body]
  const groups: string[] = []
  let group = ""
  for (let index = 0; index < itemCount; index++) {
    const item = lines.slice(index * 3, index * 3 + 3).join("\n")
    if (`Review sale · page 61 of 61\n${frame}\n\n${item}`.length > 680) return
    if (
      group &&
      `Review sale · page 61 of 61\n${frame}\n\n${group}\n\n${item}`.length >
        680
    ) {
      groups.push(group)
      group = ""
    }
    group += `${group ? "\n\n" : ""}${item}`
  }
  if (group) groups.push(group)
  const summary = lines.slice(itemCount * 3).join("\n")
  if (`Review sale · page 61 of 61\n${frame}\n\n${summary}`.length > 680) return
  groups.push(summary)
  return groups.map(
    (facts, index) =>
      `Review sale · page ${index + 1} of ${groups.length}\n${frame}\n\n${facts}`,
  )
}
export const orderReviewPageCommandSchema = z
  .object({
    type: z.literal("order_review_page"),
    sourceOutboxId: z.string().min(1).max(128),
    direction: z.enum(["next", "previous"]),
    replyToMessageId: z.string().min(1).max(256),
  })
  .strict()
export function orderReviewPageButtonId(
  outboxId: string,
  direction: "next" | "previous",
) {
  return `ewa-wa-order-page-v1:${outboxId}:${direction}`
}
export function parseOrderReviewPageIntent(event: {
  quickActionId?: string
  text?: string
  replyToMessageId?: string
}) {
  const match =
    /^ewa-wa-order-page-v1:([A-Za-z0-9_-]{1,128}):(next|previous)$/.exec(
      event.quickActionId ?? "",
    )
  const typed = /^(Next|Previous) sale page ([A-Za-z0-9_-]{1,128})$/i.exec(
    event.text?.trim() ?? "",
  )
  if (!match && !typed)
    return event.quickActionId?.startsWith("ewa-wa-order-page-")
      ? { type: "invalid_order_review_page" as const }
      : null
  const parsed = orderReviewPageCommandSchema.safeParse({
    type: "order_review_page",
    sourceOutboxId: match?.[1] ?? typed?.[2],
    direction: match?.[2] ?? typed?.[1]?.toLowerCase(),
    replyToMessageId: event.replyToMessageId,
  })
  return parsed.success
    ? parsed.data
    : { type: "invalid_order_review_page" as const }
}
