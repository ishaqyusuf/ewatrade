import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes, randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { createFinanceBook } from "../finance/accounts"
import { postCommerceFinanceJournalInTransaction } from "../finance/posting"
import { getCustomerLedgerAccountDetail } from "./account-reads"
import { ensureCustomerLedgerAccount } from "./accounts"
import { applyCustomerLedgerCredit } from "./allocations"
import { encryptCustomerRefundDestination } from "./funds-destination"
import {
  cancelCustomerFundsRefund,
  completeCustomerFundsRefund,
  getCustomerFundsRefundDetail,
  requestCustomerFundsRefund,
  reserveCustomerFundsRefund,
} from "./funds-refunds"
import { applyVerifiedCustomerCredit } from "./public-credit"
import { getVerifiedCustomerFunds } from "./public-funds"
import { recordCustomerLedgerReceipt } from "./receipts"
import { refundCustomerLedgerCredit } from "./refunds"
import { reverseCustomerLedgerEntry } from "./reversals"

const transactionOptions = { maxWait: 10_000, timeout: 30_000 }

/** Only instrumentation: both canonical roots execute on real concurrent database transactions. */
async function twoSessionRace(
  db: PrismaClient,
  operations: [
    (client: PrismaClient) => Promise<unknown>,
    (client: PrismaClient) => Promise<unknown>,
  ],
) {
  let arrivals = 0
  let openGate: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    openGate = resolve
  })
  const backendIds: number[] = []
  const client = () =>
    new Proxy(db, {
      get(target, property, receiver) {
        if (property !== "$transaction")
          return Reflect.get(target, property, receiver)
        return (
          run: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options?: {
            maxWait?: number
            timeout?: number
            isolationLevel?: Prisma.TransactionIsolationLevel
          },
        ) =>
          target.$transaction(async (tx) => {
            const [backend] = await tx.$queryRaw<
              Array<{ backendId: number }>
            >`SELECT pg_backend_pid() AS "backendId"`
            if (!backend)
              throw new Error("A real transaction session is required")
            backendIds.push(backend.backendId)
            if (++arrivals === 2) openGate()
            await gate
            return run(tx)
          }, options)
      },
    })
  const results = await Promise.allSettled([
    operations[0](client()),
    operations[1](client()),
  ])
  expect(new Set(backendIds).size).toBe(2)
  expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1)
  const failures = results.filter(
    (row): row is PromiseRejectedResult => row.status === "rejected",
  )
  expect(failures).toHaveLength(1)
  for (const failure of failures)
    expect(failure.reason).toMatchObject({ code: "CONFLICT" })
}
function assertFixture(
  value: { slug: string; dataClassification: string } | null,
  slug: string,
) {
  if (value?.slug !== slug || value.dataClassification !== "QA")
    throw new Error("Refusing non-fixture cleanup")
}

async function createFixture(db: PrismaClient) {
  const runId = randomUUID()
  const ownerId = randomUUID()
  const customerUserId = randomUUID()
  const otherUserId = randomUUID()
  const slug = `funds-boundaries-${runId}`
  const users = [
    {
      id: ownerId,
      email: `${slug}-owner@example.invalid`,
      name: "Funds boundaries owner",
      emailVerified: true,
    },
    {
      id: customerUserId,
      email: `${slug}-customer@example.invalid`,
      name: "Funds boundaries customer",
      emailVerified: true,
    },
    {
      id: otherUserId,
      email: `${slug}-other@example.invalid`,
      name: "Funds boundaries other",
      emailVerified: true,
    },
  ]
  let tenantId: string | undefined
  let bookId: string | undefined
  const cleanup = async () => {
    if (tenantId) {
      assertFixture(
        await db.tenant.findUnique({
          where: { id: tenantId },
          select: { slug: true, dataClassification: true },
        }),
        slug,
      )
      await db.$transaction(
        async (tx) => {
          await tx.commercialOrderPayment.deleteMany({
            where: { tenantId },
          })
          await tx.customerFundsRefundRequest.deleteMany({
            where: { tenantId },
          })
          await tx.customerLedgerCommand.deleteMany({ where: { tenantId } })
          await tx.customerLedgerAllocationRelease.deleteMany({
            where: { allocation: { credit: { tenantId } } },
          })
          await tx.customerLedgerAllocation.deleteMany({
            where: { credit: { tenantId } },
          })
          await tx.customerLedgerReceipt.deleteMany({
            where: { entry: { tenantId } },
          })
          await tx.customerLedgerEntry.deleteMany({
            where: { tenantId, reversalOfId: { not: null } },
          })
          await tx.customerLedgerEntry.deleteMany({ where: { tenantId } })
          await tx.customerLedgerAccount.deleteMany({ where: { tenantId } })
          await tx.manualPaymentAttempt.deleteMany({ where: { tenantId } })
          await tx.manualPaymentLink.deleteMany({ where: { tenantId } })
          if (bookId) {
            await tx.financeCommand.deleteMany({ where: { bookId } })
            await tx.financeJournalLine.deleteMany({ where: { bookId } })
            await tx.financeJournalEntry.deleteMany({
              where: { bookId, reversalOfId: { not: null } },
            })
            await tx.financeJournalEntry.deleteMany({ where: { bookId } })
            await tx.financeAccount.deleteMany({ where: { bookId } })
            await tx.financeBook.delete({ where: { id: bookId } })
          }
          await tx.commercialOrder.deleteMany({ where: { tenantId } })
          await tx.store.deleteMany({ where: { tenantId } })
          await tx.customer.deleteMany({ where: { tenantId } })
          await tx.tenant.delete({ where: { id: tenantId } })
        },
        { ...transactionOptions },
      )
    }
    await db.session.deleteMany({
      where: { userId: { in: users.map((row) => row.id) } },
    })
    await db.user.deleteMany({
      where: { OR: users.map((row) => ({ id: row.id, email: row.email })) },
    })
  }
  try {
    await db.user.createMany({ data: users })
    const tenant = await db.tenant.create({
      data: {
        name: "Funds boundaries QA",
        slug,
        type: "MERCHANT",
        enabledModes: ["MERCHANT"],
        dataClassification: "QA",
        users: {
          create: { userId: ownerId, role: "OWNER", status: "ACTIVE" },
        },
      },
    })
    tenantId = tenant.id
    const actor = { tenantId: tenant.id, actorUserId: ownerId }
    const book = await createFinanceBook(db, {
      ...actor,
      startsAt: new Date("2026-01-01"),
    })
    bookId = book.id
    const store = await db.store.create({
      data: {
        tenantId: tenant.id,
        name: "Funds boundaries store",
        slug: "funds-boundaries",
        status: "ACTIVE",
      },
    })
    const bank = await db.financeAccount.findFirstOrThrow({
      where: { bookId: book.id, code: "1100" },
    })
    const key = randomBytes(32).toString("base64")
    const createSource = async (
      label: string,
      billed: boolean,
      email?: string,
    ) => {
      const customer = await db.customer.create({
        data: {
          tenantId: tenant.id,
          name: `Funds boundaries ${label}`,
          ...(email ? { email, normalizedEmail: email } : {}),
        },
      })
      const account = await ensureCustomerLedgerAccount(db, {
        ...actor,
        customerId: customer.id,
        currencyCode: "NGN",
      })
      const order = await db.commercialOrder.create({
        data: {
          tenantId: tenant.id,
          storeId: store.id,
          customerId: customer.id,
          clientOrderId: `${runId}:${label}`,
          payloadHash: "funds-boundaries-fixture",
          orderNumber: `QA-${label}`,
          currencyCode: "NGN",
          subtotalMinor: 10000,
          totalMinor: 10000,
          status: "CONFIRMED",
          createdByUserId: ownerId,
        },
      })
      if (billed)
        await db.$transaction(
          (tx) =>
            postCommerceFinanceJournalInTransaction(tx, {
              tenantId: tenant.id,
              orderId: order.id,
              event: "BILLED",
            }),
          { ...transactionOptions },
        )
      const receipt = await recordCustomerLedgerReceipt(db, {
        ...actor,
        bookId: book.id,
        accountId: account.id,
        moneyAccountId: bank.id,
        clientCommandId: `${label}:receipt`,
        amountMinor: "10000",
        method: "BANK_TRANSFER",
        description: "Isolated funds boundary receipt",
      })
      const saved = await db.customerLedgerReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
      })
      const charge = billed
        ? await db.customerLedgerEntry.findUniqueOrThrow({
            where: {
              tenantId_sourceKind_sourceId: {
                tenantId: tenant.id,
                sourceKind: "COMMERCIAL_ORDER_BILLED",
                sourceId: order.id,
              },
            },
          })
        : null
      const encrypted = encryptCustomerRefundDestination(
        {
          bankCode: "058",
          accountNumber: "1234567890",
          accountName: "Isolated QA customer",
        },
        {
          tenantId: tenant.id,
          accountId: account.id,
          creditEntryId: saved.entryId,
        },
        key,
      )
      const revision = async () =>
        (
          await db.customerLedgerAccount.findUniqueOrThrow({
            where: { id: account.id },
            select: { revision: true },
          })
        ).revision.toString()
      const detail = () =>
        getCustomerLedgerAccountDetail(db, {
          ...actor,
          accountId: account.id,
        })
      return {
        label,
        customer,
        account,
        order,
        creditEntryId: saved.entryId,
        charge,
        encrypted,
        revision,
        detail,
      }
    }
    const request = async (
      source: Awaited<ReturnType<typeof createSource>>,
      amountMinor: string,
      command: string,
    ) =>
      requestCustomerFundsRefund(db, {
        ...actor,
        bookId: book.id,
        accountId: source.account.id,
        creditEntryId: source.creditEntryId,
        clientCommandId: command,
        expectedRevision: await source.revision(),
        amountMinor,
        reason: "Isolated return review",
        ...source.encrypted,
      })

    return {
      db,
      runId,
      ownerId,
      customerUserId,
      otherUserId,
      slug,
      tenant,
      actor,
      book,
      bank,
      store,
      key,
      createSource,
      request,
      cleanup,
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}

type Fixture = Awaited<ReturnType<typeof createFixture>>
type Source = Awaited<ReturnType<Fixture["createSource"]>>
type PublicState = {
  source: Source
  principal: {
    linkId: string
    authenticatedUserId: string
    authenticatedSessionId: string
  }
  refund: Awaited<ReturnType<typeof requestCustomerFundsRefund>>
  reserve: Parameters<typeof reserveCustomerFundsRefund>[1]
  apply: Parameters<typeof applyVerifiedCustomerCredit>[1]
}

/** Build only the completion preconditions when a filtered run skips public-proof cases. */
async function prepareCompletionSource(shared: Fixture): Promise<PublicState> {
  const {
    db,
    runId,
    slug,
    actor,
    ownerId,
    customerUserId,
    tenant,
    book,
    bank,
    store,
    key,
    createSource,
    request,
  } = shared
  const source = await createSource(
    "completion",
    false,
    `${slug}-customer@example.invalid`,
  )
  const session = await db.session.create({
    data: {
      userId: customerUserId,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  })
  const link = await db.manualPaymentLink.create({
    data: {
      tenantId: tenant.id,
      orderId: source.order.id,
      bankAccountId: bank.id,
      clientLinkId: `${runId}:completion`,
      amountMinor: 10000,
      currencyCode: "NGN",
      allowPartial: true,
      bankName: "Isolated QA bank",
      bankAccountNumber: "1234567890",
      bankAccountHolder: "QA business",
      createdByUserId: ownerId,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  })
  await db.manualPaymentAttempt.create({
    data: {
      tenantId: tenant.id,
      linkId: link.id,
      clientAttemptId: "initial",
      sequence: 1,
      paymentReference: `QA-COMPLETE-${runId}`,
    },
  })
  const principal = {
    linkId: link.id,
    authenticatedUserId: customerUserId,
    authenticatedSessionId: session.id,
  }
  const refund = await request(source, "3000", "completion:refund-request")
  const reserve = {
    ...actor,
    bookId: book.id,
    accountId: source.account.id,
    requestId: refund.id,
    expectedVersion: refund.version,
    expectedRevision: await source.revision(),
    clientCommandId: "completion:reserve",
    expectedDestinationFingerprint: source.encrypted.destinationFingerprint,
    identityReviewAttested: true as const,
  }
  await reserveCustomerFundsRefund(db, reserve, key)
  const apply = {
    ...principal,
    clientCommandId: "completion:apply",
    expectedRevision: await source.revision(),
    expectedOrderTotalMinor: "10000",
    expectedOrderPaidMinor: "0",
    amountMinor: "1000",
  }
  await applyVerifiedCustomerCredit(db, apply)
  return { source, principal, refund, reserve, apply }
}

describeWithServiceCommerceDatabase(
  "MB-01 funds concurrency, proof and refund boundaries",
  () => {
    let shared: Fixture | undefined
    let publicState: PublicState | undefined
    let publicPreparationStarted = false
    const fixture = () => {
      if (!shared) throw new Error("The isolated fixture must be ready")
      return shared
    }
    beforeAll(async () => {
      const { prisma: db } = await import("../../client")
      shared = await createFixture(db)
    }, 180_000)
    afterAll(async () => {
      if (shared) await shared.cleanup()
    }, 60_000)

    for (const kind of [
      "allocation",
      "direct-refund",
      "receipt-reversal",
    ] as const) {
      test(`two real sessions: reservation versus ${kind} conserves the exact source`, async () => {
        const { db, actor, tenant, book, bank, key, createSource, request } =
          fixture()
        const source = await createSource(kind, true)
        const row = await request(source, "7000", `${kind}:request`)
        const snapshot = await source.revision()
        const reserve = {
          ...actor,
          bookId: book.id,
          accountId: source.account.id,
          requestId: row.id,
          expectedVersion: row.version,
          expectedRevision: snapshot,
          clientCommandId: `${kind}:reserve`,
          expectedDestinationFingerprint:
            source.encrypted.destinationFingerprint,
          identityReviewAttested: true as const,
        }
        const effectiveAt = new Date()
        await twoSessionRace(db, [
          (client) => reserveCustomerFundsRefund(client, reserve, key),
          (client) => {
            if (kind === "allocation") {
              if (!source.charge)
                throw new Error("A billed allocation source is required")
              return applyCustomerLedgerCredit(client, {
                ...actor,
                bookId: book.id,
                accountId: source.account.id,
                creditEntryId: source.creditEntryId,
                chargeEntryId: source.charge.id,
                clientCommandId: `${kind}:competitor`,
                expectedRevision: snapshot,
                amountMinor: "7000",
              })
            }
            if (kind === "direct-refund")
              return refundCustomerLedgerCredit(client, {
                ...actor,
                bookId: book.id,
                accountId: source.account.id,
                creditEntryId: source.creditEntryId,
                clientCommandId: `${kind}:competitor`,
                expectedRevision: snapshot,
                amountMinor: "7000",
                moneyAccountId: bank.id,
                method: "BANK_TRANSFER",
                reference: "QA-RACE-RETURN",
                reason: "Isolated actual return record",
                effectiveAt,
              })
            return reverseCustomerLedgerEntry(client, {
              ...actor,
              bookId: book.id,
              accountId: source.account.id,
              entryId: source.creditEntryId,
              clientCommandId: `${kind}:competitor`,
              expectedRevision: snapshot,
              reason: "Isolated receipt correction",
              effectiveAt,
            })
          },
        ])
        const detail = await source.detail()
        const state = await db.customerFundsRefundRequest.findUniqueOrThrow({
          where: { id: row.id },
        })
        const reserved = state.status === "RESERVED" ? state.amountMinor : 0n
        expect(detail.reservedCreditMinor).toBe(reserved.toString())
        let consumed = 0n
        if (kind === "allocation")
          consumed = BigInt(
            (
              await db.commercialOrder.findUniqueOrThrow({
                where: { id: source.order.id },
              })
            ).amountPaidMinor,
          )
        else if (kind === "direct-refund")
          consumed =
            (
              await db.customerLedgerEntry.aggregate({
                where: {
                  accountId: source.account.id,
                  kind: "REFUND",
                  sourceKind: "CUSTOMER_HELD_CREDIT_REFUND",
                },
                _sum: { amountMinor: true },
              })
            )._sum.amountMinor ?? 0n
        else
          consumed =
            (
              await db.customerLedgerEntry.aggregate({
                where: {
                  accountId: source.account.id,
                  reversalOfId: source.creditEntryId,
                },
                _sum: { amountMinor: true },
              })
            )._sum.amountMinor ?? 0n
        expect(
          BigInt(detail.totals.availableCreditMinor) + reserved + consumed,
        ).toBe(10000n)
        expect(
          reserved === 7000n ||
            consumed === (kind === "receipt-reversal" ? 10000n : 7000n),
        ).toBe(true)
        if (state.status === "RESERVED") {
          await expect(
            refundCustomerLedgerCredit(db, {
              ...actor,
              bookId: book.id,
              accountId: source.account.id,
              creditEntryId: source.creditEntryId,
              clientCommandId: `${kind}:reserved-direct-refusal`,
              expectedRevision: await source.revision(),
              amountMinor: "4000",
              moneyAccountId: bank.id,
              method: "BANK_TRANSFER",
              reference: "QA-REFUSE",
              reason: "Do not consume held funds",
              effectiveAt: new Date(),
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" })
          await expect(
            reverseCustomerLedgerEntry(db, {
              ...actor,
              bookId: book.id,
              accountId: source.account.id,
              entryId: source.creditEntryId,
              clientCommandId: `${kind}:reserved-reversal-refusal`,
              expectedRevision: await source.revision(),
              reason: "Do not reverse held funds",
              effectiveAt: new Date(),
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" })
        }
      }, 180_000)
    }
    test("public customer proof invalidation, reserved-credit spend and exact replay", async () => {
      publicPreparationStarted = true
      const {
        db,
        runId,
        slug,
        actor,
        ownerId,
        customerUserId,
        otherUserId,
        tenant,
        book,
        bank,
        store,
        key,
        createSource,
        request,
      } = fixture()
      const customerEmail = `${slug}-customer@example.invalid`
      const source = await createSource("public", false, customerEmail)
      const foreignCustomer = await db.customer.create({
        data: {
          tenantId: tenant.id,
          name: "Other scoped customer",
          email: `${slug}-other@example.invalid`,
          normalizedEmail: `${slug}-other@example.invalid`,
        },
      })
      const session = await db.session.create({
        data: {
          userId: customerUserId,
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 60 * 60_000),
        },
      })
      const expired = await db.session.create({
        data: {
          userId: customerUserId,
          token: randomUUID(),
          expiresAt: new Date(Date.now() - 60_000),
        },
      })
      const otherSession = await db.session.create({
        data: {
          userId: otherUserId,
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 60 * 60_000),
        },
      })
      const link = await db.manualPaymentLink.create({
        data: {
          tenantId: tenant.id,
          orderId: source.order.id,
          bankAccountId: bank.id,
          clientLinkId: `${runId}:public`,
          amountMinor: 10000,
          currencyCode: "NGN",
          allowPartial: true,
          bankName: "Isolated QA bank",
          bankAccountNumber: "1234567890",
          bankAccountHolder: "QA business",
          createdByUserId: ownerId,
          expiresAt: new Date(Date.now() + 60 * 60_000),
        },
      })
      await db.manualPaymentAttempt.create({
        data: {
          tenantId: tenant.id,
          linkId: link.id,
          clientAttemptId: "initial",
          sequence: 1,
          paymentReference: `QA-${runId}`,
        },
      })
      const principal = {
        linkId: link.id,
        authenticatedUserId: customerUserId,
        authenticatedSessionId: session.id,
      }
      const before = await getVerifiedCustomerFunds(db, principal)
      expect(before).toMatchObject({
        status: "VERIFIED",
        availableMinor: "10000",
      })
      for (const invalid of [
        {
          ...principal,
          authenticatedUserId: null,
          authenticatedSessionId: null,
        },
        { ...principal, authenticatedSessionId: expired.id },
        { ...principal, authenticatedSessionId: otherSession.id },
        {
          ...principal,
          authenticatedUserId: otherUserId,
          authenticatedSessionId: otherSession.id,
        },
      ])
        expect(await getVerifiedCustomerFunds(db, invalid)).toEqual({
          status: "VERIFICATION_REQUIRED",
        })
      const customerCommand = {
        ...principal,
        clientCommandId: "public:apply",
        expectedRevision: await source.revision(),
        expectedOrderTotalMinor: "10000",
        expectedOrderPaidMinor: "0",
        amountMinor: "1000",
      }
      await db.customer.update({
        where: { id: source.customer.id },
        data: {
          email: `${slug}-changed@example.invalid`,
          normalizedEmail: `${slug}-changed@example.invalid`,
        },
      })
      expect(await getVerifiedCustomerFunds(db, principal)).toEqual({
        status: "VERIFICATION_REQUIRED",
      })
      await expect(
        applyVerifiedCustomerCredit(db, customerCommand),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await db.customer.update({
        where: { id: source.customer.id },
        data: { email: customerEmail, normalizedEmail: customerEmail },
      })
      await db.commercialOrder.update({
        where: { id: source.order.id },
        data: { customerId: foreignCustomer.id },
      })
      expect(await getVerifiedCustomerFunds(db, principal)).toEqual({
        status: "VERIFICATION_REQUIRED",
      })
      await expect(
        applyVerifiedCustomerCredit(db, customerCommand),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await db.commercialOrder.update({
        where: { id: source.order.id },
        data: { customerId: source.customer.id },
      })
      const refund = await request(source, "3000", "public:refund-request")
      const reserve = {
        ...actor,
        bookId: book.id,
        accountId: source.account.id,
        requestId: refund.id,
        expectedVersion: refund.version,
        expectedRevision: await source.revision(),
        clientCommandId: "public:reserve",
        expectedDestinationFingerprint: source.encrypted.destinationFingerprint,
        identityReviewAttested: true as const,
      }
      await expect(
        reserveCustomerFundsRefund(db, {
          ...reserve,
          actorUserId: customerUserId,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      for (const [label, unavailableKey] of [
        ["missing-key", ""],
        ["wrong-key", randomBytes(32).toString("base64")],
      ] as const) {
        await expect(
          reserveCustomerFundsRefund(
            db,
            { ...reserve, clientCommandId: `public:${label}` },
            unavailableKey,
          ),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(await source.revision()).toBe(reserve.expectedRevision)
        expect(
          await db.customerFundsRefundRequest.findUniqueOrThrow({
            where: { id: refund.id },
          }),
        ).toMatchObject({ status: "REQUESTED", version: 1 })
      }
      const differentDestination = encryptCustomerRefundDestination(
        {
          bankCode: "058",
          accountNumber: "1234567890",
          accountName: "Different isolated QA holder",
        },
        {
          tenantId: tenant.id,
          accountId: source.account.id,
          creditEntryId: source.creditEntryId,
        },
        key,
      )
      for (const [label, ciphertext] of [
        ["bad-ciphertext", "v1.invalid"],
        ["changed-destination", differentDestination.destinationCiphertext],
      ] as const) {
        await db.customerFundsRefundRequest.update({
          where: { id: refund.id },
          data: { destinationCiphertext: ciphertext },
        })
        await expect(
          reserveCustomerFundsRefund(
            db,
            { ...reserve, clientCommandId: `public:${label}` },
            key,
          ),
        ).rejects.toMatchObject({ code: "CONFLICT" })
        expect(await source.revision()).toBe(reserve.expectedRevision)
        expect(
          await db.customerFundsRefundRequest.findUniqueOrThrow({
            where: { id: refund.id },
          }),
        ).toMatchObject({ status: "REQUESTED", version: 1 })
      }
      await db.customerFundsRefundRequest.update({
        where: { id: refund.id },
        data: { destinationCiphertext: source.encrypted.destinationCiphertext },
      })
      await reserveCustomerFundsRefund(db, reserve, key)
      expect(await getVerifiedCustomerFunds(db, principal)).toMatchObject({
        status: "VERIFIED",
        availableMinor: "7000",
        reservedMinor: "3000",
      })
      const apply = {
        ...customerCommand,
        expectedRevision: await source.revision(),
      }
      const applied = await applyVerifiedCustomerCredit(db, apply)
      expect(await applyVerifiedCustomerCredit(db, apply)).toEqual(applied)
      await expect(
        applyVerifiedCustomerCredit(db, { ...apply, amountMinor: "2000" }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        applyVerifiedCustomerCredit(db, {
          ...apply,
          clientCommandId: "public:stale-snapshot",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(await getVerifiedCustomerFunds(db, principal)).toMatchObject({
        status: "VERIFIED",
        availableMinor: "6000",
        reservedMinor: "3000",
        orderPaidMinor: "1000",
      })
      publicState = { source, principal, refund, reserve, apply }
    }, 180_000)
    test("completion replay, revoked authority, child rollback and keyless cancellation", async () => {
      const {
        db,
        runId,
        actor,
        ownerId,
        customerUserId,
        tenant,
        book,
        bank,
        key,
        request,
      } = fixture()
      if (!publicState && publicPreparationStarted)
        throw new Error(
          "The public source proof must have passed before completion",
        )
      const { source, principal, refund, reserve, apply } =
        publicState ?? (await prepareCompletionSource(fixture()))
      const complete = {
        ...actor,
        bookId: book.id,
        accountId: source.account.id,
        requestId: refund.id,
        expectedVersion: 2,
        expectedRevision: await source.revision(),
        clientCommandId: "public:complete",
        moneyAccountId: bank.id,
        outgoingReference: `QA-OUT-${runId}`,
        effectiveAt: new Date(),
      }
      await expect(
        completeCustomerFundsRefund(db, {
          ...complete,
          actorUserId: customerUserId,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      const completed = await completeCustomerFundsRefund(db, complete)
      const refundCount = await db.customerLedgerEntry.count({
        where: { accountId: source.account.id, kind: "REFUND" },
      })
      expect(await completeCustomerFundsRefund(db, complete)).toEqual(completed)
      expect(
        await db.customerLedgerEntry.count({
          where: { accountId: source.account.id, kind: "REFUND" },
        }),
      ).toBe(refundCount)
      expect(completed).toMatchObject({
        status: "COMPLETED",
        outgoingReference: `QA-OUT-${runId}`,
      })
      await expect(
        completeCustomerFundsRefund(db, {
          ...complete,
          outgoingReference: "different-reference",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await db.membership.updateMany({
        where: { tenantId: tenant.id, userId: ownerId },
        data: { status: "SUSPENDED" },
      })
      await expect(
        completeCustomerFundsRefund(db, complete),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await db.membership.updateMany({
        where: { tenantId: tenant.id, userId: ownerId },
        data: { status: "ACTIVE" },
      })
      const pending = await request(source, "1000", "public:closed-request")
      await reserveCustomerFundsRefund(
        db,
        {
          ...reserve,
          requestId: pending.id,
          expectedVersion: pending.version,
          expectedRevision: await source.revision(),
          clientCommandId: "public:closed-reserve",
        },
        key,
      )
      const closedComplete = {
        ...complete,
        requestId: pending.id,
        expectedVersion: 2,
        expectedRevision: await source.revision(),
        clientCommandId: "public:closed-complete",
        outgoingReference: "QA-CLOSED-REFUSE",
        effectiveAt: new Date(),
      }
      await db.financeBook.update({
        where: { id: book.id },
        data: { closedThrough: new Date(Date.now() + 60_000) },
      })
      await expect(
        completeCustomerFundsRefund(db, closedComplete),
      ).rejects.toMatchObject({ code: "CLOSED_PERIOD" })
      expect(
        await db.customerFundsRefundRequest.findUniqueOrThrow({
          where: { id: pending.id },
        }),
      ).toMatchObject({ status: "RESERVED", version: 2 })
      expect(await source.revision()).toBe(closedComplete.expectedRevision)
      expect(
        await db.customerLedgerEntry.count({
          where: { accountId: source.account.id, kind: "REFUND" },
        }),
      ).toBe(refundCount)
      await db.financeBook.update({
        where: { id: book.id },
        data: { closedThrough: null },
      })
      const safe = await getCustomerFundsRefundDetail(
        db,
        { ...actor, requestId: pending.id },
        "",
      )
      expect(safe).toMatchObject({
        destination: null,
        destinationStatus: "UNAVAILABLE",
        canCancel: true,
      })
      await cancelCustomerFundsRefund(db, {
        ...actor,
        bookId: book.id,
        accountId: source.account.id,
        requestId: pending.id,
        expectedVersion: safe.version,
        expectedRevision: safe.accountRevision,
        clientCommandId: "public:cancel-hold",
      })
      expect(await getVerifiedCustomerFunds(db, principal)).toMatchObject({
        status: "VERIFIED",
        availableMinor: "6000",
        reservedMinor: "0",
      })
      await db.session.delete({
        where: { id: principal.authenticatedSessionId },
      })
      expect(await getVerifiedCustomerFunds(db, principal)).toEqual({
        status: "VERIFICATION_REQUIRED",
      })
      await expect(
        applyVerifiedCustomerCredit(db, apply),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      const [balanced] = await db.$queryRaw<Array<{ invalid: bigint }>>`
SELECT COUNT(*)::bigint AS invalid FROM (SELECT journal.id FROM "FinanceJournalEntry" journal JOIN "FinanceJournalLine" line ON line."entryId" = journal.id AND line."bookId" = journal."bookId" WHERE journal."bookId" = ${book.id} GROUP BY journal.id HAVING SUM(line."debitMinor") <> SUM(line."creditMinor")) invalid
      `
      expect(balanced?.invalid).toBe(0n)
    }, 180_000)
  },
)
