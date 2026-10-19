import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  assertQaAccessAcceptanceDatabase,
  describeWithQaAccessDatabase,
} from "./acceptance/qa-access/database"
import { createSimpleCatalogItem } from "./catalog"
import { ensureCatalogFreeOfferingInTransaction } from "./catalog-free-lines"
import { updateCatalogPriceInTransaction } from "./catalog-price-update"
import {
  createProductUnitConfigurationDraft,
  publishProductUnitConfiguration,
  updateProductUnitConfigurationDraft,
} from "./catalog-unit-configurations"
import { createCommercialOrder } from "./commercial-orders"
import {
  createFinanceBook,
  createFinanceMoneyAccount,
  updateFinanceMoneyAccountPayments,
} from "./finance/accounts"
import { listOrderPaymentAccounts } from "./finance/order-payment-accounts"
import { getFinanceAccountBalances } from "./finance/reads"
import {
  type OfflineCommandEnvelope,
  offlineCommandEnvelopeHash,
  replayOfflineCommands,
} from "./offline-commands"
import { registerOwnedOfflineDevice } from "./offline-device-registration"
import { getOfflineOperationsPolicy } from "./offline-settings"

// Backend-only: five actual-command scenarios plus one explicitly synthetic
// archived-account contract seed. No native queue, HTTP, browser, provider or
// Production proof. Canonical replay/stock/payment writes are not intercepted.
const requestedRunId = process.env.QA_OFFLINE_CONFLICTS_RUN_ID
if (
  requestedRunId !== undefined &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestedRunId,
  )
)
  throw Error("QA_OFFLINE_CONFLICTS_RUN_ID must be a UUID")
const transactionOptions = { maxWait: 10000, timeout: 30000 }
const slugFor = (runId: string) => `offline-conflicts-${runId}`
const emailFor = (role: string, runId: string) =>
  `offline-conflicts-${role}-${runId}@example.invalid`
type PlannedUser = { id: string; email: string }

async function settledValues<T extends readonly unknown[]>(
  tasks: {
    [K in keyof T]: Promise<T[K]>
  },
): Promise<T> {
  const results = await Promise.allSettled(tasks)
  const errors = results.filter((result) => result.status === "rejected")
  if (errors.length === 1) throw errors[0]?.reason
  if (errors.length > 1)
    throw new AggregateError(
      errors.map((result) => result.reason),
      "Owned QA reads failed",
    )
  return results.map((result) => {
    if (result.status !== "fulfilled") throw Error("Unsettled QA read")
    return result.value
  }) as unknown as T
}

describeWithQaAccessDatabase("ordinary offline replay conflict matrix", () => {
  test("immutable pre-web drafts retain durable review conflicts and preserve all intervening web effects", async () => {
    assertQaAccessAcceptanceDatabase()
    const runId = requestedRunId ?? randomUUID()
    const started = Date.now()
    const progress = (stage: string) => {
      console.info(
        `[offline-conflicts QA ${runId}] ${stage} ${Date.now() - started}ms`,
      )
      // Keep three minutes for exact awaited cleanup; never race/abandon DB work.
      if (Date.now() - started > 720000)
        throw Error("Offline conflict scenario deadline")
    }
    progress("setup:start")
    const { prisma: db } = await import("../client")
    const plannedUsers: PlannedUser[] = []
    let tenantId: string | undefined
    const failures: unknown[] = []
    try {
      const users = []
      for (const role of ["owner", "rep"]) {
        progress(`setup:user-${role}`)
        const identity = { id: randomUUID(), email: emailFor(role, runId) }
        plannedUsers.push(identity)
        users.push(
          await db.user.create({
            data: {
              ...identity,
              name: `Offline conflicts QA ${role}`,
              ageBand: "ADULT",
              ageDeclaredAt: new Date(),
            },
          }),
        )
      }
      const [owner, rep] = users
      if (!owner || !rep) throw Error("Missing owned QA identities")
      tenantId = randomUUID()
      progress("setup:Tenant")
      const tenant = await db.tenant.create({
        data: {
          id: tenantId,
          name: "Offline replay conflicts QA",
          slug: slugFor(runId),
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          metadata: {
            retailOps: { subscription: { planId: "growth", status: "active" } },
          },
          users: {
            create: [
              { userId: owner.id, role: "OWNER", status: "ACTIVE" },
              {
                userId: rep.id,
                role: "CASHIER",
                status: "ACTIVE",
                staffAccessMode: "LEGACY",
                acceptedAt: new Date(),
              },
            ],
          },
        },
      })
      const store = await db.store.create({
        data: {
          tenantId: tenant.id,
          name: "Offline conflicts original Store",
          slug: "original",
          status: "ACTIVE",
        },
      })
      const actor = { actorUserId: owner.id, tenantId: tenant.id }
      const product = async (
        label: string,
        opening: string,
        priceMinor: number,
      ) => {
        progress(`setup:Product-${label}`)
        const item = await createSimpleCatalogItem(db, {
          ...actor,
          storeId: store.id,
          kind: "product",
          name: `Offline conflicts ${label}`,
          canonicalUnitName: "piece",
          openingStockQuantity: opening,
          priceMinor,
          clientOperationId: `${runId}:Product:${label}`,
        })
        const offering = item.variants[0]?.offerings[0]
        const balance = item.product?.stockBalances[0]
        const configuration = item.product?.currentUnitConfiguration
        if (!offering || !balance || !configuration || !item.product)
          throw Error("Product omitted its canonical stock proof")
        return { offering, balance, configuration, productId: item.product.id }
      }
      const priceProduct = await product("price", "10", 500)
      const configProduct = await product("configuration", "10", 500)
      const overlapProduct = await product("overlap", "3", 500)
      const controlProduct = await product("unrelated-web", "10", 750)
      progress("setup:hidden-Quick-sale-Offering")
      await db.$transaction(
        (tx) =>
          ensureCatalogFreeOfferingInTransaction(tx, {
            tenantId: tenant.id,
            storeId: store.id,
            currencyCode: "NGN",
            kind: "quick_sale",
          }),
        transactionOptions,
      )
      progress("setup:Finance")
      const book = await createFinanceBook(db, {
        ...actor,
        startsAt: new Date("2026-01-01T00:00:00Z"),
      })
      const cash = await db.financeAccount.findUniqueOrThrow({
        where: { bookId_code: { bookId: book.id, code: "1000" } },
      })
      const bank = await createFinanceMoneyAccount(db, {
        ...actor,
        bookId: book.id,
        code: "1191",
        name: "QA original transfer account",
        purpose: "BANK",
        paymentMethods: ["bank_transfer"],
      })
      const pausedCash = await createFinanceMoneyAccount(db, {
        ...actor,
        bookId: book.id,
        code: "1192",
        name: "QA original cash account",
        purpose: "CASH",
        paymentMethods: ["cash"],
      })
      const archivedBank = await createFinanceMoneyAccount(db, {
        ...actor,
        bookId: book.id,
        code: "1193",
        name: "QA synthetic archived transfer account",
        purpose: "BANK",
        paymentMethods: ["bank_transfer"],
      })
      expect(archivedBank.archivedAt).toBeNull()
      // Default Bank 1100 and default cash remain eligible alternatives. They
      // must never replace any explicitly selected original receiving account.
      const scope = {
        actorUserId: rep.id,
        tenantId: tenant.id,
        storeId: store.id,
        deviceId: `offline-conflicts-device-${runId}`,
      }
      const device = await registerOwnedOfflineDevice(db, {
        ...scope,
        platform: "ANDROID",
      })
      expect(
        await getOfflineOperationsPolicy(db, { tenantId: tenant.id }),
      ).toMatchObject({ enabled: true, approvalRequired: false })
      const productLine = (item: typeof priceProduct, quantity = "1") => ({
        offeringId: item.offering.id,
        quantity,
        expectedConfigurationVersionId: item.configuration.id,
        expectedFixedPriceMinor: item.offering.fixedPriceMinor ?? undefined,
        expectedBalanceRevision: item.balance.revision,
      })
      const draft = (
        label: string,
        lines: OfflineCommandEnvelope["payload"]["lines"],
        amountMinor: number,
        accountId = cash.id,
        method: "cash" | "bank_transfer" = "cash",
      ): OfflineCommandEnvelope => ({
        clientCommandId: `${runId}:${label}`,
        createdAtClient: new Date(),
        dependencyClientIds: [],
        eventVersion: 1,
        payload: {
          kind: "commercial_order",
          fulfillNow: true,
          lines,
          initialPayment: {
            amountMinor,
            clientPaymentId: `${runId}:${label}:payment`,
            method,
            moneyAccountId: accountId,
          },
        },
      })
      const insufficientLine = productLine(overlapProduct, "2")
      // A supported older envelope may omit this optional revision. Retain the
      // original configuration+price and reach actual insufficient-stock checking;
      // a modern revision-bound draft would stop earlier at BALANCE_REVISION_CHANGED.
      const {
        expectedBalanceRevision: _optionalRevision,
        ...revisionlessLine
      } = insufficientLine
      const cases = [
        {
          label: "price-changed",
          envelope: draft("price-changed", [productLine(priceProduct)], 500),
          conflictCode: "INVALID_COMMAND",
          conflictMessage:
            "The Offering price changed before Order confirmation.",
        },
        // Legal publication archives/replaces the captured Offering. Its actual
        // public conflict is offering-change, not a fabricated stale-config subtype.
        {
          label: "configuration-published",
          envelope: draft(
            "configuration-published",
            [productLine(configProduct)],
            500,
          ),
          conflictCode: "OFFERING_OR_PRICE_CHANGED",
          conflictMessage: "An Order line selected an unavailable Offering.",
        },
        {
          label: "overlap-insufficient-stock-legacy-revisionless",
          envelope: draft(
            "overlap-insufficient-stock",
            [revisionlessLine],
            1000,
          ),
          conflictCode: "INVALID_COMMAND",
          conflictMessage:
            "The selected Balance Source has insufficient available stock.",
        },
        {
          label: "payment-method-changed",
          envelope: draft(
            "payment-method-changed",
            [
              {
                custom: "quick_sale",
                amountMinor: 500,
                description: "Recorded transfer sale",
              },
            ],
            500,
            bank.id,
            "bank_transfer",
          ),
          conflictCode: "INVALID_COMMAND",
          conflictMessage: `${bank.name} doesn't take bank transfer payments. Choose another account.`,
        },
        {
          label: "payment-account-paused",
          envelope: draft(
            "payment-account-paused",
            [
              {
                custom: "quick_sale",
                amountMinor: 500,
                description: "Recorded cash sale",
              },
            ],
            500,
            pausedCash.id,
          ),
          conflictCode: "INVALID_COMMAND",
          conflictMessage: `${pausedCash.name} is paused for new payments. Choose another account.`,
        },
        {
          // Synthetic archived-state contract only. Account creation is real,
          // and it is active when this exact immutable draft is captured.
          label: "synthetic-archived-account-contract",
          envelope: draft(
            "synthetic-archived-account-contract",
            [
              {
                custom: "quick_sale",
                amountMinor: 500,
                description: "Recorded original transfer sale",
              },
            ],
            500,
            archivedBank.id,
            "bank_transfer",
          ),
          conflictCode: "INVALID_COMMAND",
          conflictMessage:
            "Choose an active cash or bank account from this business.",
        },
      ]
      const captured = cases.map(({ envelope }) => ({
        envelope: structuredClone(envelope),
        hash: offlineCommandEnvelopeHash(envelope),
      }))
      expect(
        await db.offlineCommand.count({ where: { tenantId: tenant.id } }),
      ).toBe(0)
      expect(
        await db.commercialOrder.count({ where: { tenantId: tenant.id } }),
      ).toBe(0)
      progress("captured:before-web")
      const webSale = (
        label: string,
        item: typeof priceProduct,
        quantity: string,
        amountMinor: number,
      ) =>
        createCommercialOrder(db, {
          ...actor,
          storeId: store.id,
          schemaVersion: 1,
          clientOrderId: `${runId}:web-${label}`,
          fulfillNow: true,
          lines: [productLine(item, quantity)],
          initialPayment: {
            amountMinor,
            clientPaymentId: `${runId}:web-${label}:payment`,
            method: "cash",
            moneyAccountId: cash.id,
          },
        })
      progress("web:overlapping-sale")
      const overlappingWeb = await webSale("overlap", overlapProduct, "2", 1000)
      progress("web:unrelated-control-sale")
      const unrelatedWeb = await webSale("unrelated", controlProduct, "1", 750)
      progress("web:change-price")
      const price = await db.sellableOffering.findUniqueOrThrow({
        where: { id: priceProduct.offering.id },
        select: { revision: true },
      })
      const changedPrice = await db.$transaction(
        (tx) =>
          updateCatalogPriceInTransaction(tx, {
            ...actor,
            offeringId: priceProduct.offering.id,
            expectedRevision: price.revision,
            priceMinor: 600,
            reason: "QA web price changed after offline capture",
          }),
        transactionOptions,
      )
      expect(changedPrice).toMatchObject({
        previousPriceMinor: 500,
        priceMinor: 600,
        revision: price.revision + 1,
      })
      progress("web:publish-unit-configuration")
      const configDraft = await createProductUnitConfigurationDraft(db, {
        tenantId: tenant.id,
        productId: configProduct.productId,
      })
      await updateProductUnitConfigurationDraft(db, {
        tenantId: tenant.id,
        configurationId: configDraft.id,
        canonicalBalanceScale: configDraft.canonicalBalanceScale,
        // Rename only: a legal label-only publication changes configuration and
        // Offering identity without a fake stock transition over live stock.
        units: configDraft.units.map((unit) => ({
          ...unit,
          name: `${unit.name} reviewed`,
          symbol: unit.symbol ?? undefined,
          unitDefinitionId: unit.unitDefinitionId ?? undefined,
        })),
      })
      const published = await publishProductUnitConfiguration(db, {
        ...actor,
        configurationId: configDraft.id,
      })
      expect(published).toMatchObject({ id: configDraft.id, status: "current" })
      expect(published.id).not.toBe(configProduct.configuration.id)
      expect(
        await db.sellableOffering.findUniqueOrThrow({
          where: { id: configProduct.offering.id },
          select: { status: true },
        }),
      ).toEqual({ status: "ARCHIVED" })
      expect(
        (
          await db.catalogProduct.findUniqueOrThrow({
            where: { id: configProduct.productId },
            select: { currentUnitConfigurationVersionId: true },
          })
        ).currentUnitConfigurationVersionId,
      ).toBe(published.id)
      progress("web:change-payment-method-and-pause-original-account")
      const changedBank = await updateFinanceMoneyAccountPayments(db, {
        ...actor,
        bookId: book.id,
        accountId: bank.id,
        paymentMethods: ["pos"],
        availableForPayments: true,
      })
      const paused = await updateFinanceMoneyAccountPayments(db, {
        ...actor,
        bookId: book.id,
        accountId: pausedCash.id,
        paymentMethods: ["cash"],
        availableForPayments: false,
      })
      expect(changedBank.paymentMethods).toEqual(["POS"])
      expect(changedBank.paymentsPausedAt).toBeNull()
      expect(paused.paymentsPausedAt).toBeInstanceOf(Date)
      progress("synthetic-QA-seed:archived-account-contract-only")
      const archivedAt = new Date()
      await db.$transaction(async (tx) => {
        assertQaAccessAcceptanceDatabase()
        const owned = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Tenant" WHERE "id"=${tenant.id}
            AND "slug"=${slugFor(runId)} AND "dataClassification"='QA'
          FOR UPDATE
        `
        if (owned.length !== 1)
          throw Error(
            "Synthetic archived-account seed requires exact QA Tenant",
          )
        const account = await tx.financeAccount.findFirst({
          where: {
            id: archivedBank.id,
            bookId: book.id,
            book: { tenantId: tenant.id },
            archivedAt: null,
          },
          select: {
            id: true,
            bookId: true,
            book: { select: { tenantId: true } },
          },
        })
        if (
          !account ||
          account.id !== archivedBank.id ||
          account.bookId !== book.id ||
          account.book.tenantId !== tenant.id
        )
          throw Error(
            "Synthetic archived-account seed requires exact owned Book/account",
          )
        // Explicit synthetic QA exception: no legal permanent-close API exists.
        // This changes only this owned account's archivedAt, not any money facts,
        // and does not model a canonical web closure action or a closure race.
        await tx.financeAccount.update({
          where: { id: archivedBank.id, bookId: book.id },
          data: { archivedAt },
        })
      }, transactionOptions)
      expect(
        await db.financeAccount.findUniqueOrThrow({
          where: { id: archivedBank.id, bookId: book.id },
          select: { archivedAt: true },
        }),
      ).toEqual({ archivedAt })
      const options = await listOrderPaymentAccounts(db, {
        tenantId: tenant.id,
        currencyCode: "NGN",
      })
      expect(options.accounts.find((a) => a.id === bank.id)).toMatchObject({
        paymentMethods: ["pos"],
        paused: false,
      })
      expect(
        options.accounts.find((a) => a.id === pausedCash.id),
      ).toMatchObject({ paymentMethods: ["cash"], paused: true })
      expect(
        options.accounts.some(
          (a) =>
            a.id !== bank.id &&
            !a.paused &&
            a.paymentMethods.includes("bank_transfer"),
        ),
      ).toBe(true)
      expect(options.accounts.find((a) => a.id === cash.id)).toMatchObject({
        paymentMethods: ["cash"],
        paused: false,
      })
      expect(options.accounts.some((a) => a.id === archivedBank.id)).toBe(false)
      // The original five scenarios use actual web/domain commands. The sixth
      // covers only a deliberately seeded archived-state canonical refusal.
      // A legal permanent-close workflow/UI and closure race remain uncovered.
      const graph = {
        payments: { orderBy: { id: "asc" as const } },
        lines: {
          orderBy: { id: "asc" as const },
          include: {
            snapshot: true,
            stockReservation: true,
            serviceFulfillment: true,
            productFulfillments: {
              include: {
                stockOperation: {
                  include: { movements: { orderBy: { id: "asc" as const } } },
                },
              },
            },
          },
        },
      } satisfies Prisma.CommercialOrderInclude
      const snapshot = async () => {
        const where = { tenantId: tenant.id }
        const [
          orders,
          balances,
          operations,
          reservations,
          serviceFulfillments,
          valuationEvents,
          valuationPools,
          journals,
          financeCommands,
          ledgerEntries,
          ledgerCommands,
          ledgerAccounts,
          finance,
          sequence,
        ] = await settledValues([
          db.commercialOrder.findMany({
            where,
            include: graph,
            orderBy: { id: "asc" },
          }),
          db.stockBalanceSource.findMany({ where, orderBy: { id: "asc" } }),
          db.stockOperation.findMany({
            where,
            include: { movements: { orderBy: { id: "asc" } } },
            orderBy: { id: "asc" },
          }),
          db.stockReservation.findMany({ where, orderBy: { id: "asc" } }),
          db.commercialServiceFulfillment.findMany({
            where,
            orderBy: { id: "asc" },
          }),
          db.financeInventoryValuationEvent.findMany({
            where,
            orderBy: { id: "asc" },
          }),
          db.financeInventoryPool.findMany({ where, orderBy: { id: "asc" } }),
          db.financeJournalEntry.findMany({
            where: { bookId: book.id },
            include: { lines: { orderBy: { id: "asc" } } },
            orderBy: { id: "asc" },
          }),
          db.financeCommand.findMany({
            where: { bookId: book.id },
            orderBy: { id: "asc" },
          }),
          db.customerLedgerEntry.findMany({ where, orderBy: { id: "asc" } }),
          db.customerLedgerCommand.findMany({ where, orderBy: { id: "asc" } }),
          db.customerLedgerAccount.findMany({ where, orderBy: { id: "asc" } }),
          getFinanceAccountBalances(db, { ...actor, bookId: book.id }),
          db.tenant.findUniqueOrThrow({
            where: { id: tenant.id },
            select: { lastCommercialOrderSequence: true },
          }),
        ])
        return {
          orders,
          balances,
          operations,
          reservations,
          serviceFulfillments,
          valuationEvents,
          valuationPools,
          journals,
          financeCommands,
          ledgerEntries,
          ledgerCommands,
          ledgerAccounts,
          accountBalances: finance.accounts
            .map(({ id, balanceMinor }) => ({ id, balanceMinor }))
            .sort((a, b) => a.id.localeCompare(b.id)),
          financeSequence: finance.snapshotSequence,
          orderSequence: sequence.lastCommercialOrderSequence,
        }
      }
      progress("web:baseline-and-proof")
      const baseline = await snapshot()
      expect(baseline.orders).toHaveLength(2)
      expect(baseline.orders.map((o) => o.id).sort()).toEqual(
        [overlappingWeb.id, unrelatedWeb.id].sort(),
      )
      for (const web of baseline.orders) {
        expect(web).toMatchObject({
          createdByUserId: owner.id,
          status: "COMPLETED",
        })
        expect(web.payments).toHaveLength(1)
        expect(web.payments[0]).toMatchObject({
          recordedByUserId: owner.id,
          moneyAccountId: cash.id,
        })
        expect(web.lines[0]?.stockReservation?.status).toBe("COMMITTED")
        expect(web.lines[0]?.productFulfillments).toHaveLength(1)
      }
      expect(
        baseline.orders.find((o) => o.id === overlappingWeb.id)?.payments[0]
          ?.amountMinor,
      ).toBe(1000)
      expect(
        baseline.orders.find((o) => o.id === unrelatedWeb.id)?.payments[0]
          ?.amountMinor,
      ).toBe(750)
      expect(
        baseline.balances
          .find((b) => b.id === overlapProduct.balance.id)
          ?.onHandQuantity.toFixed(),
      ).toBe("1")
      expect(
        baseline.balances
          .find((b) => b.id === priceProduct.balance.id)
          ?.onHandQuantity.toFixed(),
      ).toBe("10")
      expect(
        baseline.balances
          .find((b) => b.id === configProduct.balance.id)
          ?.onHandQuantity.toFixed(),
      ).toBe("10")
      expect(
        baseline.balances
          .find((b) => b.id === controlProduct.balance.id)
          ?.onHandQuantity.toFixed(),
      ).toBe("9")
      expect(
        baseline.accountBalances.find((a) => a.id === cash.id)?.balanceMinor,
      ).toBe("1750")
      expect(
        baseline.accountBalances.find((a) => a.id === bank.id)?.balanceMinor,
      ).toBe("0")
      expect(
        baseline.accountBalances.find((a) => a.id === pausedCash.id)
          ?.balanceMinor,
      ).toBe("0")
      expect(
        baseline.accountBalances.find((a) => a.id === archivedBank.id)
          ?.balanceMinor,
      ).toBe("0")
      const readCommands = () =>
        db.offlineCommand.findMany({
          where: { tenantId: tenant.id },
          orderBy: { clientCommandId: "asc" },
        })
      const upload = () =>
        replayOfflineCommands(db, {
          ...scope,
          acceptNewCommands: true,
          requiresApproval: false,
          capabilities: { operateOrders: true },
          commands: cases.map((c) => c.envelope),
        })
      progress("ordinary-replay:six-current-conflicts")
      const first = await upload()
      expect(first).toHaveLength(cases.length)
      for (const [index, scenario] of cases.entries()) {
        expect(first[index]).toMatchObject({
          clientCommandId: scenario.envelope.clientCommandId,
          status: "REVIEW_REQUIRED",
          conflictCode: scenario.conflictCode,
          conflictMessage: scenario.conflictMessage,
          result: null,
        })
      }
      const durable = await readCommands()
      expect(durable).toHaveLength(cases.length)
      for (const [index, scenario] of cases.entries()) {
        const original = captured[index]
        if (!original) throw Error("Missing immutable capture")
        const saved = durable.find(
          (c) => c.clientCommandId === scenario.envelope.clientCommandId,
        )
        expect(saved).toMatchObject({
          tenantId: tenant.id,
          storeId: store.id,
          offlineDeviceId: device.id,
          status: "REVIEW_REQUIRED",
          payloadHash: original.hash,
          result: null,
          conflictCode: scenario.conflictCode,
          conflictMessage: scenario.conflictMessage,
          eventVersion: original.envelope.eventVersion,
          createdAtClient: original.envelope.createdAtClient,
          dependencyClientIds: original.envelope.dependencyClientIds,
          payload: JSON.parse(
            JSON.stringify({
              ...original.envelope.payload,
              actorUserId: rep.id,
            }),
          ),
        })
        expect(scenario.envelope).toEqual(original.envelope)
        expect(offlineCommandEnvelopeHash(scenario.envelope)).toBe(
          original.hash,
        )
      }
      // Includes complete unrelated web scalar/line/snapshot/payment/fulfillment
      // graphs, all stock, customer ledgers, journal lines and monetary balances.
      expect(await snapshot()).toEqual(baseline)
      progress("ordinary-replay:second-sync-stable")
      expect(await upload()).toEqual(first)
      expect(await readCommands()).toEqual(durable)
      expect(await snapshot()).toEqual(baseline)
      expect(
        await db.offlineConflictReview.count({
          where: { command: { tenantId: tenant.id } },
        }),
      ).toBe(0)
      expect(
        await db.membership.findFirstOrThrow({
          where: { userId: rep.id, tenantId: tenant.id },
          select: { role: true, status: true, staffAccessMode: true },
        }),
      ).toMatchObject({
        role: "CASHIER",
        status: "ACTIVE",
        staffAccessMode: "LEGACY",
      })
      progress("scenario:complete")
    } catch (error) {
      failures.push(error)
      console.error(
        `[offline-conflicts QA ${runId}] scenario failure before cleanup`,
        error,
      )
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
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1)
      throw new AggregateError(
        failures,
        `Offline conflicts QA ${runId}: scenario/disposal failures (original first)`,
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
      `[offline-conflicts QA ${runId}] cleanup skipped: no fixture writes attempted`,
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
    throw Error(`Offline conflicts QA ${runId}: cleanup User proof failed`)
  if (
    tenant &&
    (tenant.slug !== `offline-conflicts-${runId}` ||
      tenant.dataClassification !== "QA")
  )
    throw Error(`Offline conflicts QA ${runId}: cleanup Tenant proof failed`)
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
      console.info(`[offline-conflicts QA ${runId}] cleanup:${label}`)
      try {
        await db.$transaction(async (tx) => {
          // Re-prove exact QA identity and hold its row in EVERY disposal
          // transaction; a prior successful group grants no later authority.
          const owned = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Tenant" WHERE "id"=${ownedTenantId}
              AND "slug"=${`offline-conflicts-${runId}`} AND "dataClassification"='QA'
            FOR UPDATE
          `
          if (owned.length !== 1)
            throw Error(
              `Offline conflicts QA ${runId}: cleanup Tenant proof failed`,
            )
          await work(tx)
        }, transactionOptions)
      } catch (error) {
        throw new Error(
          `Offline conflicts QA ${runId}: cleanup group ${label} failed`,
          { cause: error },
        )
      }
    }
    await group("offline-and-activity", async (tx) => {
      await tx.offlineCommand.deleteMany({ where })
      await tx.businessActivityEvent.deleteMany({ where })
    })
    await group("fulfillment-and-reservations", async (tx) => {
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
      // Dispose the actual web Product costing and any unexpected owned effect
      // before removing its stock provenance; no cross-Tenant rows are touched.
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
      throw Error(`Offline conflicts QA ${runId}: cleanup User proof failed`)
    if (
      (await tx.membership.count({ where: { userId: { in: userIds } } })) !== 0
    )
      throw Error(
        `Offline conflicts QA ${runId}: foreign membership prevents User disposal`,
      )
    if (owned.length > 0)
      await tx.user.deleteMany({
        where: { OR: owned.map(({ id, email }) => ({ id, email })) },
      })
  }, transactionOptions)
  const residual = await settledValues([
    db.user.count({ where: { id: { in: userIds } } }),
    ...(tenantId
      ? [
          db.tenant.count({ where: { id: tenantId } }),
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
    throw Error(`Offline conflicts QA ${runId}: cleanup left owned rows`)
  console.info(`[offline-conflicts QA ${runId}] cleanup zero owned rows`)
  return true
}
