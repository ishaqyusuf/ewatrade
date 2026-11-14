import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import {
  type GeneralAction,
  generalMoney,
} from "@ewatrade/assistant/general/contracts"
import {
  type ReceiptAccount,
  type ReceiptFacts,
  type ReceiptOrder,
  type ReceiptOutcome,
  type ReceiptPurpose,
  matchReceipt,
  matchReceiptAccount,
  matchReceiptOrder,
  receiptNameMatches,
  receiptPurpose,
} from "@ewatrade/assistant/general/receipt-match"
import {
  ensureCustomerLedgerAccount,
  resolveOrderScope,
} from "@ewatrade/db/queries"
import {
  type ChatReceiptExtraction,
  type ChatReceiptReadResult,
  type ChatReceiptReader,
  chatReceiptAmountMinor,
  createChatReceiptReader,
  normalizedBankReference,
  parseChatReceiptExtraction,
} from "@ewatrade/payments/chat-receipt"
import { TRPCError } from "@trpc/server"
import sharp from "sharp"
import {
  setupAttachmentStorage,
  setupAttachmentTarget,
} from "./attachment-storage"
import {
  type GeneralContext,
  canDraftGeneralCapability,
  requireGeneralScope,
} from "./general-context"
import { draftGeneralProposal } from "./general-proposals"
import {
  handleReceiptApprovalReply,
  offerReceiptApproval,
} from "./general-receipt-approval"
import {
  type ReceiptEnvironment as Environment,
  receiptReadingAvailable,
  receiptReadingConfig,
} from "./general-receipt-availability"
import { simpleExpenseOptions } from "./general-simple-expense"
import { proposalDigest } from "./proposal-security"

type Attachment = {
  id: string
  kind: string
  contentType: string
  fileName: string
  sizeBytes: number
  contentDigest: string
  conversationId: string
  tenantId: string
  status?: string
  storagePath?: string | null
}
export type ReceiptChatReply = {
  text: string
  proposalId?: string
  proposalSource?: { proposalId: string; revision: number; payloadHash: string }
  /** Receipt facts for the model when the caption asks for more than a match (a new order). */
  modelNote?: string
}

const FOLLOW_UP_MS = 30 * 60_000
const OWING = ["PENDING", "AUTHORIZED", "FAILED", "PARTIALLY_PAID"] as const

/** ₦62,000 in chat (no kobo unless needed). */
function naira(minor: number | bigint, currencyCode: string) {
  return generalMoney(minor, currencyCode).replace(/\.00$/, "")
}
const title = (value: string | null) =>
  (value ?? "").replace(/\s+/g, " ").trim()

async function readFile(
  ctx: GeneralContext,
  attachment: Attachment,
  reader: ChatReceiptReader,
) {
  const scope = requireGeneralScope(ctx)
  const bytes = await setupAttachmentStorage(scope.dataClassification).read({
    target: setupAttachmentTarget(attachment),
  })
  if (attachment.kind === "PDF")
    return reader({
      file: {
        kind: "pdf",
        bytes,
        fileName: attachment.fileName || "receipt.pdf",
      },
      abortSignal: AbortSignal.timeout(40_000),
    })
  const image = sharp(bytes, {
    limitInputPixels: 40_000_000,
    animated: false,
  }).timeout({ seconds: 8 })
  const normalized = await image
    .rotate()
    .resize({
      width: 1600,
      height: 2400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer()
  return reader({
    file: { kind: "image", bytes: normalized, contentType: "image/jpeg" },
    abortSignal: AbortSignal.timeout(40_000),
  })
}

async function businessAccounts(ctx: GeneralContext) {
  const scope = requireGeneralScope(ctx)
  const currencyCode =
    ctx.tenantContext.activeStore?.currencyCode ??
    ctx.tenantContext.tenant.currencyCode
  const book = await ctx.db.financeBook.findUnique({
    where: {
      tenantId_currencyCode: { tenantId: scope.tenantId, currencyCode },
    },
    select: { id: true },
  })
  if (!book) return { bookId: null, accounts: [] as ReceiptAccount[] }
  const accounts = await ctx.db.financeAccount.findMany({
    where: {
      bookId: book.id,
      archivedAt: null,
      kind: "ASSET",
      purpose: { in: ["CASH", "BANK", "CLEARING"] },
    },
    select: {
      id: true,
      name: true,
      bankName: true,
      bankAccountNumber: true,
      bankAccountHolder: true,
    },
    orderBy: { code: "asc" },
  })
  return { bookId: book.id, accounts }
}

async function owingOrders(ctx: GeneralContext): Promise<ReceiptOrder[]> {
  const scope = requireGeneralScope(ctx)
  const visibility = await resolveOrderScope(ctx.db, {
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    activeStoreId: scope.storeId,
    userId: scope.userId,
    role: ctx.tenantContext.membership.role,
    allowedStoreIds: ctx.tenantContext.stores.map((store) => store.id),
  })
  const rows = await ctx.db.commercialOrder.findMany({
    where: {
      ...visibility,
      status: { notIn: ["CANCELLED", "REFUNDED"] },
      paymentStatus: { in: [...OWING] },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      customerId: true,
      totalMinor: true,
      amountPaidMinor: true,
    },
    take: 300,
  })
  return rows
    .map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      customerName: row.customerName,
      customerId: row.customerId,
      balanceMinor: Number(row.totalMinor) - Number(row.amountPaidMinor),
    }))
    .filter((row) => row.balanceMinor > 0)
}

function factsOf(
  extraction: ChatReceiptExtraction,
  caption: string | null,
): ReceiptFacts {
  return {
    amountMinor: chatReceiptAmountMinor(extraction.amountText),
    senderName: extraction.senderName,
    senderAccount: extraction.senderAccount,
    senderBank: extraction.senderBank,
    recipientName: extraction.recipientName,
    recipientAccount: extraction.recipientAccount,
    recipientBank: extraction.recipientBank,
    narration: extraction.narration,
    caption,
  }
}

function effectiveAt(extraction: ChatReceiptExtraction) {
  const parsed = extraction.dateTimeIso
    ? new Date(extraction.dateTimeIso)
    : null
  return parsed &&
    !Number.isNaN(parsed.getTime()) &&
    parsed.getTime() <= Date.now() + 5 * 60_000 &&
    parsed.getTime() > Date.now() - 60 * 86_400_000
    ? parsed.toISOString()
    : undefined
}

function receiptNote(extraction: ChatReceiptExtraction, currency: string) {
  const amount = chatReceiptAmountMinor(extraction.amountText)
  const from = title(extraction.senderName)
  const reference = title(extraction.bankReference)
  return [
    `Receipt: ${amount ? naira(amount, currency) : "amount"}${from ? ` from ${from}` : ""}`,
    reference ? `ref ${reference.slice(0, 60)}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 400)
}

/** Order intent in a caption (“20 crates of eggs for this customer”): the model prepares the order. */
function captionAsksForOrder(caption: string | null) {
  return Boolean(
    caption &&
      /\b\d+(?:\.\d+)?\s*(?:x\s*)?[a-z]{2,}/i.test(caption) &&
      !/^\s*[A-Z]{1,4}-?\d{3,8}\s*$/i.test(caption),
  )
}

function source(result: {
  proposalId: string
  revision: number
  payload: unknown
}) {
  return {
    proposalId: result.proposalId,
    revision: result.revision,
    payloadHash: proposalDigest(result.payload),
  }
}

type ReadRow = Awaited<ReturnType<typeof loadRow>>
async function loadRow(ctx: GeneralContext, id: string) {
  return ctx.db.assistantReceiptRead.findUniqueOrThrow({ where: { id } })
}
async function setRow(
  ctx: GeneralContext,
  id: string,
  data: Parameters<
    GeneralContext["db"]["assistantReceiptRead"]["update"]
  >[0]["data"],
) {
  await ctx.db.assistantReceiptRead.update({ where: { id }, data })
}

/** Drafts the reviewed action for a decided outcome, or asks the one missing fact. */
async function act(
  ctx: GeneralContext,
  conversationId: string,
  row: NonNullable<ReadRow>,
  extraction: ChatReceiptExtraction,
  outcome: ReceiptOutcome,
  bookId: string | null,
  accounts: ReceiptAccount[],
  categoryNames: string[] = [],
): Promise<ReceiptChatReply> {
  const currency =
    ctx.tenantContext.activeStore?.currencyCode ??
    ctx.tenantContext.tenant.currencyCode
  const amount = Number(row.amountMinor ?? 0)
  const money = naira(amount, currency)
  const from = title(extraction.senderName) || "the sender"
  const to = title(extraction.recipientName) || "the recipient"
  const draft = async (payload: unknown, reply: string, extra = {}) => {
    try {
      const result = await draftGeneralProposal(ctx, conversationId, payload)
      await setRow(ctx, row.id, {
        status: "DRAFTED",
        proposalId: result.proposalId,
        outcome: outcome as never,
        ...extra,
      })
      return {
        text: reply,
        proposalId: result.proposalId,
        proposalSource: source(result),
      }
    } catch (error) {
      if (error instanceof TRPCError || error instanceof Error)
        return { text: `⚠️ ${error.message}` }
      throw error
    }
  }
  const can = (action: GeneralAction["action"]) =>
    canDraftGeneralCapability(ctx, capabilityForAction(action))
  const needsOwner = {
    text: [
      `🧾 ${money} from ${from}.`,
      "Recording this needs an owner or admin. Forward the receipt to them.",
    ].join("\n"),
  }
  /** Staff without the permission: offer to send the exact draft for approval (19l). */
  const askOwner = async (
    payload: GeneralAction,
    summary: string,
    detail?: string,
  ) =>
    (await offerReceiptApproval(ctx, {
      rowId: row.id,
      payload,
      summary,
      detail,
      outcome,
    })) ?? needsOwner
  switch (outcome.kind) {
    case "unreadable":
      await setRow(ctx, row.id, { status: "UNREADABLE" })
      return {
        text: "⚠️ I can't read the amount on this receipt.\nSend a clearer photo, or type it like `62000 from Musa`.",
      }
    case "unknown_account": {
      await setRow(ctx, row.id, {
        status: "AWAITING_ACCOUNT",
        outcome: outcome as never,
      })
      const names = accounts
        .slice(0, 8)
        .map((account, index) => `${index + 1}. ${account.name}`)
      return {
        text: [
          `⚠️ ${money} from ${from} went to ${[title(extraction.recipientBank), title(extraction.recipientAccount)].filter(Boolean).join(" ") || "an account"}${extraction.recipientName ? ` · ${to}` : ""}.`,
          "That isn't one of your accounts. Which account got it?",
          ...(names.length ? ["", ...names] : []),
          "",
          "_To match it next time, add the account number to that account in Finance._",
        ].join("\n"),
      }
    }
    case "ask_order":
      await setRow(ctx, row.id, {
        status: "AWAITING_ORDER",
        outcome: outcome as never,
      })
      return {
        text: [
          `🧾 ${money} from ${from}`,
          `Into ${outcome.account.name}`,
          "",
          "I can't match this to an order. What is it for?",
          "Reply with the name on the order, like `Chidi`, or `not for an order`.",
        ].join("\n"),
      }
    case "choose_order": {
      await setRow(ctx, row.id, {
        status: "AWAITING_ORDER",
        outcome: outcome as never,
      })
      return {
        text: [
          `🧾 ${money} from ${from} into ${outcome.account.name}`,
          "",
          "Which order is it for?",
          ...outcome.orders.map(
            (order, index) =>
              `${index + 1}. ${order.orderNumber} · ${order.customerName ?? "Walk-in"} · owes ${naira(order.balanceMinor, currency)}`,
          ),
          "",
          "Reply with the number or the order.",
        ].join("\n"),
      }
    }
    case "order_payment": {
      const { order, account, excessMinor } = outcome
      if (!can("payment_record"))
        return askOwner(
          {
            action: "payment_record",
            orderId: order.id,
            amountMinor: outcome.amountMinor,
            moneyAccountId: account.id,
            method: "bank_transfer",
            note: [
              receiptNote(extraction, currency),
              "Receipt sent in chat for approval",
            ]
              .join(" · ")
              .slice(0, 500),
          } as GeneralAction,
          `${naira(outcome.amountMinor, currency)} · ${from} → ${account.name}`,
          `For ${order.orderNumber} · ${order.customerName ?? "Walk-in"}${excessMinor > 0 ? ` · ${naira(excessMinor, currency)} extra not recorded` : ""}`,
        )
      // Kept on the order only when the sent file is stored and ready.
      const stored = await ctx.db.assistantAttachment.findUnique({
        where: { id: row.attachmentId },
        select: { status: true, storagePath: true, messageId: true },
      })
      const attachable = Boolean(
        stored?.status === "READY" && stored.storagePath && stored.messageId,
      )
      const note = [
        receiptNote(extraction, currency),
        attachable ? "Receipt kept on the order" : null,
        excessMinor > 0
          ? `Extra ${naira(excessMinor, currency)} stays as credit: reply \`credit\` after you confirm`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 500)
      return draft(
        {
          action: "payment_record",
          orderId: order.id,
          amountMinor: outcome.amountMinor,
          moneyAccountId: account.id,
          method: "bank_transfer",
          note,
          ...(attachable ? { receiptAttachmentId: row.attachmentId } : {}),
        },
        `🧾 ${money} from ${from} matches ${order.orderNumber} · ${order.customerName ?? "Walk-in"}.`,
        excessMinor > 0
          ? { excessMinor: BigInt(excessMinor), excessOrderId: order.id }
          : {},
      )
    }
    case "own_transfer": {
      const transfer = {
        action: "money_transfer_simple",
        amountMinor: amount,
        fromMoneyAccountId: outcome.from.id,
        fromAccountName: outcome.from.name,
        toMoneyAccountId: outcome.to.id,
        toAccountName: outcome.to.name,
        note: (
          title(extraction.narration) || receiptNote(extraction, currency)
        ).slice(0, 400),
        effectiveAt: effectiveAt(extraction),
      } as GeneralAction
      if (!can("money_transfer_simple"))
        return askOwner(
          transfer,
          `${money} · ${outcome.from.name} → ${outcome.to.name}`,
        )
      return draft(
        transfer,
        `🔁 ${money} from ${outcome.from.name} to ${outcome.to.name}.`,
      )
    }
    case "money_out": {
      if (!outcome.purpose) {
        await setRow(ctx, row.id, {
          status: "AWAITING_PURPOSE",
          outcome: outcome as never,
        })
        return {
          text: [
            `💸 ${money} to ${to}`,
            `From ${outcome.account.name}`,
            "",
            "What was it for? Reply like `transport` or `personal use`.",
          ].join("\n"),
        }
      }
      return moneyOut(outcome.account, outcome.purpose)
    }
  }
  async function moneyOut(account: ReceiptAccount, purpose: ReceiptPurpose) {
    const description = (
      title(extraction.narration) ||
      (purpose.type === "expense" ? purpose.categoryName : "Owner withdrawal")
    ).slice(0, 200)
    if (purpose.type === "owner_withdrawal") {
      if (!bookId) return needsOwner
      const withdrawal = {
        action: "money_movement",
        kind: "OWNER_WITHDRAWAL",
        bookId,
        accountId: account.id,
        amountMinor: String(amount),
        description: `${description} · to ${to}`.slice(0, 400),
        effectiveAt: effectiveAt(extraction) ?? new Date().toISOString(),
        movementAlreadyCompleted: true,
      } as GeneralAction
      if (!can("money_movement"))
        return askOwner(
          withdrawal,
          `${money} from ${account.name} · owner withdrawal`,
          `To ${to}`,
        )
      return draft(
        withdrawal,
        `💸 Owner withdrawal · ${money} from ${account.name}.`,
      )
    }
    const saved = categoryNames.find(
      (name) => name.toLowerCase() === purpose.categoryName.toLowerCase(),
    )
    const expense = {
      action: "expense_record_simple",
      amountMinor: amount,
      description,
      moneyAccountId: account.id,
      accountName: account.name,
      // Only a saved category; otherwise the Book’s Operating expenses fallback.
      ...(saved ? { categoryName: saved } : {}),
      payeeName: to.slice(0, 160),
      paid: true,
      effectiveAt: effectiveAt(extraction),
    } as GeneralAction
    if (!can("expense_record_simple"))
      return askOwner(
        expense,
        `${money} from ${account.name} · ${saved ?? "Operating expenses"}`,
        `To ${to}`,
      )
    return draft(
      expense,
      `💸 Expense · ${saved ?? "Operating expenses"} · ${money} from ${account.name}.`,
    )
  }
}

/**
 * A receipt photo or PDF in this message: read it once, match it and draft the
 * reviewed record, or ask the single missing fact. Anything that isn't a
 * transfer receipt returns null so the ordinary photo/file turn continues.
 */
export async function handleReceiptChat(
  ctx: GeneralContext,
  input: {
    conversationId: string
    text: string
    attachments: Attachment[]
  },
  deps: {
    /** Tests replace the stored-file read and provider call together. */
    read?: (file: Attachment) => Promise<ChatReceiptReadResult>
    env?: Environment
  } = {},
): Promise<ReceiptChatReply | null> {
  const env = deps.env ?? process.env
  const files = input.attachments.filter(
    (file) => file.kind === "IMAGE" || file.kind === "PDF",
  )
  if (files.length !== 1 || !receiptReadingAvailable(ctx, env)) return null
  const file = files[0]
  if (!file) return null
  const scope = requireGeneralScope(ctx)
  const config = receiptReadingConfig(env)
  if (!config) return null
  const caption = input.text.trim() || null
  let row = await ctx.db.assistantReceiptRead.findUnique({
    where: { attachmentId: file.id },
  })
  if (!row) {
    const since = new Date()
    since.setUTCHours(0, 0, 0, 0)
    const today = await ctx.db.assistantReceiptRead.count({
      where: { tenantId: scope.tenantId, createdAt: { gte: since } },
    })
    if (today >= config.dailyLimit)
      return {
        text: "⏳ Receipt reading is paused for today. Type it instead, like `62000 from Musa into Main bank`.",
      }
    row = await ctx.db.assistantReceiptRead.create({
      data: {
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        conversationId: input.conversationId,
        actorUserId: scope.userId,
        attachmentId: file.id,
        provider: "openai",
        model: config.model,
      },
    })
    const reader = deps.read
      ? null
      : createChatReceiptReader({ apiKey: config.apiKey, model: config.model })
    if (!deps.read && !reader) return null
    try {
      const read = deps.read
        ? await deps.read(file)
        : await readFile(ctx, file, reader as ChatReceiptReader)
      const amount = chatReceiptAmountMinor(read.extraction.amountText)
      row = await ctx.db.assistantReceiptRead.update({
        where: { id: row.id },
        data: {
          extraction: read.extraction,
          amountMinor: amount === null ? null : BigInt(amount),
          currencyCode: read.extraction.currencyCode,
          bankReference: normalizedBankReference(read.extraction.bankReference),
          providerRequestId: read.providerRequestId,
          inputTokens: read.inputTokens,
          outputTokens: read.outputTokens,
          status:
            read.extraction.documentKind === "not_a_receipt"
              ? "NOT_RECEIPT"
              : "READ",
        },
      })
    } catch {
      await setRow(ctx, row.id, { status: "FAILED", errorCode: "READ_FAILED" })
      // A failed read keeps the ordinary photo turn; nothing was recorded.
      return null
    }
  }
  if (
    row.status === "NOT_RECEIPT" ||
    row.status === "FAILED" ||
    !row.extraction
  )
    return null
  if (row.status === "DRAFTED" || row.status === "RESOLVED")
    return {
      text: "This receipt already has a review. Confirm or cancel that one.",
    }
  const extraction = parseChatReceiptExtraction(row.extraction)
  const currency =
    ctx.tenantContext.activeStore?.currencyCode ??
    ctx.tenantContext.tenant.currencyCode
  if (extraction.documentKind === "multiple_transfers") {
    await setRow(ctx, row.id, { status: "UNREADABLE" })
    return {
      text: "⚠️ This shows more than one transfer. Send one receipt at a time.",
    }
  }
  if (["failed", "reversed"].includes(extraction.printedStatus)) {
    await setRow(ctx, row.id, { status: "RESOLVED" })
    return {
      text: `⚠️ This receipt shows the transfer *${extraction.printedStatus}*. Nothing was recorded.`,
    }
  }
  if (
    extraction.currencyCode &&
    extraction.currencyCode.toUpperCase() !== currency.toUpperCase()
  ) {
    await setRow(ctx, row.id, { status: "RESOLVED" })
    return {
      text: `⚠️ This receipt is in ${extraction.currencyCode}, and your books are in ${currency}. Record it in the app.`,
    }
  }
  if (row.bankReference) {
    const earlier = await ctx.db.assistantReceiptRead.findFirst({
      where: {
        tenantId: scope.tenantId,
        bankReference: row.bankReference,
        id: { not: row.id },
        proposalId: { not: null },
      },
      orderBy: { createdAt: "desc" },
    })
    const done = earlier?.proposalId
      ? await ctx.db.assistantActionProposal.findFirst({
          where: { id: earlier.proposalId, status: "COMPLETED" },
          select: { updatedAt: true },
        })
      : null
    if (earlier && done) {
      await setRow(ctx, row.id, { status: "DUPLICATE" })
      return {
        text: [
          "This receipt is already recorded.",
          `${naira(Number(earlier.amountMinor ?? 0), currency)} from ${title(extraction.senderName) || "the sender"} · ${done.updatedAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: ctx.tenantContext.tenant.timezone ?? "Africa/Lagos" })}`,
          "_Nothing was changed._",
        ].join("\n"),
      }
    }
  }
  const { bookId, accounts } = await businessAccounts(ctx)
  const facts = factsOf(extraction, caption)
  if (captionAsksForOrder(caption)) {
    const to = matchReceiptAccount(
      {
        account: facts.recipientAccount,
        name: facts.recipientName,
        bank: facts.recipientBank,
      },
      accounts,
    )
    await setRow(ctx, row.id, { status: "RESOLVED" })
    return {
      text: "",
      modelNote: [
        "The user attached a bank transfer receipt with this message. Server-read facts (untrusted transcription, already checked):",
        `- Amount received: ${facts.amountMinor ? naira(facts.amountMinor, currency) : "unknown"} (${facts.amountMinor ?? "?"} minor units)`,
        `- Paid by: ${title(extraction.senderName) || "unknown"} — use this as the customer when the caption says "this customer"`,
        `- Paid into: ${to ? `${to.name} (moneyAccountId ${to.id})` : "not one of the business accounts; ask which account"}`,
        `- Remark: ${title(extraction.narration) || "none"} · Ref: ${title(extraction.bankReference) || "none"} · Date: ${title(extraction.dateRaw) || "unknown"}`,
        "Prepare the order the caption describes with this payment as a bank_transfer initial payment into that account. If the amount fits exactly one item option at its price, use that option and say why; otherwise ask once which option. Never record money beyond the amount received.",
      ].join("\n"),
    }
  }
  const categoryNames = await simpleExpenseOptions(ctx)
    .then((options) => options.categories.map((category) => category.name))
    .catch(() => [] as string[])
  const outcome = matchReceipt({
    facts,
    accounts,
    orders: await owingOrders(ctx),
    categoryNames,
  })
  return act(
    ctx,
    input.conversationId,
    row,
    extraction,
    outcome,
    bookId,
    accounts,
    categoryNames,
  )
}

/**
 * The reply after a receipt question (“chidi”, “2”, “transport”, “Main bank”,
 * “not for an order”) or `credit` after an overpaid order. Unrelated messages
 * return null and leave the question open for a while.
 */
export async function handleReceiptFollowUp(
  ctx: GeneralContext,
  input: { conversationId: string; text: string },
  env: Environment = process.env,
): Promise<ReceiptChatReply | null> {
  const text = input.text.trim()
  if (!text || text.length > 120 || !receiptReadingConfig(env)) return null
  // `ask` / `cancel` after a staff approval offer (19l) comes first.
  const approval = await handleReceiptApprovalReply(ctx, {
    conversationId: input.conversationId,
    text,
  })
  if (approval) return approval
  if (/^(?:proceed|confirm|cancel|yes|go ahead|done|save)[.!]*$/i.test(text))
    return null
  const scope = requireGeneralScope(ctx)
  const row = await ctx.db.assistantReceiptRead.findFirst({
    where: {
      conversationId: input.conversationId,
      actorUserId: scope.userId,
      tenantId: scope.tenantId,
      createdAt: { gt: new Date(Date.now() - FOLLOW_UP_MS) },
      status: {
        in: [
          "AWAITING_ORDER",
          "AWAITING_ACCOUNT",
          "AWAITING_PURPOSE",
          "DRAFTED",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
  })
  if (!row?.extraction) return null
  const extraction = parseChatReceiptExtraction(row.extraction)
  const currency =
    ctx.tenantContext.activeStore?.currencyCode ??
    ctx.tenantContext.tenant.currencyCode
  const amount = Number(row.amountMinor ?? 0)
  if (row.status === "DRAFTED")
    return /^(?:credit|keep (?:it )?as credit|keep as (?:his|her|their) credit)[.!]*$/i.test(
      text,
    )
      ? excessCredit(ctx, input.conversationId, row, extraction)
      : null
  const { bookId, accounts } = await businessAccounts(ctx)
  const facts = factsOf(extraction, null)
  const stored = (row.outcome ?? {}) as {
    kind?: string
    account?: ReceiptAccount
    orders?: ReceiptOrder[]
  }
  const words = text.split(/\s+/).length
  if (row.status === "AWAITING_ACCOUNT") {
    const index = /^\d{1,2}$/.test(text) ? Number(text) - 1 : -1
    const account =
      accounts[index] ??
      accounts.find((candidate) => receiptNameMatches(text, candidate.name))
    if (!account)
      return words <= 4
        ? { text: "Reply with one of your account names." }
        : null
    const outcome = matchReceiptOrder({
      account,
      amountMinor: amount,
      facts,
      orders: await owingOrders(ctx),
    })
    return act(
      ctx,
      input.conversationId,
      row,
      extraction,
      outcome,
      bookId,
      accounts,
    )
  }
  if (row.status === "AWAITING_PURPOSE") {
    const account = accounts.find(
      (candidate) => candidate.id === stored.account?.id,
    )
    const categoryNames = await simpleExpenseOptions(ctx)
      .then((options) => options.categories.map((category) => category.name))
      .catch(() => [] as string[])
    const purpose =
      receiptPurpose(text, categoryNames) ??
      (words <= 3 && /^[\p{L} ]+$/u.test(text)
        ? {
            type: "expense" as const,
            categoryName: text.replace(/^\p{L}/u, (c) => c.toUpperCase()),
          }
        : null)
    if (!account || !purpose) return null
    return act(
      ctx,
      input.conversationId,
      row,
      { ...extraction, narration: extraction.narration ?? text },
      { kind: "money_out", account, purpose },
      bookId,
      accounts,
      categoryNames,
    )
  }
  // AWAITING_ORDER
  const account = accounts.find(
    (candidate) => candidate.id === stored.account?.id,
  )
  if (!account) return null
  if (
    /^(?:not (?:for )?(?:an |any )?order|no order|money in|just money|sale)[.!]*$/i.test(
      text,
    )
  )
    return notForAnOrder(ctx, input.conversationId, row, extraction, account)
  const orders = await owingOrders(ctx)
  const listed = stored.orders ?? []
  const index = /^\d{1,2}$/.test(text) ? Number(text) - 1 : -1
  const picked = listed[index]
    ? orders.find((order) => order.id === listed[index]?.id)
    : undefined
  const outcome: ReceiptOutcome = picked
    ? {
        kind: "order_payment",
        account,
        order: picked,
        amountMinor: Math.min(amount, picked.balanceMinor),
        excessMinor: Math.max(0, amount - picked.balanceMinor),
        reason: "typed",
      }
    : matchReceiptOrder({
        account,
        amountMinor: amount,
        facts,
        orders,
        typed: text,
      })
  if (outcome.kind === "ask_order")
    return words <= 4
      ? {
          text: `No unpaid order for “${text.slice(0, 40)}”. Reply with another name, or \`not for an order\`.`,
        }
      : null
  return act(
    ctx,
    input.conversationId,
    row,
    extraction,
    outcome,
    bookId,
    accounts,
  )

  async function notForAnOrder(
    ctx: GeneralContext,
    conversationId: string,
    row: NonNullable<ReadRow>,
    extraction: ChatReceiptExtraction,
    account: ReceiptAccount,
  ): Promise<ReceiptChatReply> {
    if (!canDraftGeneralCapability(ctx, capabilityForAction("sale_record")))
      return { text: "Recording this needs an owner or admin." }
    try {
      const result = await draftGeneralProposal(ctx, conversationId, {
        action: "sale_record",
        moneyAccountId: account.id,
        accountName: account.name,
        method: "bank_transfer",
        customerChoice: "walk_in",
        receivedMinor: amount,
        description:
          `Transfer from ${title(extraction.senderName) || "customer"}${extraction.narration ? ` · ${title(extraction.narration)}` : ""}`.slice(
            0,
            200,
          ),
      })
      await setRow(ctx, row.id, {
        status: "DRAFTED",
        proposalId: result.proposalId,
      })
      return {
        text: `💰 ${naira(amount, currency)} from ${title(extraction.senderName) || "the sender"} into ${account.name}.`,
        proposalId: result.proposalId,
        proposalSource: source(result),
      }
    } catch (error) {
      if (error instanceof Error) return { text: `⚠️ ${error.message}` }
      throw error
    }
  }
}

/** After a confirmed overpaid order: the extra becomes the customer's credit, reviewed first. */
async function excessCredit(
  ctx: GeneralContext,
  conversationId: string,
  row: NonNullable<ReadRow>,
  extraction: ChatReceiptExtraction,
): Promise<ReceiptChatReply | null> {
  if (!row.excessMinor || !row.excessOrderId || !row.proposalId) return null
  const scope = requireGeneralScope(ctx)
  const currency =
    ctx.tenantContext.activeStore?.currencyCode ??
    ctx.tenantContext.tenant.currencyCode
  const paid = await ctx.db.assistantActionProposal.findFirst({
    where: { id: row.proposalId, status: "COMPLETED" },
    select: { id: true },
  })
  if (!paid)
    return { text: "Confirm the order payment first, then reply `credit`." }
  const order = await ctx.db.commercialOrder.findFirst({
    where: { id: row.excessOrderId, tenantId: scope.tenantId },
    select: { customerId: true, customerName: true },
  })
  const outcome = (row.outcome ?? {}) as { account?: ReceiptAccount }
  if (!order?.customerId || !outcome.account)
    return {
      text: "This order has no saved customer, so the extra can't be kept as credit. Record it in the app.",
    }
  if (!canDraftGeneralCapability(ctx, capabilityForAction("customer_receipt")))
    return { text: "Keeping credit needs an owner or admin." }
  try {
    const { bookId } = await businessAccounts(ctx)
    if (!bookId) return { text: "Set up Finance to keep customer credit." }
    const ledger = await ensureCustomerLedgerAccount(ctx.db, {
      tenantId: scope.tenantId,
      actorUserId: scope.userId,
      customerId: order.customerId,
      currencyCode: currency,
    })
    const result = await draftGeneralProposal(ctx, conversationId, {
      action: "customer_receipt",
      bookId,
      accountId: ledger.id,
      moneyAccountId: outcome.account.id,
      method: "BANK_TRANSFER",
      amountMinor: String(row.excessMinor),
      description:
        `Extra from transfer by ${title(extraction.senderName) || "customer"} kept as credit`.slice(
          0,
          400,
        ),
      reference: title(extraction.bankReference).slice(0, 160) || undefined,
      moneyAlreadyReceived: true,
    })
    await setRow(ctx, row.id, { status: "RESOLVED" })
    return {
      text: `💰 ${naira(row.excessMinor, currency)} as ${order.customerName ?? "the customer"}'s credit.`,
      proposalId: result.proposalId,
      proposalSource: source(result),
    }
  } catch (error) {
    if (error instanceof Error) return { text: `⚠️ ${error.message}` }
    throw error
  }
}
