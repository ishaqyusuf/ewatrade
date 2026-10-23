import { whatsAppDraftCollectionReply } from "@ewatrade/assistant/channels/collection"
import {
  type SimpleSale,
  isNonSaleMoneyIntent,
  isSimpleSaleIntent,
  normalizedSaleName,
  saleFactsFromText,
  simpleSaleAction,
  simpleSaleQuestions,
  simpleSaleStep,
} from "@ewatrade/assistant/general/contracts"
import { generalProposalWhere } from "@ewatrade/db/assistant-general"
import { catalogFreeLineDescriptionError } from "@ewatrade/utils/catalog-free-lines"
import { isLinkedAssistantIdentity } from "./channel-principal"
import type { GeneralContext } from "./general-context"
import { assertGeneralAction, requireGeneralScope } from "./general-context"
import { draftGeneralProposal, editGeneralProposal } from "./general-proposals"
import { simpleSaleOptions } from "./general-simple-sale"
import { proposalDigest } from "./proposal-security"

type Message = { id: string; role: string; parts: unknown }

// While answering “What was sold?”, only a complete field command may edit
// money. A quantity followed by goods (including “transfer sheets”) is text.
const editAmount =
  "[₦N]?\\s*(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?(?:\\s*(?:k|thousand|m|million))?"
const extraAmountField = `(?:paid|received|amount|total)(?:\\s+is)?\\s*[:=]?\\s*${editAmount}`
const destinationName = "[\\p{L}][\\p{L}\\p{N} .’'-]*"
const destinationField = `(?:(?:paid|transfer(?:red)?)\\s+(?:to|into)\\s+${destinationName}|(?:to|into|in)\\s+${destinationName}\\s+account)`
const amountFieldEdit = new RegExp(
  `^(?:paid|received|amount|total|sales?|order|fully paid|part(?:ly)?[ -]?paid|partial payment)(?:\\s+is)?\\s*[:=]?\\s*${editAmount}(?:\\s+${extraAmountField})?(?:\\s+${destinationField})?\\s*$`,
  "iu",
)

function imageIds(message: Message | undefined) {
  if (!message || !Array.isArray(message.parts)) return []
  return message.parts.flatMap((part) =>
    part?.type === "data-setup-attachment" && part.data?.kind === "IMAGE"
      ? [part.data.attachmentId as string]
      : [],
  )
}
/** Common receipt/caption conversation is deterministic and never sends image data to a model. */
export async function handleSimpleSaleChat(
  ctx: GeneralContext,
  input: {
    conversationId: string
    messageId: string
    text: string
    imageIds: string[]
    history: Message[]
    choice?: { proposalId: string; revision: number; text: string }
  },
) {
  let text = input.text.trim()
  if (!text && input.imageIds.length)
    return { text: "What is this for?", proposalId: null }
  const directed = text.match(/^Continue sale ([^:]+):\s*([\s\S]*)$/)
  if (input.choice) text = input.choice.text
  else if (directed) text = directed[2] ?? ""
  if (!input.choice && !directed && isNonSaleMoneyIntent(text)) return null
  // A channel confirmation must identify an exact delivered review outside this draft helper.
  if (
    isLinkedAssistantIdentity(ctx.session) &&
    /^(?:proceed|confirm|cancel|yes|go ahead|done|save(?: it| sale)?)[.!]*$/i.test(
      text.trim(),
    )
  )
    return null
  const scope = requireGeneralScope(ctx)
  const pending = await ctx.db.assistantActionProposal.findFirst({
    where: {
      ...generalProposalWhere(scope),
      conversationId: input.conversationId,
      action: "sale_record",
      status: "PENDING",
      expiresAt: { gt: new Date() },
      ...(input.choice
        ? { id: input.choice.proposalId, revision: input.choice.revision }
        : directed
          ? { id: directed[1] }
          : {}),
    },
    orderBy: { createdAt: "desc" },
  })
  if (input.choice && !pending)
    return {
      text: "That order card changed. Use its latest choices or open the form.",
      proposalId: null,
    }
  const previousUser = [...input.history]
    .reverse()
    .find(
      (message) => message.role === "user" && message.id !== input.messageId,
    )
  const previousText = Array.isArray(previousUser?.parts)
    ? previousUser.parts
        .filter((part) => part?.type === "text")
        .map((part) => part.text)
        .join(" ")
        .trim()
    : ""
  const pendingImages = !previousText ? imageIds(previousUser) : []
  const newReceipt =
    (input.imageIds.length > 0 || pendingImages.length > 0) &&
    isSimpleSaleIntent(text)
  const usePending =
    pending && !newReceipt && !/^new (?:sale|order)\b/i.test(text)
  if (!usePending && !isSimpleSaleIntent(text)) return null
  assertGeneralAction(ctx, "sale_record")
  let sale: SimpleSale = usePending
    ? simpleSaleAction.parse(pending.payload)
    : simpleSaleAction.parse({
        action: "sale_record",
        customerChoice: "walk_in",
        attachmentIds: input.imageIds.length
          ? input.imageIds
          : !previousText
            ? imageIds(previousUser)
            : [],
      })
  // Older drafts also get the implicit Walk-in choice when no name was supplied.
  if (!sale.customerName && !sale.customerId && !sale.customerChoice)
    sale.customerChoice = "walk_in"
  const step = simpleSaleStep(sale)
  // The answer to this explicit question is owner-authored description, not
  // an amount/customer inference (e.g. "2 bags of rice"). Explicit field
  // edits and the existing choice/confirmation commands keep their meanings.
  const fieldEdit =
    amountFieldEdit.test(text) ||
    /(?:^|\n)[\t ]*(?:\d+[.)][\t ]+)?(?:amount|received|total|account|customer|description|items?|sold)[\t ]*:/i.test(
      text,
    ) ||
    /^(?:fully paid|part(?:ly)?[ -]?paid|partial payment)$/i.test(text) ||
    /^(?:account(?:\s+is|:)|customer(?:\s+is|:)|(?:paid|transfer(?:red)?)\s+(?:to|into|by)\b|(?:to|into|in)\s+.+\s+account\b)/i.test(
      text,
    ) ||
    /^[₦N]?\s*[\d,.]+(?:\s*(?:k|thousand|m|million))?\s*$/i.test(text)
  const controlReply =
    /^(?:use (?:account|customer):|change customer$|create this account$|(?:it(?:'s| is) )?new(?: customer)?$|walk[ -]?in$|(?:save(?: it| sale)?|confirm|proceed|done|yes|go ahead|cancel)[.!]*$)/i.test(
      text,
    )
  const descriptionReply = Boolean(
    usePending &&
      step === "description" &&
      !input.choice &&
      !fieldEdit &&
      !controlReply,
  )
  if (descriptionReply) {
    const error = catalogFreeLineDescriptionError({
      kind: "quick_sale",
      description: text,
    })
    if (error) return { text: error, proposalId: pending?.id ?? null }
    sale = { ...sale, description: text }
  }
  const facts = descriptionReply ? {} : saleFactsFromText(text)
  if (
    facts.customerName &&
    normalizedSaleName(facts.customerName) !==
      normalizedSaleName(sale.customerName ?? "")
  ) {
    sale.customerId = undefined
    sale.customerChoice = undefined
  }
  if (
    facts.accountName &&
    normalizedSaleName(facts.accountName) !==
      normalizedSaleName(sale.accountName ?? "")
  ) {
    sale.moneyAccountId = undefined
    sale.createAccount = false
  }
  sale = { ...sale, ...facts }
  const options = await simpleSaleOptions(ctx, sale)
  const accountId = text.match(/^Use account:\s*(\S+)$/i)?.[1]
  const customerId = text.match(/^Use customer:\s*(\S+)$/i)?.[1]
  if (accountId) {
    const account = options.accounts.find(
      (account) => account.id === accountId && !account.paused,
    )
    if (!account)
      return {
        text: "That account is unavailable. Choose another account or open the form.",
        proposalId: pending?.id ?? null,
      }
    sale = {
      ...sale,
      moneyAccountId: account.id,
      accountName: account.name,
      createAccount: false,
      method: account.purpose === "CASH" ? "cash" : "bank_transfer",
    }
  } else if (customerId) {
    const customer = await ctx.db.customer.findFirst({
      where: { id: customerId, tenantId: scope.tenantId },
      select: { id: true, name: true },
    })
    if (!customer)
      return {
        text: "That customer is unavailable. Choose another customer or Walk-in.",
        proposalId: pending?.id ?? null,
      }
    sale = {
      ...sale,
      customerId: customer.id,
      customerName: customer.name,
      customerChoice: undefined,
    }
  } else if (/^change customer$/i.test(text)) {
    sale.customerName = undefined
    sale.customerId = undefined
    sale.customerChoice = "new"
  } else if (/^create this account$/i.test(text) && sale.accountName)
    sale.createAccount = true
  else if (
    /^(?:it(?:'s| is) )?new(?: customer)?$/i.test(text) &&
    sale.customerName
  ) {
    sale.customerChoice = "new"
    sale.customerId = undefined
  } else if (
    !descriptionReply &&
    usePending &&
    !isSimpleSaleIntent(text) &&
    !Object.keys(facts).length
  ) {
    if (
      step === "account" ||
      (step === "received" &&
        !sale.accountName &&
        !sale.moneyAccountId &&
        /^[\p{L}][\p{L}\p{N} .’'-]{0,159}$/u.test(text) &&
        !/[?]/.test(text))
    ) {
      sale = {
        ...sale,
        accountName: text.replace(/^(?:use |account(?: is|:)?)\s*/i, ""),
        moneyAccountId: undefined,
        createAccount: false,
        method: /^cash$/i.test(text) ? "cash" : "bank_transfer",
      }
    } else if (step === "customer")
      sale = {
        ...sale,
        customerName: text,
        customerId: undefined,
        customerChoice: undefined,
      }
    else if (
      step === "total" &&
      /^\s*[₦N]?\s*[\d,.]+(?:\s*k)?\s*$/i.test(text)
    ) {
      const paid = saleFactsFromText(text).receivedMinor
      sale.totalMinor = paid
    } else if (!/^(?:save(?: sale)?|confirm|done)$/i.test(text)) return null
  }
  // A bare numeric reply to the full-total question is a total, not another payment.
  if (
    usePending &&
    step === "total" &&
    /^\s*[₦N]?\s*[\d,.]+(?:\s*k)?\s*$/i.test(text)
  ) {
    sale.totalMinor = facts.receivedMinor
    sale.receivedMinor = simpleSaleAction.parse(pending.payload).receivedMinor
  }
  const parsed = simpleSaleAction.safeParse(sale)
  if (!parsed.success)
    return {
      text: "Check the name and amounts, or open the order form to finish.",
      proposalId: pending?.id ?? null,
    }
  const result = usePending
    ? await editGeneralProposal(ctx, {
        proposalId: pending.id,
        revision: pending.revision,
        payload: parsed.data,
      })
    : await draftGeneralProposal(ctx, input.conversationId, parsed.data)
  const proposalId = "proposalId" in result ? result.proposalId : result.id
  const prepared = simpleSaleAction.parse(
    "payload" in result ? result.payload : parsed.data,
  )
  return {
    text: isLinkedAssistantIdentity(ctx.session)
      ? whatsAppDraftCollectionReply(prepared)
      : simpleSaleQuestions[simpleSaleStep(prepared)],
    proposalId,
    proposalSource: {
      proposalId,
      revision: result.revision,
      payloadHash: proposalDigest(result.payload),
    },
  }
}
