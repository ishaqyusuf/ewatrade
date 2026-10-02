import { expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { type CreateCatalogProductInput, createCatalogItem } from "../catalog"
import { correctStockOperation } from "../inventory-operations"
import { graduateServiceCommerceCatalogOffering } from "../service-commerce-graduation"
import { createFinanceBook } from "./accounts"
import { cleanupOpeningCostAcceptance } from "./opening-cost.integration-cleanup"
import { recordFinancePurchase } from "./purchases"
import { createFinanceSupplier } from "./supplier-writes"

setDefaultTimeout(900_000)

if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    target.hostname !==
      "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech" ||
    target.pathname !== "/neondb"
  )
    throw new Error(
      "Opening acceptance requires the exact development database.",
    )
}

describeWithServiceCommerceDatabase("Catalog opening cost acceptance", () => {
  test("captures fresh source costs atomically, retains no-Book replay and canonical graduation under concurrency", async () => {
    const { prisma: db } = await import("../../client")
    const runId = randomUUID()
    console.info(`opening-cost QA run ${runId}`)
    const tenantIds: string[] = []
    const userIds: string[] = []
    const bookIds: string[] = []
    try {
      const owner = await db.user.create({
        data: {
          email: `opening-cost-${runId}@example.invalid`,
          name: "Opening QA owner",
        },
      })
      userIds.push(owner.id)
      const manager = await db.user.create({
        data: {
          email: `opening-cost-manager-${runId}@example.invalid`,
          name: "Opening QA Inventory Manager",
        },
      })
      userIds.push(manager.id)
      async function makeTenant(label: string) {
        const tenant = await db.tenant.create({
          data: {
            name: `Opening cost QA ${label}`,
            slug: `opening-cost-${label}-${runId}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            users: {
              create: [
                { userId: owner.id, role: "OWNER", status: "ACTIVE" },
                { userId: manager.id, role: "MANAGER", status: "ACTIVE" },
              ],
            },
          },
        })
        tenantIds.push(tenant.id)
        const store = await db.store.create({
          data: {
            tenantId: tenant.id,
            name: "Private opening QA",
            slug: `opening-cost-${label}-${runId}`,
            countryCode: "NG",
            status: "ACTIVE",
          },
        })
        await db.serviceCommerceStoreProfile.create({
          data: {
            tenantId: tenant.id,
            storeId: store.id,
            status: "ACTIVE",
            catalogAdoptionMode: "PROGRESSIVE",
          },
        })
        await db.serviceCommercePolicyDecision.create({
          data: {
            tenantId: tenant.id,
            storeId: store.id,
            vertical: "SERVICE",
            channel: "STAFF",
            subject: "MANAGED_INVENTORY_GRADUATION",
            jurisdictionCode: "NG",
            outcome: "ALLOWED",
            effectiveAt: new Date("2026-01-01T00:00:00Z"),
            expiresAt: new Date("2030-01-01T00:00:00Z"),
            reviewedByUserId: owner.id,
            evidenceReference: `QA-only-evidence-${runId}`,
            approvalReference: `QA-only-approval-${runId}`,
            reason: "Run-owned private acceptance policy",
          },
        })
        return { tenant, store }
      }
      const known = await makeTenant("known")
      const noBook = await makeTenant("no-book")
      const book = await createFinanceBook(db, {
        tenantId: known.tenant.id,
        actorUserId: owner.id,
        startsAt: new Date("2026-01-01T00:00:00Z"),
      })
      bookIds.push(book.id)
      function catalogCommand(
        target: typeof known,
        label: string,
        quantities = ["4"],
      ): CreateCatalogProductInput {
        return {
          tenantId: target.tenant.id,
          storeId: target.store.id,
          actorUserId: owner.id,
          clientOperationId: `catalog-${label}-${runId}`,
          kind: "product",
          name: `QA opening ${label}`,
          ...(quantities.length > 1
            ? {
                optionGroups: [
                  {
                    key: "size",
                    name: "Size",
                    values: quantities.map((_, index) => ({
                      key: `size-${index}`,
                      label: `Size ${index}`,
                    })),
                  },
                ],
              }
            : {}),
          unitConfiguration: {
            canonicalBalanceScale: 18,
            units: [
              {
                key: "base",
                name: "unit",
                stockBehavior: "canonical_shared",
                transactionScale: 3,
                factor: "1",
              },
            ],
          },
          variants: quantities.map((quantity, index) => ({
            key: `variant-${index}`,
            name: `Variant ${index}`,
            isDefault: index === 0,
            openingStockQuantity: quantity,
            ...(quantities.length > 1
              ? {
                  selections: [{ groupKey: "size", valueKey: `size-${index}` }],
                }
              : {}),
            offerings: [
              {
                key: `offering-${index}`,
                name: "One unit",
                fixedPriceMinor: 5000,
                pricingPolicy: "fixed",
                inventoryUnitKey: "base",
              },
            ],
          })),
        }
      }
      const multipleInput = catalogCommand(known, "multiple", ["4", "0", "0.5"])
      const multiple = await createCatalogItem(db, multipleInput)
      const multipleRoots = multiple.product?.stockBalances
      expect(multipleRoots).toHaveLength(2)
      const multipleEvents = await db.financeInventoryValuationEvent.findMany({
        where: {
          balanceSourceId: { in: multipleRoots?.map((root) => root.id) },
        },
        include: { stockOperation: true, pool: true },
      })
      expect(multipleEvents).toHaveLength(2)
      for (const event of multipleEvents) {
        expect(event).toMatchObject({
          sourceKind: "CATALOG_OPENING",
          kind: "OPENING",
          sequence: 1n,
          valueBeforeMinor: 0n,
          valueAfterMinor: null,
          sourceCostMinor: null,
          unknownReason: "MISSING_OPENING_COST",
          actorUserId: owner.id,
        })
        expect(event.effectiveAt).toEqual(event.stockOperation?.effectiveAt)
        expect(event.pool.valueMinor).toBeNull()
      }
      expect(
        new Set(multipleEvents.map((event) => event.effectiveAt.getTime()))
          .size,
      ).toBe(1)
      const sourceReceipt = await db.catalogCommandReceipt.findUniqueOrThrow({
        where: {
          tenantId_clientOperationId: {
            tenantId: known.tenant.id,
            clientOperationId: multipleInput.clientOperationId,
          },
        },
      })
      expect(
        multipleEvents.every((event) => event.sourceId === sourceReceipt.id),
      ).toBe(true)
      const [sameA, sameB] = await Promise.all([
        createCatalogItem(db, catalogCommand(known, "concurrent")),
        createCatalogItem(db, catalogCommand(known, "concurrent")),
      ])
      expect(sameA.id).toBe(sameB.id)
      expect(
        await db.catalogCommandReceipt.count({
          where: { tenantId: known.tenant.id, catalogItemId: sameA.id },
        }),
      ).toBe(1)
      const zero = await createCatalogItem(
        db,
        catalogCommand(known, "zero", ["0"]),
      )
      expect(zero.product?.stockBalances).toHaveLength(0)
      const service = await createCatalogItem(db, {
        tenantId: known.tenant.id,
        storeId: known.store.id,
        actorUserId: owner.id,
        clientOperationId: `service-${runId}`,
        kind: "service",
        name: "QA mending",
        variants: [
          {
            key: "default",
            name: "Mending",
            isDefault: true,
            offerings: [
              {
                key: "mending",
                name: "Mending",
                fixedPriceMinor: 1000,
                pricingPolicy: "fixed",
                quantityScale: 0,
                workPolicy: "charge_only",
                authorizationPolicy: "on_order_confirmation",
              },
            ],
          },
        ],
      })
      expect(service.product).toBeNull()
      expect(
        await db.financeJournalEntry.count({ where: { bookId: book.id } }),
      ).toBe(0)

      const physicalInput = catalogCommand(noBook, "physical")
      const [physical, physicalReplay] = await Promise.all([
        createCatalogItem(db, physicalInput),
        createCatalogItem(db, physicalInput),
      ])
      expect(physical.id).toBe(physicalReplay.id)
      expect(
        await db.financeInventoryPool.count({
          where: { tenantId: noBook.tenant.id },
        }),
      ).toBe(0)
      const physicalOperation = await db.stockOperation.findFirstOrThrow({
        where: { tenantId: noBook.tenant.id, source: "catalog_setup" },
      })
      await expect(
        correctStockOperation(db, {
          tenantId: noBook.tenant.id,
          actorUserId: manager.id,
          clientOperationId: `correction-${runId}`,
          schemaVersion: 1,
          source: "inventory",
          reason: "QA owner bypass rejection",
          targetOperationId: physicalOperation.id,
          corrections: [],
        }),
      ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })

      async function draft(
        target: typeof known,
        label: string,
        configured = true,
      ) {
        const item = await db.catalogItem.create({
          data: {
            tenantId: target.tenant.id,
            slug: `graduation-${label}-${runId}`,
            kind: "PRODUCT",
            name: `QA graduation ${label}`,
            status: "DRAFT",
            product: { create: {} },
            variants: {
              create: {
                key: "default",
                name: "Default",
                isDefault: true,
                status: "DRAFT",
              },
            },
          },
          include: { product: true, variants: true },
        })
        const product = item.product
        const variant = item.variants[0]
        if (!product || !variant)
          throw new Error("Incomplete graduation fixture")
        const offering = await db.sellableOffering.create({
          data: {
            tenantId: target.tenant.id,
            catalogItemId: item.id,
            variantId: variant.id,
            name: "Private QA case",
            key: "case",
            kind: "PRODUCT_UNIT",
            status: "DRAFT",
            currencyCode: "NGN",
            fixedPriceMinor: 5000,
            pricingPolicy: "FIXED",
            storeAvailability: {
              create: { storeId: target.store.id, isAvailable: false },
            },
          },
        })
        let canonicalId: string | undefined
        let sellingId: string | undefined
        let configurationId: string | undefined
        if (configured) {
          const configuration = await db.unitConfigurationVersion.create({
            data: {
              productId: product.id,
              version: 1,
              status: "CURRENT",
              canonicalBalanceScale: 18,
              units: {
                create: [
                  {
                    key: "base",
                    name: "unit",
                    factor: "1",
                    transactionScale: 3,
                    stockBehavior: "CANONICAL_SHARED",
                  },
                  {
                    key: "case",
                    name: "case",
                    factor: "12",
                    transactionScale: 0,
                    stockBehavior: "PACKAGED_STOCK",
                  },
                ],
              },
            },
            include: { units: true },
          })
          canonicalId = configuration.units.find(
            (unit) => unit.key === "base",
          )?.id
          sellingId = configuration.units.find(
            (unit) => unit.key === "case",
          )?.id
          configurationId = configuration.id
          if (!canonicalId || !sellingId)
            throw new Error("Missing graduation units")
          await db.catalogProduct.update({
            where: { id: product.id },
            data: { currentUnitConfigurationVersionId: configuration.id },
          })
          await db.productUnitOffering.create({
            data: {
              tenantId: target.tenant.id,
              offeringId: offering.id,
              inventoryUnitId: sellingId,
              sku: `QA-${label}-${runId}`,
            },
          })
        }
        await db.catalogSourceLineLink.create({
          data: {
            tenantId: target.tenant.id,
            storeId: target.store.id,
            offeringId: offering.id,
            sourceType: "COMMERCE_INQUIRY",
            sourceId: `QA-request-${label}-${runId}`,
            sourceLineId: `QA-line-${label}-${runId}`,
            sourceVersionFingerprint: "QA-only-source",
            verifiedLabel: item.name,
            clientOperationId: `link-${label}-${runId}`,
            payloadHash: "a".repeat(64),
            linkedByUserId: owner.id,
            createdAsPrivateDraft: true,
          },
        })
        const command = {
          tenantId: target.tenant.id,
          storeId: target.store.id,
          actorUserId: owner.id,
          offeringId: offering.id,
          clientOperationId: `graduation-${label}-${runId}`,
          expectedOfferingRevision: 0,
          confirmed: true as const,
          draftKind: "product" as const,
          currencyCode: "NGN",
          fixedPriceMinor: 5000,
          canonicalUnitName: "unit",
          category: "Goods",
          openingStockQuantity: "0.5",
          sku: `QA-${label}-${runId}`,
          transactionScale: 3,
          variantName: "Default",
          reason: "Run-owned verified canonical count",
        }
        return {
          target,
          item,
          product,
          variant,
          offering,
          canonicalId,
          sellingId,
          configurationId,
          command,
        }
      }
      const graduated = await draft(known, "packaged")
      const canonicalId = graduated.canonicalId
      const sellingId = graduated.sellingId
      if (!canonicalId || !sellingId)
        throw new Error("Configured graduation units are missing")
      const [gradeA, gradeB] = await Promise.all([
        graduateServiceCommerceCatalogOffering(db, graduated.command),
        graduateServiceCommerceCatalogOffering(db, graduated.command),
      ])
      expect(gradeA).toMatchObject({ isGraduated: true, revision: 1 })
      expect(gradeB.offeringId).toBe(gradeA.offeringId)
      const root = await db.stockBalanceSource.findFirstOrThrow({
        where: { productId: graduated.product.id },
      })
      expect(root.inventoryUnitId).toBe(canonicalId)
      expect(root.onHandQuantity.toFixed()).toBe("0.5")
      const selling = await db.productUnitOffering.findUniqueOrThrow({
        where: { offeringId: graduated.offering.id },
      })
      expect(selling.inventoryUnitId).toBe(sellingId)
      const gradeEvent =
        await db.financeInventoryValuationEvent.findFirstOrThrow({
          where: { balanceSourceId: root.id },
          include: { stockMovement: true, stockOperation: true },
        })
      expect(gradeEvent).toMatchObject({
        sourceKind: "GRADUATION_OPENING",
        valueAfterMinor: null,
        unknownReason: "MISSING_OPENING_COST",
      })
      expect(gradeEvent.stockMovement?.enteredInventoryUnitId).toBe(canonicalId)
      expect(gradeEvent.stockMovement?.unitFactorSnapshot.toFixed()).toBe("1")
      expect(gradeEvent.effectiveAt).toEqual(
        gradeEvent.stockOperation?.effectiveAt,
      )
      await expect(
        graduateServiceCommerceCatalogOffering(db, {
          ...graduated.command,
          actorUserId: manager.id,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })

      const zeroDraft = await draft(known, "zero", false)
      await graduateServiceCommerceCatalogOffering(db, {
        ...zeroDraft.command,
        openingStockQuantity: "0",
      })
      const zeroRoot = await db.stockBalanceSource.findFirstOrThrow({
        where: { productId: zeroDraft.product.id },
        include: { inventoryUnit: true },
      })
      const zeroEvent =
        await db.financeInventoryValuationEvent.findFirstOrThrow({
          where: { balanceSourceId: zeroRoot.id },
        })
      expect(zeroEvent).toMatchObject({
        sequence: 1n,
        valueAfterMinor: 0n,
        sourceCostMinor: 0n,
        unknownReason: null,
      })
      const supplier = await createFinanceSupplier(db, {
        tenantId: known.tenant.id,
        actorUserId: owner.id,
        bookId: book.id,
        clientCommandId: `supplier-${runId}`,
        code: `OC-${runId.slice(0, 8)}`,
        name: "Opening QA supplier",
      })
      await recordFinancePurchase(db, {
        tenantId: known.tenant.id,
        actorUserId: owner.id,
        bookId: book.id,
        clientCommandId: `purchase-${runId}`,
        supplierId: supplier.id,
        storeId: known.store.id,
        incurredAt: new Date(),
        description: "QA first real receipt after known-zero opening",
        lines: [
          {
            balanceSourceId: zeroRoot.id,
            enteredInventoryUnitId: zeroRoot.inventoryUnitId,
            expectedConfigurationVersionId:
              zeroRoot.inventoryUnit.configurationVersionId,
            expectedBalanceRevision: 0,
            enteredQuantity: "4",
            amountMinor: "1001",
            description: "QA original purchase cost",
            categories: [{ name: `Opening QA ${runId.slice(0, 8)}` }],
          },
        ],
      })
      const zeroPool = await db.financeInventoryPool.findUniqueOrThrow({
        where: {
          bookId_balanceSourceId: {
            bookId: book.id,
            balanceSourceId: zeroRoot.id,
          },
        },
      })
      expect(zeroPool.valueMinor).toBe(1001n)
      expect(zeroPool.quantity.toFixed()).toBe("4")
      expect(zeroPool.unknownReason).toBeNull()
      expect(zeroPool.lastSequence).toBe(2n)

      const physicalDraft = await draft(noBook, "physical", false)
      const [physicalGradeA, physicalGradeB] = await Promise.all([
        graduateServiceCommerceCatalogOffering(db, physicalDraft.command),
        graduateServiceCommerceCatalogOffering(db, physicalDraft.command),
      ])
      expect(physicalGradeA.offeringId).toBe(physicalGradeB.offeringId)
      expect(
        await db.financeInventoryValuationEvent.count({
          where: { tenantId: noBook.tenant.id },
        }),
      ).toBe(0)
      const physicalGradeOperation = await db.stockOperation.findFirstOrThrow({
        where: {
          tenantId: noBook.tenant.id,
          source: "service_commerce_catalog_graduation",
        },
      })
      await expect(
        correctStockOperation(db, {
          tenantId: noBook.tenant.id,
          actorUserId: manager.id,
          clientOperationId: `grade-correction-${runId}`,
          schemaVersion: 1,
          source: "inventory",
          reason: "QA graduation owner bypass rejection",
          targetOperationId: physicalGradeOperation.id,
          corrections: [],
        }),
      ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
      console.info(
        `opening-cost ${runId}: fresh, canonical, zero and no-Book paths passed`,
      )

      async function snapshot() {
        const where = { tenantId: known.tenant.id }
        return Promise.all([
          db.catalogItem.count({ where }),
          db.catalogProduct.count({ where: { catalogItem: where } }),
          db.unitConfigurationVersion.count({
            where: { product: { catalogItem: where } },
          }),
          db.inventoryUnit.count({
            where: {
              configurationVersion: { product: { catalogItem: where } },
            },
          }),
          db.sellableOffering.count({ where }),
          db.catalogCommandReceipt.count({ where }),
          db.stockBalanceSource.count({ where }),
          db.stockOperation.count({ where }),
          db.stockMovement.count({ where: { operation: where } }),
          db.financeInventoryPool.count({ where }),
          db.financeInventoryValuationEvent.count({ where }),
          db.serviceCommerceStoreAuditEvent.count({ where }),
          db.serviceCommercePolicyAuditEvent.count({ where }),
          db.financeJournalEntry.count({ where: { bookId: book.id } }),
          db.financeBook.findUniqueOrThrow({ where: { id: book.id } }),
        ])
      }
      let reachedCostWrite = false
      const failedCostDb = new Proxy(db, {
        get(target, key, receiver) {
          if (key !== "$transaction") return Reflect.get(target, key, receiver)
          return (
            work: (tx: Prisma.TransactionClient) => Promise<unknown>,
            options: { maxWait?: number; timeout?: number },
          ) =>
            target.$transaction(async (tx) => {
              const failedEvents = new Proxy(
                tx.financeInventoryValuationEvent,
                {
                  get(delegate, method, delegateReceiver) {
                    if (method !== "createManyAndReturn")
                      return Reflect.get(delegate, method, delegateReceiver)
                    return (
                      args: Prisma.FinanceInventoryValuationEventCreateManyAndReturnArgs,
                    ) => {
                      reachedCostWrite = true
                      const data = Array.isArray(args.data)
                        ? args.data
                        : [args.data]
                      return delegate.createManyAndReturn({
                        ...args,
                        data: data.map((event) => ({
                          ...event,
                          stockMovementId: `missing-movement-${runId}`,
                        })),
                      })
                    }
                  },
                },
              )
              return work(
                new Proxy(tx, {
                  get(client, method, clientReceiver) {
                    return method === "financeInventoryValuationEvent"
                      ? failedEvents
                      : Reflect.get(client, method, clientReceiver)
                  },
                }),
              )
            }, options)
        },
      })
      const beforeLate = await snapshot()
      await expect(
        createCatalogItem(failedCostDb, catalogCommand(known, "late-failure")),
      ).rejects.toMatchObject({ code: "P2003" })
      expect(reachedCostWrite).toBe(true)
      expect(await snapshot()).toEqual(beforeLate)
      const rejectDraft = await draft(known, "late-failure")
      const beforeGrade = await snapshot()
      reachedCostWrite = false
      await expect(
        graduateServiceCommerceCatalogOffering(
          failedCostDb,
          rejectDraft.command,
        ),
      ).rejects.toMatchObject({ code: "P2003" })
      expect(reachedCostWrite).toBe(true)
      expect(await snapshot()).toEqual(beforeGrade)
      await db.unitConfigurationVersion.update({
        where: { id: rejectDraft.configurationId },
        data: { status: "SUPERSEDED" },
      })
      const beforeVersion = await snapshot()
      await expect(
        graduateServiceCommerceCatalogOffering(db, rejectDraft.command),
      ).rejects.toMatchObject({ code: "NOT_READY" })
      expect(await snapshot()).toEqual(beforeVersion)
      await db.unitConfigurationVersion.update({
        where: { id: rejectDraft.configurationId },
        data: { status: "CURRENT" },
      })
      const beforeScope = await snapshot()
      await expect(
        createCatalogItem(db, {
          ...catalogCommand(known, "foreign-store"),
          storeId: noBook.store.id,
        }),
      ).rejects.toMatchObject({ code: "STORE_NOT_FOUND" })
      expect(await snapshot()).toEqual(beforeScope)
      await db.financeBook.update({
        where: { id: book.id },
        data: { closedThrough: new Date("2030-01-01T00:00:00Z") },
      })
      const beforeClosed = await snapshot()
      await expect(
        createCatalogItem(db, catalogCommand(known, "closed")),
      ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
      expect(await snapshot()).toEqual(beforeClosed)
      await expect(
        graduateServiceCommerceCatalogOffering(db, rejectDraft.command),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(await snapshot()).toEqual(beforeClosed)
      const replayed = await createCatalogItem(db, multipleInput)
      expect(replayed.id).toBe(multiple.id)
      expect(await snapshot()).toEqual(beforeClosed)
      await graduateServiceCommerceCatalogOffering(db, {
        ...zeroDraft.command,
        openingStockQuantity: "0",
      })
      expect(
        await db.financeInventoryValuationEvent.count({
          where: { balanceSourceId: zeroRoot.id },
        }),
      ).toBe(2)
      const laterBook = await createFinanceBook(db, {
        tenantId: noBook.tenant.id,
        actorUserId: owner.id,
        startsAt: new Date("2026-01-01T00:00:00Z"),
      })
      bookIds.push(laterBook.id)
      expect((await createCatalogItem(db, physicalInput)).id).toBe(physical.id)
      await graduateServiceCommerceCatalogOffering(db, physicalDraft.command)
      expect(
        await db.financeInventoryPool.count({
          where: { bookId: laterBook.id },
        }),
      ).toBe(0)
      expect(
        await db.financeInventoryValuationEvent.count({
          where: { bookId: laterBook.id },
        }),
      ).toBe(0)
      expect(
        await db.financeJournalEntry.count({ where: { bookId: laterBook.id } }),
      ).toBe(0)
      console.info(
        `opening-cost ${runId}: rollback, closed-period and legacy replay paths passed`,
      )
    } finally {
      const remaining = await cleanupOpeningCostAcceptance(db, {
        runId,
        tenantIds,
        userIds,
        bookIds,
      })
      for (const count of remaining) expect(count).toBe(0)
      console.info(
        `opening-cost ${runId}: all ${remaining.length} run-owned cleanup checks clear`,
      )
    }
  })
})
