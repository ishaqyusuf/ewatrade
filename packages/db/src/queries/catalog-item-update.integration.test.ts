import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test"
import { randomUUID } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import { type CreateCatalogProductInput, createCatalogItem } from "./catalog"
import {
  type UpdateCatalogItemInput,
  type UpdateCatalogOfferingInput,
  updateCatalogItemInTransaction,
} from "./catalog-item-update"
import { catalogItemGraph } from "./catalog-read"
import { deleteQaTenant } from "./qa-maintenance"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
if (enabled) setDefaultTimeout(240_000)

const runId = randomUUID()
const PIECE = {
  factor: "1",
  key: "piece",
  name: "Piece",
  stockBehavior: "canonical_shared",
  transactionScale: 0,
} as const

type Scope = { actorUserId: string; storeId: string; tenantId: string }
type Variants = UpdateCatalogItemInput["variants"]
;(enabled ? describe : describe.skip)(
  "catalog.updateItem transaction on guarded Neon development",
  () => {
    let db: PrismaClient
    let scope: Scope
    let tenantId: string | undefined
    let userId: string | undefined

    beforeAll(async () => {
      assertQaAccessAcceptanceDatabase()
      db = (await import("../client")).prisma
      const user = await db.user.create({
        data: { email: `catalog-update-${runId}@example.test` },
      })
      userId = user.id
      const tenant = await db.tenant.create({
        data: {
          slug: `catalog-update-${runId}`,
          name: "Catalog update QA",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          qaSourceDomain: "catalog-item-update.test",
          qaMarkedAt: new Date(),
          metadata: {
            retailOps: { subscription: { planId: "growth", status: "active" } },
          },
          users: {
            create: { userId: user.id, role: "OWNER", status: "ACTIVE" },
          },
        },
      })
      tenantId = tenant.id
      const store = await db.store.create({
        data: { tenantId: tenant.id, slug: "main", name: "Main" },
      })
      scope = { actorUserId: user.id, storeId: store.id, tenantId: tenant.id }
    })

    afterAll(async () => {
      if (!db) return
      try {
        if (tenantId) {
          // Opening stock movements restrict Tenant deletion; remove them first.
          await db.stockMovement.deleteMany({
            where: { operation: { tenantId } },
          })
          await db.stockOperation.deleteMany({ where: { tenantId } })
          await db.tenant.update({
            where: { id: tenantId },
            data: { qaPurgeStartedAt: new Date() },
          })
          await deleteQaTenant(db, tenantId)
        }
        if (userId) await db.user.deleteMany({ where: { id: userId } })
      } finally {
        await db.$disconnect()
      }
    })

    const update = (input: UpdateCatalogItemInput) =>
      db.$transaction((tx) => updateCatalogItemInTransaction(tx, input), {
        maxWait: 10_000,
        timeout: 60_000,
      })

    const graph = (itemId: string) =>
      db.catalogItem.findUniqueOrThrow({
        where: { id: itemId },
        include: catalogItemGraph,
      })

    const liveVariants = (item: Awaited<ReturnType<typeof graph>>) =>
      item.variants.filter((variant) => variant.status !== "ARCHIVED")

    const liveOfferings = (item: Awaited<ReturnType<typeof graph>>) =>
      item.variants
        .flatMap((variant) => variant.offerings)
        .filter((offering) => offering.status !== "ARCHIVED")

    const createProduct = (
      name: string,
      input: Partial<
        Pick<
          CreateCatalogProductInput,
          "openingStockQuantity" | "optionGroups" | "variants"
        >
      > & { priceMinor?: number } = {},
    ) =>
      createCatalogItem(db, {
        ...scope,
        clientOperationId: `create-${randomUUID()}`,
        kind: "product",
        name,
        openingStockQuantity: input.openingStockQuantity,
        optionGroups: input.optionGroups,
        unitConfiguration: { canonicalBalanceScale: 0, units: [PIECE] },
        variants: input.variants ?? [
          {
            key: "default",
            name,
            isDefault: true,
            offerings: [
              {
                key: "piece",
                name: "Piece",
                inventoryUnitKey: "piece",
                pricingPolicy: "fixed",
                fixedPriceMinor: input.priceMinor ?? 1_000,
              },
            ],
          },
        ],
      })

    /** Small/Large sized product; the Small choice can carry stock and codes. */
    const createSizedProduct = (
      name: string,
      small: { openingStockQuantity?: string; sku?: string; barcode?: string },
    ) =>
      createProduct(name, {
        optionGroups: [
          {
            key: "size",
            name: "Size",
            values: [
              { key: "small", label: "Small" },
              { key: "large", label: "Large" },
            ],
          },
        ],
        variants: [
          {
            key: "small",
            name: "Small",
            isDefault: true,
            openingStockQuantity: small.openingStockQuantity,
            selections: [{ groupKey: "size", valueKey: "small" }],
            offerings: [
              {
                key: "small-piece",
                name: "Small",
                inventoryUnitKey: "piece",
                pricingPolicy: "fixed",
                fixedPriceMinor: 500,
                sku: small.sku,
                barcode: small.barcode,
              },
            ],
          },
          {
            key: "large",
            name: "Large",
            isDefault: false,
            selections: [{ groupKey: "size", valueKey: "large" }],
            offerings: [
              {
                key: "large-piece",
                name: "Large",
                inventoryUnitKey: "piece",
                pricingPolicy: "fixed",
                fixedPriceMinor: 900,
              },
            ],
          },
        ],
      })

    /** The whole-form payload the dashboard sheet sends for a saved Product. */
    async function productEdit(
      itemId: string,
      updatedAt: string,
      edit: Partial<UpdateCatalogItemInput> = {},
    ): Promise<UpdateCatalogItemInput> {
      const saved = await graph(itemId)
      const units = (saved.product?.currentUnitConfiguration?.units ?? []).map(
        (unit) => ({
          id: unit.id,
          name: unit.name,
          factor: unit.factor.toString(),
          stockBehavior: unit.stockBehavior.toLowerCase() as
            | "canonical_shared"
            | "alternate_transaction"
            | "packaged_stock",
          transactionScale: unit.transactionScale,
        }),
      )
      return {
        ...scope,
        clientOperationId: `update-${randomUUID()}`,
        itemId,
        expectedUpdatedAt: new Date(updatedAt),
        kind: "product",
        name: saved.name,
        optionGroups: saved.optionGroups.map((group) => ({
          id: group.id,
          name: group.name,
          values: group.values.map((value) => value.label),
        })),
        units,
        variants: liveVariants(saved).map((variant) => ({
          selections: saved.optionGroups.map(
            (group) =>
              variant.selections.find(
                (selection) => selection.groupId === group.id,
              )?.value.label ?? "",
          ),
          enabled: variant.status === "ACTIVE",
          isDefault: variant.isDefault,
          offerings: variant.offerings
            .filter((offering) => offering.status !== "ARCHIVED")
            .map(
              (offering): UpdateCatalogOfferingInput => ({
                unitIndex: Math.max(
                  0,
                  units.findIndex(
                    (unit) =>
                      unit.id === offering.productUnitOffering?.inventoryUnitId,
                  ),
                ),
                pricingPolicy: "fixed",
                fixedPriceMinor: offering.fixedPriceMinor ?? undefined,
                sku: offering.productUnitOffering?.sku ?? undefined,
                barcode: offering.productUnitOffering?.barcode ?? undefined,
              }),
            ),
        })),
        ...edit,
      }
    }

    const fixedOffering = (
      fixedPriceMinor: number,
      extra: Partial<UpdateCatalogOfferingInput> = {},
    ): UpdateCatalogOfferingInput => ({
      unitIndex: 0,
      pricingPolicy: "fixed",
      fixedPriceMinor,
      ...extra,
    })

    test("rename and price change update in place and record the previous price with the reason", async () => {
      const created = await createProduct("Rice bag", { priceMinor: 1_000 })
      const before = await graph(created.id)
      const [offering] = liveOfferings(before)
      if (!offering) throw new Error("Missing created offering")

      const result = await update(
        await productEdit(created.id, created.updatedAt, {
          name: "  Rice sack  ",
          priceChangeReason: "Supplier increase",
          variants: [
            {
              selections: [],
              enabled: true,
              isDefault: true,
              offerings: [fixedOffering(1_250)],
            },
          ],
        }),
      )
      expect(result.name).toBe("Rice sack")
      expect(new Date(result.updatedAt).getTime()).toBeGreaterThan(
        new Date(created.updatedAt).getTime(),
      )

      const after = await graph(created.id)
      expect(liveOfferings(after).map((live) => live.id)).toEqual([offering.id])
      expect(liveOfferings(after)[0]).toMatchObject({
        fixedPriceMinor: 1_250,
        name: "Rice sack",
        revision: offering.revision + 1,
      })
      expect(liveVariants(after)[0]?.name).toBe("Rice sack")
      const changes = await db.catalogPriceChange.findMany({
        where: { offeringId: offering.id },
        orderBy: { createdAt: "asc" },
      })
      expect(changes.at(-1)).toMatchObject({
        changedByUserId: scope.actorUserId,
        previousPriceMinor: 1_000,
        priceMinor: 1_250,
        reason: "Supplier increase",
      })
    })

    test("replays the same operation, refuses a changed payload and a stale revision", async () => {
      const created = await createProduct("Beans", { priceMinor: 700 })
      const input = await productEdit(created.id, created.updatedAt, {
        name: "Brown beans",
        variants: [
          {
            selections: [],
            enabled: true,
            isDefault: true,
            offerings: [fixedOffering(800)],
          },
        ],
      })
      const first = await update(input)
      const priceChanges = () =>
        db.catalogPriceChange.count({
          where: { offering: { catalogItemId: created.id } },
        })
      const changeCount = await priceChanges()

      // The stale expectedUpdatedAt is part of the original payload, so a
      // replay still succeeds and writes nothing.
      const replay = await update(input)
      expect(replay).toEqual(first)
      expect(await priceChanges()).toBe(changeCount)
      expect((await graph(created.id)).updatedAt.toISOString()).toBe(
        first.updatedAt,
      )

      await expect(
        update({ ...input, name: "Black beans" }),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })

      await expect(
        update({
          ...input,
          clientOperationId: `update-${randomUUID()}`,
          name: "Black beans",
        }),
      ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
      expect((await graph(created.id)).name).toBe("Brown beans")
    })

    test("adding a Size option archives the no-option default and creates its choices", async () => {
      const created = await createProduct("T-shirt", { priceMinor: 500 })
      const before = await graph(created.id)
      const [defaultVariant] = before.variants
      if (!defaultVariant) throw new Error("Missing default variant")

      await update(
        await productEdit(created.id, created.updatedAt, {
          optionGroups: [{ name: "Size", values: ["Small", "Large"] }],
          variants: [
            {
              selections: ["Small"],
              enabled: true,
              isDefault: true,
              offerings: [fixedOffering(500)],
            },
            {
              selections: ["Large"],
              enabled: true,
              isDefault: false,
              offerings: [fixedOffering(900)],
            },
          ],
        }),
      )

      const after = await graph(created.id)
      const archived = after.variants.find(
        (variant) => variant.id === defaultVariant.id,
      )
      expect(archived).toMatchObject({ isDefault: false, status: "ARCHIVED" })
      expect(archived?.archivedAt).not.toBeNull()
      expect(archived?.offerings.map((offering) => offering.status)).toEqual([
        "ARCHIVED",
      ])

      expect(after.optionGroups).toHaveLength(1)
      expect(after.optionGroups[0]?.values.map((value) => value.label)).toEqual(
        ["Small", "Large"],
      )
      const live = liveVariants(after)
      expect(
        live.map((variant) => ({
          isDefault: variant.isDefault,
          name: variant.name,
          selections: variant.selections.map(
            (selection) => selection.value.label,
          ),
          status: variant.status,
        })),
      ).toEqual([
        {
          isDefault: true,
          name: "Small",
          selections: ["Small"],
          status: "ACTIVE",
        },
        {
          isDefault: false,
          name: "Large",
          selections: ["Large"],
          status: "ACTIVE",
        },
      ])
      expect(
        live.map((variant) =>
          variant.offerings.map((offering) => ({
            kind: offering.kind,
            price: offering.fixedPriceMinor,
            status: offering.status,
            unit: offering.productUnitOffering?.inventoryUnit.key,
            available: offering.storeAvailability.map(
              (entry) => `${entry.storeId}:${entry.isAvailable}`,
            ),
          })),
        ),
      ).toEqual([
        [
          {
            kind: "PRODUCT_UNIT",
            price: 500,
            status: "ACTIVE",
            unit: "piece",
            available: [`${scope.storeId}:true`],
          },
        ],
        [
          {
            kind: "PRODUCT_UNIT",
            price: 900,
            status: "ACTIVE",
            unit: "piece",
            available: [`${scope.storeId}:true`],
          },
        ],
      ])
      const initial = await db.catalogPriceChange.findMany({
        where: {
          offeringId: {
            in: live.flatMap((variant) => variant.offerings.map((o) => o.id)),
          },
        },
      })
      expect(initial.map((change) => change.reason)).toEqual([
        "Initial price",
        "Initial price",
      ])
    })

    test("removing a choice that has on-hand stock is refused and rolls back", async () => {
      const created = await createSizedProduct("Sandals", {
        openingStockQuantity: "3",
      })
      const before = await graph(created.id)
      const small = before.variants.find((variant) => variant.name === "Small")
      const large = before.variants.find((variant) => variant.name === "Large")
      if (!small || !large) throw new Error("Missing sized variants")
      expect(
        before.product?.stockBalanceSources.map((balance) => ({
          onHand: balance.onHandQuantity.toString(),
          variantId: balance.variantId,
        })),
      ).toEqual([{ onHand: "3", variantId: small.id }])

      const onlyLarge: Variants = [
        {
          selections: ["Large"],
          enabled: true,
          isDefault: true,
          offerings: [fixedOffering(900)],
        },
      ]
      await expect(
        update(
          await productEdit(created.id, created.updatedAt, {
            optionGroups: [
              {
                id: before.optionGroups[0]?.id,
                name: "Size",
                values: ["Large"],
              },
            ],
            variants: onlyLarge,
          }),
        ),
      ).rejects.toMatchObject({
        code: "INVALID_CATALOG_ITEM",
        message: expect.stringContaining("Small still has stock"),
      })
      const unchanged = await graph(created.id)
      expect(unchanged.updatedAt.toISOString()).toBe(created.updatedAt)
      expect(liveVariants(unchanged).map((variant) => variant.id)).toEqual([
        small.id,
        large.id,
      ])
      expect(unchanged.optionGroups[0]?.values).toHaveLength(2)

      // The stock-free choice can still be removed.
      const result = await update(
        await productEdit(created.id, created.updatedAt, {
          optionGroups: [
            {
              id: before.optionGroups[0]?.id,
              name: "Size",
              values: ["Small"],
            },
          ],
          variants: [
            {
              selections: ["Small"],
              enabled: true,
              isDefault: true,
              offerings: [fixedOffering(500)],
            },
          ],
        }),
      )
      const after = await graph(result.id)
      expect(liveVariants(after).map((variant) => variant.id)).toEqual([
        small.id,
      ])
      expect(
        after.variants.find((variant) => variant.id === large.id)?.status,
      ).toBe("ARCHIVED")
      expect(after.optionGroups[0]?.values.map((value) => value.label)).toEqual(
        ["Small"],
      )
    })

    test("renames units in place and publishes a new configuration only without stock", async () => {
      const stocked = await createProduct("Soap", {
        openingStockQuantity: "5",
        priceMinor: 300,
      })
      const stockedBefore = await graph(stocked.id)
      const configuration = stockedBefore.product?.currentUnitConfiguration
      const mainUnit = configuration?.units[0]
      if (!configuration || !mainUnit) throw new Error("Missing Soap unit")

      const renamed = await update(
        await productEdit(stocked.id, stocked.updatedAt, {
          units: [{ ...PIECE, id: mainUnit.id, name: "Bar" }],
        }),
      )
      const stockedAfter = await graph(stocked.id)
      expect(stockedAfter.product?.currentUnitConfiguration?.id).toBe(
        configuration.id,
      )
      expect(
        stockedAfter.product?.currentUnitConfiguration?.units.map((unit) => ({
          id: unit.id,
          name: unit.name,
        })),
      ).toEqual([{ id: mainUnit.id, name: "Bar" }])
      expect(
        liveOfferings(stockedAfter).map((offering) => offering.id),
      ).toEqual(liveOfferings(stockedBefore).map((offering) => offering.id))

      const packUnit = {
        factor: "6",
        name: "Pack",
        stockBehavior: "alternate_transaction",
        transactionScale: 0,
      } as const
      await expect(
        update(
          await productEdit(stocked.id, renamed.updatedAt, {
            units: [{ ...PIECE, id: mainUnit.id, name: "Bar" }, packUnit],
            variants: [
              {
                selections: [],
                enabled: true,
                isDefault: true,
                offerings: [
                  fixedOffering(300),
                  fixedOffering(1_700, { unitIndex: 1 }),
                ],
              },
            ],
          }),
        ),
      ).rejects.toMatchObject({ code: "INVALID_UNIT_CONFIGURATION" })
      expect(
        (await graph(stocked.id)).product?.currentUnitConfiguration?.id,
      ).toBe(configuration.id)

      const empty = await createProduct("Candles", { priceMinor: 300 })
      const emptyBefore = await graph(empty.id)
      const emptyConfiguration = emptyBefore.product?.currentUnitConfiguration
      const emptyMain = emptyConfiguration?.units[0]
      const [mainOffering] = liveOfferings(emptyBefore)
      if (!emptyConfiguration || !emptyMain || !mainOffering)
        throw new Error("Missing Candles unit")

      await update(
        await productEdit(empty.id, empty.updatedAt, {
          units: [{ ...PIECE, id: emptyMain.id }, packUnit],
          variants: [
            {
              selections: [],
              enabled: true,
              isDefault: true,
              offerings: [
                fixedOffering(300),
                fixedOffering(1_700, { unitIndex: 1 }),
              ],
            },
          ],
        }),
      )
      const emptyAfter = await graph(empty.id)
      const published = emptyAfter.product?.currentUnitConfiguration
      expect(published?.id).not.toBe(emptyConfiguration.id)
      expect(published?.status).toBe("CURRENT")
      expect(published?.units.map((unit) => [unit.key, unit.name])).toEqual([
        ["piece", "Piece"],
        ["unit-1", "Pack"],
      ])
      expect(
        (
          await db.unitConfigurationVersion.findUniqueOrThrow({
            where: { id: emptyConfiguration.id },
          })
        ).status,
      ).toBe("SUPERSEDED")
      const offerings = liveOfferings(emptyAfter)
      expect(
        offerings.map((offering) => ({
          configurationId:
            offering.productUnitOffering?.inventoryUnit.configurationVersionId,
          name: offering.name,
          price: offering.fixedPriceMinor,
          unit: offering.productUnitOffering?.inventoryUnit.key,
        })),
      ).toEqual([
        {
          configurationId: published?.id,
          name: "Candles",
          price: 300,
          unit: "piece",
        },
        {
          configurationId: published?.id,
          name: "Candles · Pack",
          price: 1_700,
          unit: "unit-1",
        },
      ])
      expect(offerings.map((offering) => offering.id)).not.toContain(
        mainOffering.id,
      )
    })

    test("service fixed to quote clears the price and updates work and authorization policy", async () => {
      const created = await createCatalogItem(db, {
        ...scope,
        clientOperationId: `create-${randomUUID()}`,
        kind: "service",
        name: "Tailoring",
        variants: [
          {
            key: "default",
            name: "Tailoring",
            isDefault: true,
            offerings: [
              {
                key: "default",
                name: "Tailoring",
                pricingPolicy: "fixed",
                fixedPriceMinor: 5_000,
                workPolicy: "charge_only",
                authorizationPolicy: "on_order_confirmation",
              },
            ],
          },
        ],
      })
      const before = await graph(created.id)
      const [offering] = liveOfferings(before)
      if (!offering) throw new Error("Missing service offering")
      const priceChanges = () =>
        db.catalogPriceChange.count({ where: { offeringId: offering.id } })
      const changeCount = await priceChanges()

      await update({
        ...scope,
        clientOperationId: `update-${randomUUID()}`,
        itemId: created.id,
        expectedUpdatedAt: new Date(created.updatedAt),
        kind: "service",
        name: "Tailoring",
        optionGroups: [],
        variants: [
          {
            selections: [],
            enabled: true,
            isDefault: true,
            offerings: [
              {
                pricingPolicy: "quote_required",
                workPolicy: "tracked",
                authorizationPolicy: "manual_release",
                guidance: "  Measure before quoting  ",
              },
            ],
          },
        ],
      })

      const after = await graph(created.id)
      expect(liveOfferings(after).map((live) => live.id)).toEqual([offering.id])
      expect(liveOfferings(after)[0]).toMatchObject({
        fixedPriceMinor: null,
        pricingPolicy: "QUOTE_REQUIRED",
      })
      expect(liveOfferings(after)[0]?.serviceOffering).toMatchObject({
        authorizationPolicy: "MANUAL_RELEASE",
        guidance: "Measure before quoting",
        workPolicy: "TRACKED",
      })
      expect(await priceChanges()).toBe(changeCount)
    })

    test("archived offerings release SKU and barcode for a live offering to reuse", async () => {
      const sku = `SKU-${runId}`
      const barcode = `BC-${runId}`
      const created = await createSizedProduct("Caps", { sku, barcode })
      const before = await graph(created.id)
      const small = before.variants.find((variant) => variant.name === "Small")
      const large = before.variants.find((variant) => variant.name === "Large")
      if (!small || !large) throw new Error("Missing sized variants")

      // Small is removed and its codes move to Large in the same edit.
      await update(
        await productEdit(created.id, created.updatedAt, {
          optionGroups: [
            {
              id: before.optionGroups[0]?.id,
              name: "Size",
              values: ["Large"],
            },
          ],
          variants: [
            {
              selections: ["Large"],
              enabled: true,
              isDefault: true,
              offerings: [fixedOffering(900, { sku, barcode })],
            },
          ],
        }),
      )
      const after = await graph(created.id)
      const archivedSmall = after.variants.find(
        (variant) => variant.id === small.id,
      )
      expect(archivedSmall?.status).toBe("ARCHIVED")
      expect(
        archivedSmall?.offerings.map((offering) => ({
          barcode: offering.productUnitOffering?.barcode,
          sku: offering.productUnitOffering?.sku,
          status: offering.status,
        })),
      ).toEqual([{ barcode: null, sku: null, status: "ARCHIVED" }])
      const liveLarge = liveVariants(after)
      expect(liveLarge.map((variant) => variant.id)).toEqual([large.id])
      expect(liveLarge[0]?.isDefault).toBe(true)
      expect(liveLarge[0]?.offerings[0]?.productUnitOffering).toMatchObject({
        barcode,
        sku,
      })

      // Another item still cannot take a code a live offering holds.
      const other = await createProduct("Hats")
      await expect(
        update(
          await productEdit(other.id, other.updatedAt, {
            variants: [
              {
                selections: [],
                enabled: true,
                isDefault: true,
                offerings: [fixedOffering(1_000, { sku })],
              },
            ],
          }),
        ),
      ).rejects.toMatchObject({ code: "DUPLICATE_CATALOG_KEY" })
    })
  },
)
