import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import type { Prisma, PrismaClient } from "@ewatrade/db/types"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import { TRPCError } from "@trpc/server"
import {
  assertQaAccessAcceptanceDatabase,
  describeWithQaAccessDatabase,
} from "../../../../packages/db/src/queries/acceptance/qa-access/database"
import type { GeneralContext } from "./general-context"

// Prepared connected acceptance, NOT RUN by its author. Actual shared dashboard
// caller and fresh-session commands; no HTTP/mobile device/provider/model claim.
// The deterministic chat helper writes proposals, not assistant run/messages.
// Every real canonical save below has a valid Quick sale description. The only
// synthetic legacy shape is an IN-MEMORY DTO copy with a genuine saved receipt.
const requestedRunId = process.env.QA_MOBILE_SIMPLE_SALE_CALLER_RUN_ID
if (
  requestedRunId !== undefined &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestedRunId,
  )
)
  throw Error("QA_MOBILE_SIMPLE_SALE_CALLER_RUN_ID must be a UUID")
const transactionOptions = { maxWait: 10000, timeout: 30000 }
const slugFor = (runId: string) => `mobile-sale-caller-${runId}`
const emailFor = (runId: string) =>
  `mobile-sale-caller-owner-${runId}@example.invalid`
type PlannedUser = { id: string; email: string }

async function settledValues<T extends readonly unknown[]>(
  tasks: { [K in keyof T]: Promise<T[K]> },
): Promise<T> {
  const results = await Promise.allSettled(tasks)
  const failures = results.filter((result) => result.status === "rejected")
  if (failures.length === 1) throw failures[0]?.reason
  if (failures.length > 1)
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Owned simple-sale caller reads failed",
    )
  return results.map((result) => {
    if (result.status !== "fulfilled") throw Error("Unsettled caller QA read")
    return result.value
  }) as unknown as T
}

describeWithQaAccessDatabase("M06 actual supported simple-sale callers", () => {
  test("chat/form description readiness, selected bank collection and completed receipt replay", async () => {
    assertQaAccessAcceptanceDatabase()
    const runId = requestedRunId ?? randomUUID()
    const started = Date.now()
    const progress = (stage: string) => {
      console.info(`[simple-sale-caller QA ${runId}] ${stage}`)
      if (Date.now() - started > 720000)
        throw Error("Simple-sale caller scenario deadline")
    }
    progress("setup:start")
    const { prisma: db } = await import("@ewatrade/db")
    const plannedUsers: PlannedUser[] = []
    let tenantId: string | undefined
    const failures: unknown[] = []
    const oldSigningKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
    // An isolated test signer, never printed or sent to a provider.
    process.env.ASSISTANT_APPROVAL_SIGNING_KEY = `synthetic-simple-sale-caller-${runId}`
    try {
      const {
        createFinanceBook,
        createFinanceMoneyAccount,
        getActiveTenantForUser,
        getFinanceAccountBalances,
      } = await import("@ewatrade/db/queries")
      const { generalActionSchema, simpleSaleQuestions, simpleSaleStep } =
        await import("@ewatrade/assistant/general/contracts")
      const { handleSimpleSaleChat } = await import(
        "./general-simple-sale-chat"
      )
      const {
        decideGeneralProposal,
        draftGeneralProposal,
        editGeneralProposal,
        generalProposalForApp,
      } = await import("./general-proposals")
      const identity = { id: randomUUID(), email: emailFor(runId) }
      plannedUsers.push(identity)
      const user = await db.user.create({
        data: {
          ...identity,
          name: "Simple-sale caller QA Owner",
          ageBand: "ADULT",
          ageDeclaredAt: new Date(),
        },
      })
      const publication = currentEffectiveLegalPublication()
      if (publication)
        await db.legalAcceptance.create({
          data: {
            userId: user.id,
            version: publication.version,
            documentHash: publication.documentHash,
            surface: "simple-sale-caller-qa",
          },
        })
      tenantId = randomUUID()
      const tenant = await db.tenant.create({
        data: {
          id: tenantId,
          slug: slugFor(runId),
          name: "Simple-sale caller QA",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          metadata: {
            retailOps: {
              subscription: { planId: "growth", status: "active" },
            },
          },
          users: {
            create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
          },
        },
      })
      const store = await db.store.create({
        data: {
          tenantId: tenant.id,
          name: "Caller original Store",
          slug: "original",
          status: "ACTIVE",
        },
      })
      const session = await db.session.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          token: `simple-sale-caller-session-${runId}`,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      })
      const tenantContext = await getActiveTenantForUser(db, {
        userId: user.id,
        tenantSlug: tenant.slug,
        storeId: store.id,
      })
      if (!tenantContext) throw Error("Missing real caller Tenant context")
      const ctx: GeneralContext = {
        db,
        session: { session, user },
        tenantContext,
        tenantSlug: tenant.slug,
        tenantId: tenant.id,
        activeStoreId: store.id,
        requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
        requestId: runId,
        cfRay: null,
        isInternalRequest: false,
        forcePrimary: false,
        origin: null,
        clientIp: null,
        privacyClientIp: null,
        userAgent: null,
        qaSessionScope: null,
      }
      const actor = { actorUserId: user.id, tenantId: tenant.id }
      const book = await createFinanceBook(db, {
        ...actor,
        startsAt: new Date("2026-01-01T00:00:00Z"),
      })
      const [cash, defaultBank] = await settledValues([
        db.financeAccount.findUniqueOrThrow({
          where: { bookId_code: { bookId: book.id, code: "1000" } },
        }),
        db.financeAccount.findUniqueOrThrow({
          where: { bookId_code: { bookId: book.id, code: "1100" } },
        }),
      ])
      const bank = await createFinanceMoneyAccount(db, {
        ...actor,
        bookId: book.id,
        code: "1191",
        name: "Caller receiving bank",
        purpose: "BANK",
        paymentMethods: ["bank_transfer"],
      })
      expect(bank.id).not.toBe(cash.id)
      expect(bank.id).not.toBe(defaultBank.id)
      const conversation = await db.assistantConversation.create({
        data: {
          tenantId: tenant.id,
          storeId: store.id,
          ownerUserId: user.id,
          purpose: "GENERAL",
          status: "ACTIVE",
        },
      })
      const where = { tenantId: tenant.id }
      const snapshot = async () => {
        const [orders, journals, customers, finance, ledger, stocks, sequence] =
          await settledValues([
            db.commercialOrder.findMany({
              where,
              orderBy: { id: "asc" },
              include: {
                payments: { orderBy: { id: "asc" } },
                lines: {
                  orderBy: { id: "asc" },
                  include: {
                    snapshot: true,
                    stockReservation: true,
                    productFulfillments: true,
                    serviceFulfillment: true,
                  },
                },
              },
            }),
            db.financeJournalEntry.findMany({
              where: { bookId: book.id },
              include: { lines: { orderBy: { id: "asc" } } },
              orderBy: { id: "asc" },
            }),
            db.customer.findMany({ where, orderBy: { id: "asc" } }),
            getFinanceAccountBalances(db, { ...actor, bookId: book.id }),
            db.customerLedgerEntry.findMany({ where, orderBy: { id: "asc" } }),
            settledValues([
              db.stockOperation.count({ where }),
              db.stockReservation.count({ where }),
              db.productFulfillment.count({
                where: { orderLine: { order: where } },
              }),
              db.serviceJob.count({ where }),
            ]),
            db.tenant.findUniqueOrThrow({
              where: { id: tenant.id },
              select: { lastCommercialOrderSequence: true },
            }),
          ])
        return {
          orders,
          journals,
          customers,
          ledger,
          stocks,
          sequence: sequence.lastCommercialOrderSequence,
          financeSequence: finance.snapshotSequence,
          balances: finance.accounts
            .map(({ id, balanceMinor }) => ({ id, balanceMinor }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        }
      }
      const saved = (id: string) =>
        db.assistantActionProposal.findFirstOrThrow({
          where: {
            ...where,
            id,
            actorUserId: user.id,
            storeId: store.id,
            conversationId: conversation.id,
          },
        })
      const send = (text: string) =>
        handleSimpleSaleChat(ctx, {
          conversationId: conversation.id,
          messageId: randomUUID(),
          text,
          imageIds: [],
          history: [],
        })
      const refuse = async (run: () => Promise<unknown>) => {
        let failure: unknown
        try {
          await run()
        } catch (error) {
          failure = error
        }
        expect(failure).toBeInstanceOf(TRPCError)
        if (!(failure instanceof TRPCError))
          throw Error("Missing typed refusal")
        expect(["BAD_REQUEST", "CONFLICT"]).toContain(failure.code)
      }
      const confirm = (app: ReturnType<typeof generalProposalForApp>) =>
        decideGeneralProposal(ctx, {
          proposalId: app.id,
          revision: app.revision,
          approvalToken: app.approvalToken,
          decision: "confirm",
        })
      const baseline = await snapshot()
      expect(baseline.orders).toEqual([])
      expect(baseline.customers).toEqual([])
      expect(baseline.journals).toEqual([])
      progress("chat:missing-description")
      const first = await send(
        "New sale paid 5 into Caller receiving bank account",
      )
      if (!first?.proposalId) throw Error("Chat did not create a pending draft")
      const firstRow = await saved(first.proposalId)
      const firstApp = generalProposalForApp(firstRow)
      if (firstApp.payload.action !== "sale_record") throw Error("Wrong draft")
      const fullCustomer = `Caller full customer ${runId}`
      await editGeneralProposal(ctx, {
        proposalId: firstApp.id,
        revision: firstApp.revision,
        payload: {
          ...firstApp.payload,
          customerName: fullCustomer,
          customerChoice: "new",
        },
      })
      const missing = generalProposalForApp(await saved(firstApp.id))
      if (missing.payload.action !== "sale_record") throw Error("Wrong draft")
      expect(missing.payload).toMatchObject({
        receivedMinor: 500,
        moneyAccountId: bank.id,
        method: "bank_transfer",
        customerName: fullCustomer,
        customerChoice: "new",
      })
      expect(simpleSaleStep(missing.payload)).not.toBe("review")
      expect(Boolean(missing.approvalToken)).toBe(false)
      await refuse(() => confirm(missing))
      expect(await snapshot()).toEqual(baseline)
      // These are actual ordinary owner replies, not a hidden-ID/parser copy.
      const descriptionGuidance = (text: string) => {
        const question = (
          simpleSaleQuestions as Readonly<Record<string, string>>
        ).description
        return Boolean(
          text.trim() &&
            ((question && text.trim() === question.trim()) ||
              /\b(?:description|describe)\b|\bwhat\b.{0,40}\b(?:sold|sell)\b/i.test(
                text,
              ) ||
              (/\b200\b/.test(text) && /\bcharacters?\b/i.test(text))),
        )
      }
      for (const invalid of ["   ", "x".repeat(201)]) {
        try {
          const correction = await send(invalid)
          expect(correction?.proposalId).toBe(firstApp.id)
          expect(descriptionGuidance(correction?.text ?? "")).toBe(true)
        } catch (error) {
          // Only an actual description validation refusal is an alternative
          // to a useful correction reply. Auth/account/unknown failures fail.
          expect(error).toBeInstanceOf(TRPCError)
          if (!(error instanceof TRPCError)) throw error
          expect(["BAD_REQUEST", "CONFLICT"]).toContain(error.code)
          expect(descriptionGuidance(error.message)).toBe(true)
        }
        const app = generalProposalForApp(await saved(firstApp.id))
        expect(app.payload).toEqual(missing.payload)
        expect(Boolean(app.approvalToken)).toBe(false)
        expect(
          await db.assistantActionProposal.count({
            where: { conversationId: conversation.id },
          }),
        ).toBe(1)
        expect(await snapshot()).toEqual(baseline)
      }
      const beforeWords = await saved(firstApp.id)
      const described = await send("Two bags of rice")
      expect(described?.proposalId).toBe(firstApp.id)
      const fullRow = await saved(firstApp.id)
      const fullApp = generalProposalForApp(fullRow)
      expect(fullRow.revision).toBe(beforeWords.revision + 1)
      expect(fullApp.payload).toEqual({
        ...missing.payload,
        description: "Two bags of rice",
      })
      expect(Boolean(fullApp.approvalToken)).toBe(true)
      expect(await snapshot()).toEqual(baseline)
      progress("full:confirm-and-repeat")
      const fullResult = await confirm(fullApp)
      if (!fullResult.receipt || fullResult.receipt.kind !== "order")
        throw Error("Full sale did not produce its genuine Order receipt")
      const afterFull = await snapshot()
      const fullOrder = afterFull.orders.find(
        (row) => row.id === fullResult.receipt?.recordId,
      )
      if (!fullOrder) throw Error("Missing full Order")
      expect(fullOrder).toMatchObject({
        tenantId: tenant.id,
        storeId: store.id,
        createdByUserId: user.id,
        clientOrderId: fullRow.idempotencyKey,
        totalMinor: 500,
        amountPaidMinor: 500,
        paymentStatus: "PAID",
      })
      expect(fullOrder.lines).toHaveLength(1)
      expect(fullOrder.lines[0]?.snapshot).toMatchObject({
        customLineRole: "QUICK_SALE",
        catalogItemName: "Two bags of rice",
      })
      expect(fullOrder.payments).toHaveLength(1)
      expect(fullOrder.payments[0]).toMatchObject({
        recordedByUserId: user.id,
        moneyAccountId: bank.id,
        amountMinor: 500,
        clientPaymentId: `${fullRow.idempotencyKey}:initial`,
      })
      expect(afterFull.customers).toHaveLength(1)
      expect(afterFull.customers[0]).toMatchObject({
        id: fullOrder.customerId,
        name: fullCustomer,
      })
      expect((await confirm(fullApp)).receipt).toEqual(fullResult.receipt)
      expect(await snapshot()).toEqual(afterFull)
      const completed = await saved(fullApp.id)
      // Synthetic read-only legacy DTO, with the REAL receipt just committed.
      // Stored proposal/canonical payload hashes and business facts are untouched.
      const historicalPayload: GeneralAction = { ...fullApp.payload }
      if (historicalPayload.action !== "sale_record") throw Error("Wrong sale")
      Reflect.deleteProperty(historicalPayload, "description")
      const legacy = generalProposalForApp({
        ...completed,
        payload: JSON.parse(JSON.stringify(historicalPayload)),
      })
      expect(legacy.receipt).toEqual(fullResult.receipt)
      expect(legacy.status).toBe("COMPLETED")
      expect(legacy.approvalToken).toBeUndefined()
      expect(await saved(fullApp.id)).toEqual(completed)
      expect(await snapshot()).toEqual(afterFull)
      progress("part:draft-form-edit-confirm")
      const partCustomer = `Caller part customer ${runId}`
      const part = await draftGeneralProposal(ctx, conversation.id, {
        action: "sale_record",
        receivedMinor: 300,
        totalMinor: 900,
        partial: true,
        moneyAccountId: bank.id,
        method: "bank_transfer",
        customerName: partCustomer,
        customerChoice: "new",
        attachmentIds: [],
      })
      const partPending = generalProposalForApp(await saved(part.proposalId))
      expect(Boolean(partPending.approvalToken)).toBe(false)
      if (partPending.payload.action !== "sale_record")
        throw Error("Wrong sale")
      const partApp = await editGeneralProposal(ctx, {
        proposalId: partPending.id,
        revision: partPending.revision,
        payload: generalActionSchema.parse({
          ...partPending.payload,
          description: "  Part-paid supplies  ",
        }),
      })
      expect(partApp.id).toBe(partPending.id)
      expect(partApp.revision).toBe(partPending.revision + 1)
      expect(partApp.payload).toMatchObject({
        description: "Part-paid supplies",
      })
      expect(await snapshot()).toEqual(afterFull)
      const partResult = await confirm(partApp)
      if (!partResult.receipt || partResult.receipt.kind !== "order")
        throw Error("Part sale did not produce its genuine Order receipt")
      const afterPart = await snapshot()
      const partRow = await saved(partApp.id)
      const partOrder = afterPart.orders.find(
        (row) => row.id === partResult.receipt?.recordId,
      )
      if (!partOrder) throw Error("Missing partial Order")
      expect(partOrder).toMatchObject({
        createdByUserId: user.id,
        clientOrderId: partRow.idempotencyKey,
        totalMinor: 900,
        amountPaidMinor: 300,
        paymentStatus: "PARTIALLY_PAID",
      })
      expect(partOrder.lines[0]?.snapshot).toMatchObject({
        customLineRole: "QUICK_SALE",
        catalogItemName: "Part-paid supplies",
      })
      expect(partOrder.payments).toHaveLength(1)
      expect(partOrder.totalMinor - partOrder.amountPaidMinor).toBe(600)
      expect(partOrder.payments[0]).toMatchObject({
        recordedByUserId: user.id,
        moneyAccountId: bank.id,
        amountMinor: 300,
        clientPaymentId: `${partRow.idempotencyKey}:initial`,
      })
      expect(afterPart.customers).toHaveLength(2)
      expect(
        afterPart.customers.find((row) => row.id === partOrder.customerId),
      ).toMatchObject({ name: partCustomer })
      expect((await confirm(partApp)).receipt).toEqual(partResult.receipt)
      expect(await snapshot()).toEqual(afterPart)
      progress("generic:blank-guard-and-valid-optional-cost")
      let genericBlankId: string | undefined
      try {
        const blank = await draftGeneralProposal(ctx, conversation.id, {
          action: "order_create",
          lines: [{ custom: "quick_sale", amountMinor: 200 }],
        })
        genericBlankId = blank.proposalId
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        if (!(error instanceof TRPCError)) throw error
        expect(["BAD_REQUEST", "CONFLICT"]).toContain(error.code)
      }
      if (genericBlankId) {
        const app = generalProposalForApp(await saved(genericBlankId))
        expect(Boolean(app.approvalToken)).toBe(false)
        await refuse(() => confirm(app))
      }
      expect(await snapshot()).toEqual(afterPart)
      const genericPayload: GeneralAction = {
        action: "order_create",
        lines: [
          { custom: "quick_sale", amountMinor: 200, description: "Small sale" },
          { custom: "additional_cost", amountMinor: 50 },
        ],
      }
      const generic = genericBlankId
        ? await editGeneralProposal(ctx, {
            proposalId: genericBlankId,
            revision: (await saved(genericBlankId)).revision,
            payload: genericPayload,
          })
        : generalProposalForApp(
            await saved(
              (await draftGeneralProposal(ctx, conversation.id, genericPayload))
                .proposalId,
            ),
          )
      expect(Boolean(generic.approvalToken)).toBe(true)
      const genericResult = await confirm(generic)
      if (!genericResult.receipt || genericResult.receipt.kind !== "order")
        throw Error("Generic sale did not produce its genuine receipt")
      const final = await snapshot()
      const genericOrder = final.orders.find(
        (row) => row.id === genericResult.receipt?.recordId,
      )
      if (!genericOrder) throw Error("Missing generic Order")
      expect(genericOrder).toMatchObject({
        createdByUserId: user.id,
        totalMinor: 250,
        amountPaidMinor: 0,
        paymentStatus: "PENDING",
      })
      expect(genericOrder.payments).toEqual([])
      expect(genericOrder.lines.map((line) => line.snapshot)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            customLineRole: "QUICK_SALE",
            catalogItemName: "Small sale",
          }),
          expect.objectContaining({
            customLineRole: "ADDITIONAL_COST",
            offeringName: "(no description)",
          }),
        ]),
      )
      expect(final.orders.filter((row) => row.id !== genericOrder.id)).toEqual(
        afterPart.orders,
      )
      expect(final.customers).toEqual(afterPart.customers)
      expect(final.journals).toEqual(afterPart.journals)
      expect(final.orders).toHaveLength(3)
      expect(final.journals).toHaveLength(2)
      const control = await db.financeAccount.findUniqueOrThrow({
        where: { bookId_code: { bookId: book.id, code: "2200" } },
      })
      expect(control).toMatchObject({
        kind: "LIABILITY",
        purpose: "OTHER",
        name: "Order collections awaiting reconciliation",
      })
      for (const payment of [fullOrder.payments[0], partOrder.payments[0]]) {
        if (!payment) throw Error("Missing exact collected payment")
        const journal = final.journals.find(
          (row) =>
            row.sourceKind === "COMMERCIAL_ORDER_COLLECTION" &&
            row.sourceId === payment.id,
        )
        if (!journal) throw Error("Missing actual collection journal")
        expect(journal).toMatchObject({
          actorUserId: user.id,
          bookId: book.id,
          storeId: store.id,
        })
        expect(journal.lines).toHaveLength(2)
        expect(
          journal.lines.find((line) => line.accountId === bank.id),
        ).toMatchObject({
          debitMinor: BigInt(payment.amountMinor),
          creditMinor: 0n,
        })
        expect(
          journal.lines.find((line) => line.accountId === control.id),
        ).toMatchObject({
          debitMinor: 0n,
          creditMinor: BigInt(payment.amountMinor),
        })
        expect(
          journal.lines.reduce((sum, line) => sum + line.debitMinor, 0n),
        ).toBe(BigInt(payment.amountMinor))
        expect(
          journal.lines.reduce((sum, line) => sum + line.creditMinor, 0n),
        ).toBe(BigInt(payment.amountMinor))
      }
      const accountBalance = (id: string) =>
        final.balances.find((row) => row.id === id)?.balanceMinor
      expect(accountBalance(bank.id)).toBe("800")
      expect(accountBalance(cash.id)).toBe("0")
      expect(accountBalance(defaultBank.id)).toBe("0")
      // Collections are real journal effects. Unbilled Orders intentionally do
      // not fabricate customer-ledger debit/payment entries or a Money-in.
      expect(final.ledger).toEqual([])
      expect(final.stocks).toEqual([0, 0, 0, 0])
      expect((await confirm(generic)).receipt).toEqual(genericResult.receipt)
      expect(await snapshot()).toEqual(final)
      expect(
        await db.assistantRun.count({ where: { conversation: where } }),
      ).toBe(0)
      expect(
        await db.assistantMessage.count({ where: { conversation: where } }),
      ).toBe(0)
      progress("scenario:complete")
    } catch (error) {
      failures.push(error)
      console.error(`[simple-sale-caller QA ${runId}] scenario failure`, error)
    } finally {
      try {
        await dispose(db, runId, tenantId, plannedUsers)
      } catch (error) {
        failures.push(error)
      }
      try {
        await db.$disconnect()
      } catch (error) {
        failures.push(error)
      }
      if (oldSigningKey === undefined)
        Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
      else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = oldSigningKey
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1)
      throw new AggregateError(
        failures,
        `Simple-sale caller QA ${runId}: scenario/disposal failures (original first)`,
      )
  }, 900000)
})

async function dispose(
  db: PrismaClient,
  runId: string,
  tenantId: string | undefined,
  plannedUsers: PlannedUser[],
) {
  if (plannedUsers.length === 0 && tenantId === undefined) {
    console.info(
      `[simple-sale-caller QA ${runId}] cleanup skipped: no fixture writes attempted`,
    )
    return false
  }
  assertQaAccessAcceptanceDatabase()
  const userIds = plannedUsers.map((user) => user.id)
  const expectedEmails = new Map(
    plannedUsers.map((user) => [user.id, user.email]),
  )
  const [users, tenant] = await settledValues([
    db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    }),
    tenantId
      ? db.tenant.findUnique({
          where: { id: tenantId },
          select: { slug: true, dataClassification: true },
        })
      : Promise.resolve(null),
  ])
  if (users.some((user) => expectedEmails.get(user.id) !== user.email))
    throw Error(`Simple-sale caller QA ${runId}: cleanup User proof failed`)
  if (
    tenant &&
    (tenant.slug !== `mobile-sale-caller-${runId}` ||
      tenant.dataClassification !== "QA")
  )
    throw Error(`Simple-sale caller QA ${runId}: cleanup Tenant proof failed`)
  // Missing planned rows are valid partial setup, not missing disposal authority.
  // Only an actually observed exact QA Tenant enters these twelve groups.
  if (tenant && tenantId) {
    const ownedTenantId = tenantId
    const where = { tenantId }
    const group = async (
      label: string,
      work: (tx: Prisma.TransactionClient) => Promise<void>,
    ) => {
      assertQaAccessAcceptanceDatabase()
      console.info(`[simple-sale-caller QA ${runId}] cleanup:${label}`)
      try {
        await db.$transaction(async (tx) => {
          // Re-prove exact QA identity and hold its row in EVERY disposal
          // transaction; a prior successful group grants no later authority.
          const owned = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Tenant" WHERE "id"=${ownedTenantId}
              AND "slug"=${`mobile-sale-caller-${runId}`} AND "dataClassification"='QA'
            FOR UPDATE
          `
          if (owned.length !== 1)
            throw Error(
              `Simple-sale caller QA ${runId}: cleanup Tenant proof failed`,
            )
          await work(tx)
        }, transactionOptions)
      } catch (error) {
        throw new Error(
          `Simple-sale caller QA ${runId}: cleanup group ${label} failed`,
          { cause: error },
        )
      }
    }
    await group("assistant-offline-and-activity", async (tx) => {
      // Conversation cascades only its own messages/runs/attachments/proposals.
      // Explicitly remove proposals before their RESTRICT actor relation.
      await tx.assistantActionProposal.deleteMany({ where })
      await tx.assistantConversation.deleteMany({ where })
      await tx.offlineCommand.deleteMany({ where })
      await tx.businessActivityEvent.deleteMany({ where })
    })
    await group("fulfillment-and-reservations", async (tx) => {
      await tx.serviceWorkEvent.deleteMany({ where })
      await tx.serviceJobLine.deleteMany({ where: { serviceJob: where } })
      await tx.serviceJob.deleteMany({ where })
      await tx.commercialServiceFulfillment.deleteMany({ where })
      await tx.productFulfillment.deleteMany({
        where: { orderLine: { order: where } },
      })
      await tx.stockReservation.deleteMany({ where })
    })
    await group("payments-and-allocations", async (tx) => {
      await tx.commercialOrderPayment.deleteMany({ where })
      await tx.customerLedgerAllocationRelease.deleteMany({
        where: { allocation: { credit: where } },
      })
      await tx.customerLedgerAllocation.deleteMany({ where: { credit: where } })
    })
    await group("customer-receipts-and-entries", async (tx) => {
      await tx.customerLedgerReceipt.deleteMany({ where: { entry: where } })
      await tx.customerLedgerCommand.deleteMany({ where })
      await tx.customerLedgerEntry.deleteMany({ where })
    })
    await group("customer-accounts-and-orders", async (tx) => {
      await tx.customerLedgerAccount.deleteMany({ where })
      await tx.commercialOrder.deleteMany({ where })
    })
    await group("inventory-valuations", async (tx) => {
      // Expected empty for these Quick sales; remove any unexpected owned
      // costing before its stock provenance without touching another Tenant.
      await tx.financeInventoryValuationEvent.deleteMany({ where })
      await tx.financeInventoryPool.deleteMany({ where })
    })
    await group("catalog-receipts-and-stock-movements", async (tx) => {
      await tx.catalogCommandReceipt.deleteMany({ where })
      await tx.stockMovement.deleteMany({ where: { operation: where } })
    })
    await group("stock-operations-and-balances", async (tx) => {
      await tx.stockOperation.deleteMany({ where })
      await tx.stockBalanceSource.deleteMany({ where })
    })
    await group("finance-commands-and-lines", async (tx) => {
      await tx.financeCommand.deleteMany({ where: { book: where } })
      await tx.financeJournalLine.deleteMany({
        where: { entry: { book: where } },
      })
    })
    await group("finance-journals-and-accounts", async (tx) => {
      await tx.financeJournalEntry.deleteMany({ where: { book: where } })
      await tx.financeAccount.deleteMany({ where: { book: where } })
    })
    await group("finance-Book-and-Catalog", async (tx) => {
      await tx.financeBook.deleteMany({ where })
      await tx.catalogPriceChange.deleteMany({ where })
      await tx.catalogItem.deleteMany({ where })
    })
    await group("Tenant", async (tx) => {
      await tx.tenant.delete({ where: { id: tenantId } })
    })
  }
  await db.$transaction(async (tx) => {
    // Re-read under row locks; validate each exact ID/email pair rather than
    // assuming every attempted insert committed (or accepting swapped emails).
    const owned = await tx.$queryRaw<Array<{ id: string; email: string }>>`
      SELECT "id", "email" FROM "User" WHERE "id"=ANY(${userIds}::text[])
        FOR UPDATE
    `
    if (owned.some((user) => expectedEmails.get(user.id) !== user.email))
      throw Error(`Simple-sale caller QA ${runId}: cleanup User proof failed`)
    if (
      (await tx.membership.count({ where: { userId: { in: userIds } } })) !== 0
    )
      throw Error(
        `Simple-sale caller QA ${runId}: foreign membership prevents User disposal`,
      )
    // Exact User row locks + paired identity proof above authorize only these
    // own-session/legal fixtures; there is still no authority over memberships.
    await tx.session.deleteMany({
      where: { userId: { in: owned.map((row) => row.id) } },
    })
    await tx.legalAcceptance.deleteMany({
      where: { userId: { in: owned.map((row) => row.id) } },
    })
    if (owned.length > 0)
      await tx.user.deleteMany({
        where: { OR: owned.map(({ id, email }) => ({ id, email })) },
      })
  }, transactionOptions)
  const residual = await settledValues([
    db.user.count({ where: { id: { in: userIds } } }),
    db.session.count({ where: { userId: { in: userIds } } }),
    db.legalAcceptance.count({ where: { userId: { in: userIds } } }),
    ...(tenantId
      ? [
          db.tenant.count({ where: { id: tenantId } }),
          db.assistantActionProposal.count({ where: { tenantId } }),
          db.assistantConversation.count({ where: { tenantId } }),
          db.assistantRun.count({ where: { conversation: { tenantId } } }),
          db.assistantMessage.count({ where: { conversation: { tenantId } } }),
          db.customer.count({ where: { tenantId } }),
          db.serviceJob.count({ where: { tenantId } }),
          db.offlineCommand.count({ where: { tenantId } }),
          db.commercialOrder.count({ where: { tenantId } }),
          db.commercialOrderPayment.count({ where: { tenantId } }),
          db.financeBook.count({ where: { tenantId } }),
          db.catalogItem.count({ where: { tenantId } }),
          db.offlineDevice.count({ where: { tenantId } }),
          db.store.count({ where: { tenantId } }),
          db.stockOperation.count({ where: { tenantId } }),
          db.stockBalanceSource.count({ where: { tenantId } }),
          db.stockReservation.count({ where: { tenantId } }),
          db.customerLedgerEntry.count({ where: { tenantId } }),
          db.catalogPriceChange.count({ where: { tenantId } }),
        ]
      : []),
  ])
  if (residual.some((count) => count !== 0))
    throw Error(`Simple-sale caller QA ${runId}: cleanup left owned rows`)
  console.info(`[simple-sale-caller QA ${runId}] cleanup zero owned rows`)
  return true
}
