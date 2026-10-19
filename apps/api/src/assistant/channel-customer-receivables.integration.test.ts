import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import {
  type GeneralAnswer,
  generalMoney,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  generalReadContinuationContext,
  nextGeneralReadRequest,
  parseGeneralReadContinuation,
} from "@ewatrade/assistant/general/read-continuation"
import {
  appendAssistantMessage,
  assistantBudgetScopeKey,
} from "@ewatrade/db/assistant"
import { disconnectAssistantWhatsApp } from "@ewatrade/db/assistant-whatsapp"
import {
  createCustomer,
  createFinanceBook,
  ensureCustomerLedgerAccount,
  getFinanceAccountBalances,
  recordCustomerLedgerOpening,
} from "@ewatrade/db/queries"
import type { Prisma } from "@ewatrade/db/types"
import { z } from "zod"
import { FINANCE_DEFAULT_ACCOUNTS } from "../../../../packages/db/src/queries/finance/accounts"
import { financePostingCommandId } from "../../../../packages/db/src/queries/finance/commands"
import { createAssistantWhatsAppActionFixture } from "./channel-action-integration-fixture"
import { generalBudgetScopeKey } from "./general-allowance"
import { generalPersistentParts } from "./general-persistence"
import { createGeneralTools } from "./general-tools"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
const suite = enabled ? describe : describe.skip
const fixture = createAssistantWhatsAppActionFixture("wa-customer-receivables")
const customerName = `Synthetic opening customer ${fixture.marker.slice(-8)}`
const debt = "12345678901234"
const credit = "4567890123"
const startsAt = new Date("2026-01-01T00:00:00.000Z")
const directions = ["DEBT", "CREDIT"] as const
const commandId = (direction: (typeof directions)[number]) =>
  `${fixture.marker}-${direction.toLowerCase()}`
const previousRehearsal = process.env.ASSISTANT_REHEARSAL_MODE
let customerId = ""
let accountId = ""
let bookId = ""
let externalCalls = 0
let fetchTrap: ReturnType<typeof installFetchTrap> | undefined
let seeded: Awaited<ReturnType<typeof domainSnapshot>> | undefined

function installFetchTrap() {
  return spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async () => {
        externalCalls += 1
        throw Error("External fetch forbidden in customer receivables fixture")
      },
      {
        preconnect: () => {
          externalCalls += 1
          throw Error("External preconnect forbidden in receivables fixture")
        },
      },
    ),
  )
}

/** Exact immutable positive graph, including both independently posted controls. */
async function domainSnapshot(db: Prisma.TransactionClient) {
  const { tenantId } = fixture
  return {
    customers: await db.customer.findMany({
      where: { tenantId },
      orderBy: { id: "asc" },
    }),
    accounts: await db.customerLedgerAccount.findMany({
      where: { tenantId },
      orderBy: { id: "asc" },
    }),
    entries: await db.customerLedgerEntry.findMany({
      where: { tenantId },
      orderBy: { sequence: "asc" },
    }),
    commands: await db.customerLedgerCommand.findMany({
      where: { tenantId },
      orderBy: { clientCommandId: "asc" },
    }),
    books: await db.financeBook.findMany({
      where: { tenantId },
      orderBy: { id: "asc" },
    }),
    chart: await db.financeAccount.findMany({
      where: { book: { tenantId } },
      orderBy: { code: "asc" },
    }),
    journals: await db.financeJournalEntry.findMany({
      where: { book: { tenantId } },
      orderBy: { sequence: "asc" },
      include: { lines: { orderBy: { accountId: "asc" } } },
    }),
    financeCommands: await db.financeCommand.findMany({
      where: { book: { tenantId } },
      orderBy: { clientCommandId: "asc" },
    }),
  }
}

beforeAll(async () => {
  if (!enabled) return
  // QA classification permits some real text providers; explicit rehearsal and
  // a rejecting fetch boundary protect setup, reads and cleanup independently.
  process.env.ASSISTANT_REHEARSAL_MODE = "true"
  fetchTrap = installFetchTrap()
  await fixture.setup()
  const { db, tenantId, userId } = fixture
  const actor = { tenantId, actorUserId: userId }
  customerId = (await createCustomer(db, { tenantId, name: customerName })).id
  bookId = (await createFinanceBook(db, { ...actor, startsAt })).id
  accountId = (
    await ensureCustomerLedgerAccount(db, {
      ...actor,
      customerId,
      currencyCode: "NGN",
    })
  ).id
  for (const direction of directions)
    await recordCustomerLedgerOpening(db, {
      ...actor,
      bookId,
      accountId,
      clientCommandId: commandId(direction),
      direction,
      amountMinor: direction === "DEBT" ? debt : credit,
      reason: `Synthetic verified external opening ${direction.toLowerCase()}; excludes existing orders`,
    })
  seeded = await fixture.db.$transaction(domainSnapshot)
}, 120_000)

async function cleanupOwned() {
  const { db, tenantId, storeId, userId, conversationId } = fixture
  await db.$transaction(
    async (tx) => {
      expect(
        await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      ).toMatchObject({
        slug: tenantId,
        dataClassification: "QA",
        qaSourceDomain: "assistant-action-confirmation.test",
      })
      if (!seeded)
        throw Error("Incomplete canonical seed retains fixture attribution")
      const current = await domainSnapshot(tx)
      expect(current).toEqual(seeded)
      expect(current.customers).toHaveLength(1)
      expect(current.customers[0]).toMatchObject({
        id: customerId,
        tenantId,
        name: customerName,
        phone: null,
        email: null,
      })
      expect(current.accounts).toHaveLength(1)
      expect(current.accounts[0]).toMatchObject({
        id: accountId,
        tenantId,
        customerId,
        currencyCode: "NGN",
        revision: 2n,
        lastSequence: 2n,
      })
      expect(current.books).toHaveLength(1)
      expect(current.books[0]).toMatchObject({
        id: bookId,
        tenantId,
        createdById: userId,
        currencyCode: "NGN",
        startsAt,
        lastSequence: 2n,
        closedThrough: null,
      })
      expect(
        current.chart.map(({ code, name, kind, purpose }) => ({
          code,
          name,
          kind,
          purpose,
        })),
      ).toEqual(
        [...FINANCE_DEFAULT_ACCOUNTS].sort((a, b) =>
          a.code.localeCompare(b.code),
        ),
      )
      expect(current.entries).toHaveLength(2)
      expect(current.commands).toHaveLength(2)
      expect(current.journals).toHaveLength(2)
      expect(current.financeCommands).toHaveLength(2)
      for (const [index, direction] of directions.entries()) {
        const entry = current.entries[index]
        if (!entry) throw Error("Expected exact canonical customer opening")
        expect(entry).toMatchObject({
          tenantId,
          accountId,
          sequence: BigInt(index + 1),
          kind: direction === "DEBT" ? "OPENING_DEBT" : "OPENING_CREDIT",
          side: direction === "DEBT" ? "DEBIT" : "CREDIT",
          amountMinor: BigInt(direction === "DEBT" ? debt : credit),
          sourceKind: "CUSTOMER_OPENING",
          sourceId: `${accountId}:${direction}`,
          actorUserId: userId,
          effectiveAt: startsAt,
          storeId: null,
          orderId: null,
          reversalOfId: null,
        })
        const command = current.commands.find(
          (row) => row.clientCommandId === commandId(direction),
        )
        expect(command).toMatchObject({
          tenantId,
          accountId,
          actorUserId: userId,
          kind: "OPENING",
          result: { id: entry.id },
        })
        const journal = current.journals.find(
          (row) => row.sourceId === entry.id,
        )
        if (!journal) throw Error("Expected exact opening journal")
        expect(journal).toMatchObject({
          bookId,
          actorUserId: userId,
          sourceKind: "CUSTOMER_LEDGER_OPENING",
          effectiveAt: startsAt,
          storeId: null,
          reversalOfId: null,
        })
        expect(journal.lines).toHaveLength(2)
        expect(
          journal.lines.reduce(
            (net, line) => net + line.debitMinor - line.creditMinor,
            0n,
          ),
        ).toBe(0n)
        expect(
          current.financeCommands.find(
            (row) =>
              row.clientCommandId ===
              financePostingCommandId(
                `customer-ledger:${commandId(direction)}`,
                "opening",
              ),
          ),
        ).toMatchObject({
          bookId,
          actorUserId: userId,
          kind: "POST_JOURNAL",
          result: {
            entryId: journal.id,
            sequence: journal.sequence.toString(),
          },
        })
      }
      // Inverse account edges cannot be erased by a broad tenant cascade.
      expect(
        await tx.customerLedgerAccount.count({ where: { customerId } }),
      ).toBe(1)
      expect(await tx.customerLedgerEntry.count({ where: { accountId } })).toBe(
        2,
      )
      expect(
        await tx.customerLedgerCommand.count({ where: { accountId } }),
      ).toBe(2)
      const zeros = await Promise.all([
        tx.customerLedgerAllocation.count({ where: { accountId } }),
        tx.customerLedgerReceipt.count({ where: { accountId } }),
        tx.financeBill.count({ where: { bookId } }),
        tx.financeSupplierAccount.count({ where: { bookId } }),
        tx.financePeriod.count({ where: { bookId } }),
        tx.financeReconciliation.count({ where: { bookId } }),
        tx.commercialOrder.count({ where: { tenantId } }),
        tx.catalogItem.count({ where: { tenantId } }),
        tx.stockOperation.count({ where: { tenantId } }),
        tx.assistantRun.count({ where: { conversation: { tenantId } } }),
        tx.assistantActionProposal.count({ where: { tenantId } }),
        tx.assistantAttachment.count({ where: { tenantId } }),
        tx.assistantUsageEvent.count({ where: { tenantId } }),
        tx.assistantBudget.count({
          where: {
            scopeKey: {
              in: [
                assistantBudgetScopeKey(tenantId, "SETUP"),
                generalBudgetScopeKey({ tenantId }),
              ],
            },
          },
        }),
        tx.businessActivityEvent.count({ where: { tenantId } }),
      ])
      for (const count of zeros) expect(count).toBe(0)
      const links = await tx.assistantWhatsAppLink.findMany({
        where: {
          tenantId,
          storeId,
          userId,
          membershipId: fixture.membershipId,
          confirmedAt: { not: null },
        },
      })
      expect(links).toHaveLength(1)
      const link = links[0]
      if (!link) throw Error("Expected exact owned link")
      expect(link).toMatchObject({
        phoneNumberId: fixture.principal.phoneNumberId,
        claimedSenderId: fixture.principal.senderId,
      })
      const chats = await tx.assistantConversation.findMany({
        where: { tenantId },
        include: { messages: true, setupDraft: true },
      })
      expect(chats.map((chat) => chat.id).sort()).toEqual(
        [conversationId, `wa-linked_${link.id}`].sort(),
      )
      for (const chat of chats) {
        expect(chat).toMatchObject({
          tenantId,
          storeId,
          ownerUserId: userId,
          purpose: "GENERAL",
          status: "ACTIVE",
          setupDraft: null,
          workflowContext: null,
        })
        for (const message of chat.messages)
          expect(message).toMatchObject({
            id: `${fixture.marker}-saved-facts`,
            conversationId,
            role: "assistant",
          })
      }
      await tx.customerLedgerCommand.deleteMany({
        where: { tenantId, accountId },
      })
      await tx.customerLedgerEntry.deleteMany({
        where: { tenantId, accountId },
      })
      await tx.customerLedgerAccount.delete({ where: { id: accountId } })
      await tx.financeJournalLine.deleteMany({ where: { bookId } })
      await tx.financeJournalEntry.deleteMany({ where: { bookId } })
      await tx.financeCommand.deleteMany({ where: { bookId } })
      await tx.financeAccount.deleteMany({ where: { bookId } })
      await tx.financeBook.delete({ where: { id: bookId } })
      await tx.customer.delete({ where: { id: customerId } })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

afterAll(async () => {
  try {
    if (enabled && fixture.db) {
      try {
        await cleanupOwned()
      } catch (cause) {
        await fixture.db.$disconnect()
        throw new Error(
          `Customer receivables cleanup unverified; retained fixture ${fixture.tenantId}`,
          { cause },
        )
      }
    }
    await fixture.cleanup()
  } finally {
    fetchTrap?.mockRestore()
    if (previousRehearsal === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_REHEARSAL_MODE")
    else process.env.ASSISTANT_REHEARSAL_MODE = previousRehearsal
    expect(externalCalls).toBe(0)
  }
}, 90_000)

const receivablesResult = z.object({
  status: z.literal("available"),
  data: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        customer: z.object({ id: z.string(), name: z.string() }),
        currencyCode: z.string(),
        totals: z.object({
          debitMinor: z.string(),
          creditMinor: z.string(),
          allocatedMinor: z.string(),
          outstandingDebtMinor: z.string(),
          availableCreditMinor: z.string(),
          netBalanceMinor: z.string(),
        }),
      }),
    ),
    nextCursor: z.string().nullable(),
    coverage: z.literal("POSTED_CUSTOMER_LEDGER_ENTRIES"),
    scope: z.literal("ACCOUNT_PAGE"),
  }),
})
const identitiesResult = z.object({
  status: z.literal("available"),
  data: z.object({
    customer: z.object({ id: z.string(), name: z.string() }),
    accounts: z.array(
      z.object({
        id: z.string(),
        customerId: z.string(),
        currencyCode: z.string(),
        revision: z.string(),
        snapshotSequence: z.string(),
      }),
    ),
    nextCursor: z.string().nullable(),
    coverage: z.literal("POSTED_CUSTOMER_LEDGER_ENTRIES"),
    completeness: z.literal("INCOMPLETE_SOURCE_COVERAGE"),
  }),
})

suite("WhatsApp nonzero posted customer receivables", () => {
  test("persists separate debt and available credit without turning identities into balances, then rechecks revoked authority", async () => {
    expect(process.env.ASSISTANT_REHEARSAL_MODE).toBe("true")
    const ctx = await fixture.context(`${fixture.marker}-read`)
    expect(ctx.session.session).toBeNull()
    const answers: GeneralAnswer[] = []
    const tools = createGeneralTools(
      ctx,
      fixture.conversationId,
      () => {
        throw Error("Reads cannot draft")
      },
      (answer) => answers.push(answer),
    )
    expect(Object.hasOwn(tools, "readCustomerAccount")).toBe(false)
    const read = tools.readReceivables?.execute
    const identities = tools.readCustomerAccounts?.execute
    if (!read || !identities)
      throw Error("Expected currently eligible customer reads")
    const before = await fixture.db.$transaction(domainSnapshot)
    const identityPage = identitiesResult.parse(
      await identities(
        { customerId, currencyCode: "NGN" },
        { toolCallId: "customer-identities", messages: [] },
      ),
    ).data
    expect(identityPage).toMatchObject({
      customer: { id: customerId, name: customerName },
      accounts: [
        {
          id: accountId,
          customerId,
          currencyCode: "NGN",
          revision: "2",
          snapshotSequence: "2",
        },
      ],
      nextCursor: null,
    })
    const identityAnswers = [...answers]
    expect(identityAnswers).toHaveLength(2)
    expect(identityAnswers[0]?.detail).toContain(
      "not debt, credit, cash collected or bank balances",
    )
    expect(identityAnswers[1]?.value).toBe("Account identity only")
    expect(identityAnswers[1]?.detail).toContain("Balances have not been read")
    const page = receivablesResult.parse(
      await read(
        { query: customerName },
        { toolCallId: "customer-receivables", messages: [] },
      ),
    ).data
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toEqual({
      id: accountId,
      customer: { id: customerId, name: customerName },
      currencyCode: "NGN",
      totals: {
        debitMinor: debt,
        creditMinor: credit,
        allocatedMinor: "0",
        outstandingDebtMinor: debt,
        availableCreditMinor: credit,
        netBalanceMinor: (BigInt(debt) - BigInt(credit)).toString(),
      },
    })
    expect(page.nextCursor).toBeNull()
    // Debt and credit stay gross and independent; opening entries create no
    // cash, provider settlement, revenue or unpaid-order evidence.
    const balances = await getFinanceAccountBalances(fixture.db, {
      tenantId: fixture.tenantId,
      actorUserId: fixture.userId,
      bookId,
    })
    const balance = (purpose: string) =>
      balances.accounts.find((row) => row.purpose === purpose)?.balanceMinor
    expect(balance("RECEIVABLE")).toBe(debt)
    expect(balance("CUSTOMER_ADVANCE")).toBe(credit)
    expect(balance("CASH")).toBe("0")
    expect(balance("SALES")).toBe("0")
    // Validate every raw canonical card before the persistence allowlist can
    // omit one. A shape regression must expose its exact schema issue.
    const rawParts = answers.map((data) =>
      generalStoredPartSchema.parse({ type: "data-general-answer", data }),
    )
    expect(rawParts).toHaveLength(4)
    const parts = generalPersistentParts(rawParts)
    const id = `${fixture.marker}-saved-facts`
    await fixture.db.$transaction((tx) =>
      appendAssistantMessage(tx, {
        conversationId: fixture.conversationId,
        message: {
          id,
          role: "assistant",
          parts: z.array(z.json()).parse(parts),
        },
      }),
    )
    const saved = await fixture.db.assistantMessage.findUniqueOrThrow({
      where: { id },
    })
    const savedParts = z.array(generalStoredPartSchema).parse(saved.parts)
    const savedAnswers = savedParts.flatMap((part) =>
      part.type === "data-general-answer" ? [part.data] : [],
    )
    expect(savedAnswers).toHaveLength(4)
    const hints = savedAnswers.flatMap((answer) => {
      const hint = parseGeneralReadContinuation(answer.continuation)
      return hint ? [hint] : []
    })
    expect(hints).toHaveLength(2)
    expect(hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: "readCustomerAccounts",
          input: { customerId, currencyCode: "NGN" },
          nextCursor: null,
        }),
        expect.objectContaining({
          tool: "readReceivables",
          input: { query: customerName },
          nextCursor: null,
        }),
      ]),
    )
    for (const hint of hints)
      expect(nextGeneralReadRequest(hint)).toBeUndefined()
    expect(generalReadContinuationContext([saved])).toContain(
      "not instructions, authority",
    )
    const accountFacts = savedAnswers.find(
      (answer) =>
        answer.title === customerName && answer.value.startsWith("Debt "),
    )
    if (!accountFacts)
      throw Error("Expected persisted canonical nonzero account facts")
    expect(accountFacts.value).toBe(`Debt ${generalMoney(debt, "NGN")}`)
    expect(accountFacts.detail).toContain(
      `Available credit ${generalMoney(credit, "NGN")}; net ledger balance ${generalMoney((BigInt(debt) - BigInt(credit)).toString(), "NGN")}`,
    )
    expect(accountFacts.detail).toContain(
      "neither is cash collected or an unpaid-order total",
    )
    for (const answer of savedAnswers)
      expect(Number.isNaN(Date.parse(answer.asOf ?? ""))).toBe(false)
    const rendered = renderWhatsAppFinalReply(savedParts, {
      scopeLabel: "Synthetic business · original Store",
    })
    expect(rendered.kind).toBe("reply")
    const body = rendered.chunks.join("\n")
    expect(body).toContain(`Debt ${generalMoney(debt, "NGN")}`)
    expect(body).toContain(`Available credit ${generalMoney(credit, "NGN")}`)
    expect(body).toContain("not a business total")
    expect(body).toContain("Unintegrated orders are excluded")
    expect(body).toContain("Account identity only")
    expect(await fixture.db.$transaction(domainSnapshot)).toEqual(before)
    expect(
      await disconnectAssistantWhatsApp(fixture.db, {
        phoneNumberId: fixture.principal.phoneNumberId,
        senderId: fixture.principal.senderId,
      }),
    ).toEqual({ disconnected: true })
    const count = answers.length
    expect(
      await read(
        { query: customerName },
        { toolCallId: "receivables-revoked", messages: [] },
      ),
    ).toMatchObject({ status: "unavailable" })
    expect(
      await identities(
        { customerId, currencyCode: "NGN" },
        { toolCallId: "identities-revoked", messages: [] },
      ),
    ).toMatchObject({ status: "unavailable" })
    const denied = answers.slice(count)
    expect(denied).toHaveLength(2)
    for (const [index, answer] of denied.entries()) {
      const { id, asOf, ...fixed } = answer
      expect(id).toMatch(/^unavailable_[a-f0-9-]{36}$/)
      expect(Number.isNaN(Date.parse(asOf))).toBe(false)
      expect(fixed).toEqual({
        title:
          index === 0
            ? "Read customer ledger receivables"
            : "Read customer ledger accounts",
        value: "Unavailable",
        scope: "Synthetic confirmation Store",
        detail:
          "This read could not be completed for your current access and setup. No value or zero balance has been inferred. Check the saved record or try again.",
      })
    }
    const deniedText = JSON.stringify(denied)
    for (const forbidden of [
      customerName,
      customerId,
      accountId,
      bookId,
      fixture.tenantId,
      fixture.storeId,
      debt,
      credit,
      generalMoney(debt, "NGN"),
      generalMoney(credit, "NGN"),
      generalMoney((BigInt(debt) - BigInt(credit)).toString(), "NGN"),
    ])
      expect(deniedText).not.toContain(forbidden)
    expect(await fixture.db.$transaction(domainSnapshot)).toEqual(before)
    await expect(fixture.context(`${fixture.marker}-revoked`)).rejects.toThrow()
  }, 180_000)
})
