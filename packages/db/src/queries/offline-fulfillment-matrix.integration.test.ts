import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { offlineReplaySchema } from "../../../../apps/api/src/schemas/offline"
import { buildOfflineOrderCommand } from "../../../../apps/mobile/src/lib/offline-order"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  assertQaAccessAcceptanceDatabase,
  describeWithQaAccessDatabase,
} from "./acceptance/qa-access/database"
import { createSimpleCatalogItem } from "./catalog"
import { CatalogError } from "./catalog-errors"
import { createCommercialOrder } from "./commercial-orders"
import {
  offlineCommandEnvelopeHash,
  replayOfflineCommands,
} from "./offline-commands"
import { registerOwnedOfflineDevice } from "./offline-device-registration"
import { getOfflineOperationsPolicy } from "./offline-settings"

// Backend saved-result proof only: no device, UI default/choice, real offline
// storage/network, HTTP/session middleware or later Service-operation acceptance.
const requestedRunId = process.env.QA_FULFILLMENT_MATRIX_RUN_ID
if (
  requestedRunId !== undefined &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestedRunId,
  )
)
  throw Error("QA_FULFILLMENT_MATRIX_RUN_ID must be a UUID")
const transactionOptions = { maxWait: 10000, timeout: 30000 }
const slugFor = (runId: string) => `fulfillment-matrix-${runId}`
const emailFor = (role: string, runId: string) =>
  `fulfillment-matrix-${role}-${runId}@example.invalid`
type PlannedUser = { id: string; email: string }
async function settledValues<T extends readonly unknown[]>(
  tasks: { [K in keyof T]: Promise<T[K]> },
): Promise<T> {
  const results = await Promise.allSettled(tasks)
  const errors = results.filter((result) => result.status === "rejected")
  if (errors.length === 1) throw errors[0]?.reason
  if (errors.length > 1)
    throw new AggregateError(
      errors.map((result) => result.reason),
      "Owned fulfillment QA reads failed",
    )
  return results.map((result) => {
    if (result.status !== "fulfilled")
      throw Error("Unsettled fulfillment QA read")
    return result.value
  }) as unknown as T
}
const cases = [
  {
    key: "immediate-product",
    product: true,
    tracked: false,
    fulfillNow: true,
    future: false,
    status: "COMPLETED",
  },
  {
    key: "explicit-off",
    product: true,
    tracked: false,
    fulfillNow: false,
    future: false,
    status: "CONFIRMED",
  },
  {
    key: "mixed-tracked",
    product: true,
    tracked: true,
    fulfillNow: true,
    future: false,
    status: "FULFILLING",
  },
  {
    key: "service-only",
    product: false,
    tracked: true,
    fulfillNow: false,
    future: false,
    status: "CONFIRMED",
  },
  {
    key: "service-only-forced-on-refused",
    product: false,
    tracked: true,
    fulfillNow: true,
    future: false,
    status: null,
    refusalMessage:
      "Immediate fulfillment requires a Product or catalog-free line.",
  },
  {
    key: "future-off",
    product: true,
    tracked: false,
    fulfillNow: false,
    future: true,
    status: "CONFIRMED",
  },
  {
    key: "future-on-refused",
    product: true,
    tracked: false,
    fulfillNow: true,
    future: true,
    status: null,
    refusalMessage:
      "A future delivery cannot be fulfilled before its scheduled time.",
  },
] as const

describeWithQaAccessDatabase(
  "saved/replayed fulfillment intent and tracked Service matrix",
  () => {
    test("immediate Product, explicit off, mixed/Service work and future delivery retain canonical stock and job facts exactly once", async () => {
      assertQaAccessAcceptanceDatabase()
      const runId = requestedRunId ?? randomUUID()
      const started = Date.now()
      const progress = (stage: string) => {
        console.info(
          `[fulfillment-matrix QA ${runId}] ${stage} ${Date.now() - started}ms`,
        )
        if (Date.now() - started > 720000)
          throw Error("Fulfillment matrix scenario deadline")
      }
      const { prisma: db } = await import("../client")
      const plannedUsers: PlannedUser[] = []
      let tenantId: string | undefined
      const failures: unknown[] = []
      try {
        progress("setup:start")
        const users = []
        for (const role of ["owner", "rep"]) {
          const identity = { id: randomUUID(), email: emailFor(role, runId) }
          plannedUsers.push(identity)
          users.push(
            await db.user.create({
              data: {
                ...identity,
                name: `Fulfillment matrix QA ${role}`,
                ageBand: "ADULT",
                ageDeclaredAt: new Date(),
              },
            }),
          )
        }
        const [owner, rep] = users
        if (!owner || !rep) throw Error("Missing owned QA identities")
        tenantId = randomUUID()
        const tenant = await db.tenant.create({
          data: {
            id: tenantId,
            name: "Fulfillment matrix QA",
            slug: slugFor(runId),
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            metadata: {
              retailOps: {
                subscription: { planId: "growth", status: "active" },
              },
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
            name: "Fulfillment original Store",
            slug: "original",
            status: "ACTIVE",
          },
        })
        const actor = { actorUserId: owner.id, tenantId: tenant.id }
        progress("setup:canonical-Product-and-TRACKED-Service")
        const product = await createSimpleCatalogItem(db, {
          ...actor,
          storeId: store.id,
          kind: "product",
          name: "QA handover Product",
          canonicalUnitName: "piece",
          openingStockQuantity: "20",
          priceMinor: 500,
          clientOperationId: `${runId}:Product`,
        })
        const service = await createSimpleCatalogItem(db, {
          ...actor,
          storeId: store.id,
          kind: "service",
          name: "QA tracked repair",
          priceMinor: 300,
          workPolicy: "tracked",
          authorizationPolicy: "on_order_confirmation",
          clientOperationId: `${runId}:Service`,
        })
        const productOfferingId = product.variants[0]?.offerings[0]?.id
        const balanceId = product.product?.stockBalances[0]?.id
        const serviceOfferingId = service.variants[0]?.offerings[0]?.id
        if (!productOfferingId || !balanceId || !serviceOfferingId)
          throw Error("Missing canonical catalog identity")
        const scope = {
          actorUserId: rep.id,
          tenantId: tenant.id,
          storeId: store.id,
          deviceId: `fulfillment-matrix-device-${runId}`,
        }
        const device = await registerOwnedOfflineDevice(db, {
          ...scope,
          platform: "ANDROID",
        })
        expect(
          await getOfflineOperationsPolicy(db, { tenantId: tenant.id }),
        ).toMatchObject({ enabled: true, approvalRequired: false })
        const serviceProof = await db.serviceOffering.findUniqueOrThrow({
          where: { offeringId: serviceOfferingId },
        })
        expect(serviceProof).toMatchObject({
          workPolicy: "TRACKED",
          authorizationPolicy: "ON_ORDER_CONFIRMATION",
        })
        const where = { tenantId: tenant.id }
        const snapshot = async () => {
          const [
            orders,
            balances,
            operations,
            reservations,
            jobs,
            bookCount,
            paymentCount,
            journalCount,
            ledgerCount,
            sequence,
          ] = await settledValues([
            db.commercialOrder.findMany({
              relationLoadStrategy: "join",
              where,
              orderBy: { id: "asc" },
              include: {
                payments: { orderBy: { id: "asc" } },
                lines: {
                  orderBy: { id: "asc" },
                  include: {
                    snapshot: true,
                    stockReservation: true,
                    productFulfillments: {
                      orderBy: { id: "asc" },
                      include: {
                        stockOperation: {
                          include: { movements: { orderBy: { id: "asc" } } },
                        },
                      },
                    },
                    serviceFulfillment: true,
                  },
                },
              },
            }),
            db.stockBalanceSource.findMany({ where, orderBy: { id: "asc" } }),
            db.stockOperation.findMany({
              relationLoadStrategy: "join",
              where,
              orderBy: { id: "asc" },
              include: { movements: { orderBy: { id: "asc" } } },
            }),
            db.stockReservation.findMany({ where, orderBy: { id: "asc" } }),
            db.serviceJob.findMany({
              relationLoadStrategy: "join",
              where,
              orderBy: { id: "asc" },
              include: {
                lines: { orderBy: { id: "asc" } },
                events: { orderBy: { id: "asc" } },
              },
            }),
            db.financeBook.count({ where }),
            db.commercialOrderPayment.count({ where }),
            db.financeJournalEntry.count({ where: { book: where } }),
            db.customerLedgerEntry.count({ where }),
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
            jobs,
            bookCount,
            paymentCount,
            journalCount,
            ledgerCount,
            orderSequence: sequence.lastCommercialOrderSequence,
          }
        }
        type State = Awaited<ReturnType<typeof snapshot>>
        const balance = (state: State) => {
          const found = state.balances.find((row) => row.id === balanceId)
          if (!found) throw Error("Missing owned Product balance")
          return found
        }
        const freshProductLine = async () => {
          const [stock, offering] = await settledValues([
            db.stockBalanceSource.findFirstOrThrow({
              where: { ...where, id: balanceId, storeId: store.id },
            }),
            db.sellableOffering.findFirstOrThrow({
              relationLoadStrategy: "join",
              where: { ...where, id: productOfferingId, status: "ACTIVE" },
              include: {
                productUnitOffering: {
                  include: {
                    inventoryUnit: {
                      include: {
                        configurationVersion: { include: { product: true } },
                      },
                    },
                  },
                },
              },
            }),
          ])
          const configuration =
            offering.productUnitOffering?.inventoryUnit.configurationVersion
          if (
            !configuration ||
            configuration.status !== "CURRENT" ||
            configuration.product.currentUnitConfigurationVersionId !==
              configuration.id ||
            offering.fixedPriceMinor === null
          )
            throw Error("No current canonical Product proof")
          return {
            offeringId: offering.id,
            quantity: "1",
            expectedConfigurationVersionId: configuration.id,
            expectedFixedPriceMinor: offering.fixedPriceMinor,
            expectedBalanceRevision: stock.revision,
          }
        }
        const serviceLine = {
          offeringId: serviceOfferingId,
          quantity: "1",
          expectedFixedPriceMinor: 300,
        }
        const future = new Date(Date.now() + 24 * 60 * 60 * 1000)
        const initial = await snapshot()
        expect([
          initial.bookCount,
          initial.paymentCount,
          initial.journalCount,
          initial.ledgerCount,
        ]).toEqual([0, 0, 0, 0])
        expect(balance(initial).onHandQuantity.toFixed()).toBe("20")
        expect(balance(initial).reservedQuantity.toFixed()).toBe("0")
        expect(initial.operations).toHaveLength(1)
        expect(initial.operations[0]?.type).toBe("OPENING_STOCK")
        const assertSaved = (
          after: State,
          before: State,
          scenario: (typeof cases)[number],
          clientId: string,
        ) => {
          const order = after.orders.find(
            (row) => row.clientOrderId === clientId,
          )
          if (!order) throw Error("Missing canonical saved Order")
          const fulfilled = scenario.product && scenario.fulfillNow
          expect(order).toMatchObject({
            createdByUserId: rep.id,
            tenantId: tenant.id,
            storeId: store.id,
            status: scenario.status,
            amountPaidMinor: 0,
            paymentStatus: "PENDING",
          })
          expect(order.payments).toEqual([])
          expect(order.completedAt === null).toBe(
            scenario.status !== "COMPLETED",
          )
          if (scenario.future) expect(order.deliveryDueAt).toEqual(future)
          expect(order.lines).toHaveLength(
            Number(scenario.product) + Number(scenario.tracked),
          )
          expect(after.orders).toHaveLength(before.orders.length + 1)
          expect(after.orders.filter((row) => row.id !== order.id)).toEqual(
            before.orders,
          )
          expect([
            after.bookCount,
            after.paymentCount,
            after.journalCount,
            after.ledgerCount,
          ]).toEqual([0, 0, 0, 0])
          expect(after.reservations).toHaveLength(
            before.reservations.length + Number(scenario.product),
          )
          expect(after.operations).toHaveLength(
            before.operations.length + Number(fulfilled),
          )
          expect(balance(after).onHandQuantity.toFixed()).toBe(
            String(
              BigInt(balance(before).onHandQuantity.toFixed()) -
                BigInt(Number(fulfilled)),
            ),
          )
          expect(balance(after).reservedQuantity.toFixed()).toBe(
            String(
              BigInt(balance(before).reservedQuantity.toFixed()) +
                BigInt(Number(scenario.product && !fulfilled)),
            ),
          )
          if (scenario.product) {
            const line = order.lines.find((row) => row.kind === "PRODUCT_UNIT")
            if (!line) throw Error("Missing Product line")
            expect(line.stockReservation).toMatchObject({
              tenantId: tenant.id,
              storeId: store.id,
              commercialOrderLineId: line.id,
              status: fulfilled ? "COMMITTED" : "ACTIVE",
            })
            expect(
              after.reservations.filter(
                (row) => row.id !== line.stockReservation?.id,
              ),
            ).toEqual(before.reservations)
            expect(line.productFulfillments).toHaveLength(Number(fulfilled))
            if (fulfilled) {
              const fulfillment = line.productFulfillments[0]
              if (!fulfillment) throw Error("Missing Product fulfillment")
              expect(fulfillment.quantity.toFixed()).toBe("1")
              expect(fulfillment.stockOperation).toMatchObject({
                type: "SALE_FULFILLMENT",
                source: "commercial_order",
                actorUserId: rep.id,
                tenantId: tenant.id,
                storeId: store.id,
              })
              expect(fulfillment.stockOperation.movements).toHaveLength(1)
              expect(
                fulfillment.stockOperation.movements[0]?.signedCanonicalEffect.toFixed(),
              ).toBe("-1")
            }
          } else {
            expect(after.reservations).toEqual(before.reservations)
            expect(after.operations).toEqual(before.operations)
            expect(after.balances).toEqual(before.balances)
          }
          expect(
            order.lines.every((line) => line.serviceFulfillment === null),
          ).toBe(true)
          expect(after.jobs).toHaveLength(
            before.jobs.length + Number(scenario.tracked),
          )
          expect(
            after.jobs.filter((job) => job.commercialOrderId !== order.id),
          ).toEqual(before.jobs)
          if (scenario.tracked) {
            const line = order.lines.find((row) => row.kind === "SERVICE")
            const job = after.jobs.find(
              (row) => row.commercialOrderId === order.id,
            )
            if (!line || !job)
              throw Error("Missing canonical TRACKED Service work")
            expect(line.snapshot).toMatchObject({
              serviceWorkPolicy: "TRACKED",
              serviceAuthorizationPolicy: "ON_ORDER_CONFIRMATION",
            })
            expect(line.stockReservation).toBeNull()
            expect(line.productFulfillments).toEqual([])
            expect(job).toMatchObject({
              tenantId: tenant.id,
              storeId: store.id,
              createdByUserId: rep.id,
              completedAt: null,
              cancelledAt: null,
              handedOffAt: null,
            })
            expect(job.lines).toHaveLength(1)
            expect(job.lines[0]).toMatchObject({
              commercialOrderLineId: line.id,
              status: "QUEUED",
              authorizationPolicy: "ON_ORDER_CONFIRMATION",
              authorizationStatus: "AUTHORIZED",
              authorizationSource: "order_confirmation",
              completedAt: null,
              cancelledAt: null,
            })
            expect(job.lines[0]?.allocatedQuantity.toFixed()).toBe("1")
            expect(job.lines[0]?.authorizedAt).toBeInstanceOf(Date)
            expect(job.events).toHaveLength(1)
            expect(job.events[0]).toMatchObject({
              type: "CREATED",
              source: "commercial_order",
              actorUserId: rep.id,
              serviceJobLineId: job.lines[0]?.id,
            })
          }
          return order
        }
        for (const route of ["online", "replay"] as const) {
          for (const scenario of cases) {
            progress(`${route}:${scenario.key}`)
            // Capture fresh modern stock/config/price fences for each new request;
            // exact retries below retain the original immutable request instead.
            const lines = [
              ...(scenario.product ? [await freshProductLine()] : []),
              ...(scenario.tracked ? [serviceLine] : []),
            ]
            const clientId = `${runId}:${route}:${scenario.key}`
            const deliveryDueAt = scenario.future ? future : undefined
            const before = await snapshot()
            if (route === "online") {
              const input = {
                actorUserId: rep.id,
                tenantId: tenant.id,
                storeId: store.id,
                clientOrderId: clientId,
                schemaVersion: 1,
                lines,
                fulfillNow: scenario.fulfillNow,
                deliveryDueAt,
              }
              if (scenario.status === null) {
                for (let attempt = 0; attempt < 2; attempt++) {
                  let refusal: unknown
                  try {
                    await createCommercialOrder(db, input)
                  } catch (error) {
                    refusal = error
                  }
                  expect(refusal).toBeInstanceOf(CatalogError)
                  expect(refusal).toMatchObject({
                    code: "INVALID_ORDER",
                    message: scenario.refusalMessage,
                  })
                  expect(await snapshot()).toEqual(before)
                }
              } else {
                const result = await createCommercialOrder(db, input)
                const after = await snapshot()
                const order = assertSaved(after, before, scenario, clientId)
                expect(result.id).toBe(order.id)
                expect((await createCommercialOrder(db, input)).id).toBe(
                  order.id,
                )
                expect(await snapshot()).toEqual(after)
              }
            } else {
              const built = {
                ...buildOfflineOrderCommand({
                  clientCommandId: clientId,
                  lines,
                  fulfillNow: scenario.fulfillNow,
                  deliveryDueAt,
                }),
                createdAtClient: new Date(),
              }
              const transport = offlineReplaySchema.parse(
                JSON.parse(
                  JSON.stringify({
                    deviceId: scope.deviceId,
                    storeId: store.id,
                    commands: [built],
                  }),
                ),
              )
              const envelope = transport.commands[0]
              if (!envelope) throw Error("Missing strict mobile envelope")
              expect(envelope.payload.fulfillNow).toBe(scenario.fulfillNow)
              if (scenario.future)
                expect(envelope.payload.deliveryDueAt).toEqual(future)
              const original = structuredClone(envelope)
              const hash = offlineCommandEnvelopeHash(original)
              const upload = () =>
                replayOfflineCommands(db, {
                  ...scope,
                  commands: [envelope],
                  acceptNewCommands: true,
                  requiresApproval: false,
                  capabilities: { operateOrders: true },
                })
              const receipts = await upload()
              expect(receipts).toHaveLength(1)
              const after = await snapshot()
              if (scenario.status === null) {
                expect(receipts[0]).toMatchObject({
                  clientCommandId: clientId,
                  status: "REVIEW_REQUIRED",
                  conflictCode: "INVALID_COMMAND",
                  conflictMessage: scenario.refusalMessage,
                  result: null,
                })
                expect(after).toEqual(before)
              } else {
                const order = assertSaved(after, before, scenario, clientId)
                expect(receipts[0]).toMatchObject({
                  clientCommandId: clientId,
                  status: "APPLIED",
                  result: { id: order.id },
                })
              }
              const durable = await db.offlineCommand.findFirstOrThrow({
                where: { ...where, clientCommandId: clientId },
              })
              expect(durable).toMatchObject({
                tenantId: tenant.id,
                storeId: store.id,
                offlineDeviceId: device.id,
                clientCommandId: clientId,
                payloadHash: hash,
                createdAtClient: original.createdAtClient,
                eventVersion: original.eventVersion,
                dependencyClientIds: original.dependencyClientIds,
                status:
                  scenario.status === null ? "REVIEW_REQUIRED" : "APPLIED",
                payload: JSON.parse(
                  JSON.stringify({ ...original.payload, actorUserId: rep.id }),
                ),
              })
              expect(await upload()).toEqual(receipts)
              expect(
                await db.offlineCommand.findUniqueOrThrow({
                  where: { id: durable.id },
                }),
              ).toEqual(durable)
              expect(await snapshot()).toEqual(after)
              expect(envelope).toEqual(original)
              expect(offlineCommandEnvelopeHash(envelope)).toBe(hash)
            }
          }
        }
        const final = await snapshot()
        expect(final.orders).toHaveLength(10)
        expect(final.jobs).toHaveLength(4)
        expect(
          final.reservations.filter((row) => row.status === "COMMITTED"),
        ).toHaveLength(4)
        expect(
          final.reservations.filter((row) => row.status === "ACTIVE"),
        ).toHaveLength(4)
        expect(
          final.operations.filter((row) => row.type === "SALE_FULFILLMENT"),
        ).toHaveLength(4)
        expect(balance(final).onHandQuantity.toFixed()).toBe("16")
        expect(balance(final).reservedQuantity.toFixed()).toBe("4")
        expect(await db.offlineCommand.count({ where })).toBe(7)
        expect(await db.serviceWorkEvent.count({ where })).toBe(4)
        progress("scenario:complete")
      } catch (error) {
        failures.push(error)
        console.error(
          `[fulfillment-matrix QA ${runId}] scenario failure before cleanup`,
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
          `Fulfillment matrix QA ${runId}: scenario/disposal failures (original first)`,
        )
    }, 900000)
  },
)

async function dispose(
  db: PrismaClient,
  runId: string,
  tenantId: string | undefined,
  plannedUsers: PlannedUser[],
) {
  if (plannedUsers.length === 0 && tenantId === undefined) {
    console.info(
      `[fulfillment-matrix QA ${runId}] cleanup skipped: no fixture writes attempted`,
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
    throw Error(`Fulfillment matrix QA ${runId}: cleanup User proof failed`)
  if (
    tenant &&
    (tenant.slug !== `fulfillment-matrix-${runId}` ||
      tenant.dataClassification !== "QA")
  )
    throw Error(`Fulfillment matrix QA ${runId}: cleanup Tenant proof failed`)
  // Missing planned rows are valid partial setup, not missing disposal authority.
  // Only an actually observed exact QA Tenant enters the twelve audited groups
  // plus the tracked-Service dependency group.
  if (tenant && tenantId) {
    const ownedTenantId = tenantId
    const where = { tenantId }
    const group = async (
      label: string,
      work: (tx: Prisma.TransactionClient) => Promise<void>,
    ) => {
      assertQaAccessAcceptanceDatabase()
      console.info(`[fulfillment-matrix QA ${runId}] cleanup:${label}`)
      try {
        await db.$transaction(async (tx) => {
          // Re-prove exact QA identity and hold its row in EVERY disposal
          // transaction; a prior successful group grants no later authority.
          const owned = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Tenant" WHERE "id"=${ownedTenantId}
              AND "slug"=${`fulfillment-matrix-${runId}`} AND "dataClassification"='QA'
            FOR UPDATE
          `
          if (owned.length !== 1)
            throw Error(
              `Fulfillment matrix QA ${runId}: cleanup Tenant proof failed`,
            )
          await work(tx)
        }, transactionOptions)
      } catch (error) {
        throw new Error(
          `Fulfillment matrix QA ${runId}: cleanup group ${label} failed`,
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
    // Canonical tracked work has FK edges to Order/lines. Dispose exact owned
    // events and allocated work before Orders; dependent notes/evidence cascade.
    await group("Service-work-and-jobs", async (tx) => {
      await tx.serviceWorkEvent.deleteMany({ where })
      await tx.serviceJobLine.deleteMany({ where: { serviceJob: where } })
      await tx.serviceJob.deleteMany({ where })
    })
    await group("customer-accounts-and-orders", async (tx) => {
      await tx.customerLedgerAccount.deleteMany({ where })
      await tx.commercialOrder.deleteMany({ where })
    })
    await group("inventory-valuations", async (tx) => {
      // No Finance Book is created in this matrix; still dispose exact owned
      // costing before stock provenance if a failed assertion exposes it.
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
      throw Error(`Fulfillment matrix QA ${runId}: cleanup User proof failed`)
    if (
      (await tx.membership.count({ where: { userId: { in: userIds } } })) !== 0
    )
      throw Error(
        `Fulfillment matrix QA ${runId}: foreign membership prevents User disposal`,
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
          db.serviceJob.count({ where: { tenantId } }),
          db.serviceJobLine.count({ where: { serviceJob: { tenantId } } }),
          db.serviceWorkEvent.count({ where: { tenantId } }),
          db.commercialServiceFulfillment.count({ where: { tenantId } }),
        ]
      : []),
  ])
  if (residual.some((count) => count !== 0))
    throw Error(`Fulfillment matrix QA ${runId}: cleanup left owned rows`)
  console.info(`[fulfillment-matrix QA ${runId}] cleanup zero owned rows`)
  return true
}
