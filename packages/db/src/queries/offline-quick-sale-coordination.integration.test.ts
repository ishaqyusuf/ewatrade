import { expect, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  assertQaAccessAcceptanceDatabase,
  describeWithQaAccessDatabase,
} from "./acceptance/qa-access/database"
import { CatalogError } from "./catalog-errors"
import { allocateCommercialOrderNumber } from "./commercial-order-number"
import { acquireOfflineCommandFences } from "./offline-command-fence"
import {
  assertOfflineOrderIdentityNotRetired,
  readOfflineQuickSaleCorrectionRecord,
} from "./offline-quick-sale-correction-record"

// Coordination seam only: synthetic Order rows have no catalog/stock/payment
// effects. This is not endpoint or full canonical correction acceptance.
const requestedRunId = process.env.QA_OFFLINE_CORRECTION_COORDINATION_RUN_ID
if (
  requestedRunId !== undefined &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestedRunId,
  )
)
  throw Error("QA_OFFLINE_CORRECTION_COORDINATION_RUN_ID must be a UUID")

function barrier() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    release,
    async wait() {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          promise,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(Error("QA barrier deadline")),
              12000,
            )
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }

// Public lock namespace independently reproduced only to inspect the real
// server lock held by the actual helper, including driver bigint fidelity.
function key(tenantId: string, clientCommandId: string) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "ewatrade:offline-command:v1",
        tenantId,
        clientCommandId,
      ]),
    )
    .digest()
    .readBigInt64BE(0)
}
async function tryKey(tx: Prisma.TransactionClient, value: bigint) {
  const rows = await tx.$queryRaw<Array<{ held: boolean; value: bigint }>>`
    SELECT pg_try_advisory_xact_lock(${value}::bigint) AS held,
      ${value}::bigint AS value
  `
  expect(rows[0]?.value).toBe(value)
  return rows[0]?.held
}

describeWithQaAccessDatabase(
  "offline Quick sale PostgreSQL coordination seam",
  () => {
    test("absent keys, lock ordering and retirement serialize across commit, rollback and inherited snapshots", async () => {
      assertQaAccessAcceptanceDatabase()
      const runId = requestedRunId ?? randomUUID()
      const started = Date.now()
      const stage = (name: string) => {
        console.info(
          `[offline-correction-coordination QA ${runId}] ${name} ${Date.now() - started}ms`,
        )
        // Reserve three minutes of the 15-minute test for draining transactions and
        // exact awaited disposal. Never abandon database work with Promise.race.
        if (Date.now() - started > 720000) throw Error("QA scenario deadline")
      }
      const { prisma: db } = await import("../client")
      const userId = randomUUID()
      const tenantIds = [randomUUID(), randomUUID()]
      const stores = tenantIds.map(() => randomUUID())
      const devices = tenantIds.map(() => randomUUID())
      const email = `offline-correction-coordination-${runId}@example.invalid`
      const createdTenants: string[] = []
      let createdUser = false
      const jobs = new Set<Promise<unknown>>()
      const releases: Array<() => void> = []
      const options = { maxWait: 10000, timeout: 30000 }
      function track<T>(promise: Promise<T>): Promise<Settled<T>> {
        const safe = promise.then(
          (value): Settled<T> => ({ ok: true, value }),
          (error): Settled<T> => ({ ok: false, error }),
        )
        jobs.add(safe)
        void safe.finally(() => jobs.delete(safe))
        return safe
      }
      function gate() {
        const result = barrier()
        releases.push(result.release)
        return result
      }
      function success<T>(result: Settled<T>) {
        if (!result.ok) throw result.error
        return result.value
      }
      async function transaction<T>(
        fn: (tx: Prisma.TransactionClient) => Promise<T>,
      ) {
        return db.$transaction(fn, options)
      }
      const firstTenant = tenantIds[0]
      const firstStore = stores[0]
      const firstDevice = devices[0]
      if (!firstTenant || !firstStore || !firstDevice)
        throw Error("Missing QA scope")
      const orderExists = (tx: Prisma.TransactionClient, identity: string) =>
        tx.commercialOrder.findUnique({
          where: {
            tenantId_clientOrderId: {
              tenantId: firstTenant,
              clientOrderId: identity,
            },
          },
          select: { id: true },
        })
      async function seedCommand(identity: string) {
        return db.offlineCommand.create({
          data: {
            id: randomUUID(),
            tenantId: firstTenant,
            storeId: firstStore,
            offlineDeviceId: firstDevice,
            clientCommandId: identity,
            type: "COMMERCIAL_ORDER",
            payloadHash: "a".repeat(64),
            dependencyClientIds: [],
            payload: {
              kind: "commercial_order",
              actorUserId: userId,
              lines: [{ custom: "quick_sale", amountMinor: 100 }],
            },
            createdAtClient: new Date(),
          },
        })
      }
      async function correction(
        tx: Prisma.TransactionClient,
        identity: string,
      ) {
        await acquireOfflineCommandFences(tx, {
          tenantId: firstTenant,
          clientCommandIds: [identity, `${identity}:replacement`],
        })
        // A real version-changing UPDATE is essential under inherited RR. A
        // SHARE lock or unchanged-sequence SELECT cannot substitute for this.
        await tx.tenant.update({
          where: { id: firstTenant },
          data: { updatedAt: new Date() },
          select: { id: true },
        })
        if (await orderExists(tx, identity))
          throw Error("QA original already exists")
        await tx.offlineCommand.update({
          where: {
            tenantId_clientCommandId: {
              tenantId: firstTenant,
              clientCommandId: identity,
            },
          },
          data: {
            authoritativeState: {
              _offlineQuickSaleCorrection: {
                version: 1,
                kind: "blank_quick_sale_replaced",
                originalClientCommandId: identity,
                originalPayloadHash: "a".repeat(64),
                replacementClientCommandId: `${identity}:replacement`,
                replacementPayloadHash: "b".repeat(64),
                replacedByUserId: userId,
                replacedAt: new Date().toISOString(),
              },
            },
          },
        })
      }
      async function canonical(tx: Prisma.TransactionClient, identity: string) {
        const orderNumber = await allocateCommercialOrderNumber(tx, firstTenant)
        await assertOfflineOrderIdentityNotRetired(tx, {
          tenantId: firstTenant,
          clientOrderId: identity,
        })
        return tx.commercialOrder.create({
          data: {
            id: randomUUID(),
            tenantId: firstTenant,
            storeId: firstStore,
            clientOrderId: identity,
            payloadHash: "a".repeat(64),
            orderNumber,
            currencyCode: "NGN",
            subtotalMinor: 100,
            totalMinor: 100,
            createdByUserId: userId,
          },
        })
      }
      try {
        stage("setup")
        await db.user.create({
          data: {
            id: userId,
            name: "Offline correction coordination QA",
            email,
            ageBand: "ADULT",
            ageDeclaredAt: new Date(),
          },
        })
        createdUser = true
        for (const [index, tenantId] of tenantIds.entries()) {
          await db.tenant.create({
            data: {
              id: tenantId,
              name: "Offline correction coordination QA",
              slug: `offline-correction-coordination-${runId}-${index}`,
              type: "MERCHANT",
              enabledModes: ["MERCHANT"],
              dataClassification: "QA",
              users: { create: { userId, role: "OWNER", status: "ACTIVE" } },
            },
          })
          createdTenants.push(tenantId)
          await db.store.create({
            data: {
              id: stores[index],
              tenantId,
              name: "Coordination QA Store",
              slug: "original",
              status: "ACTIVE",
            },
          })
          await db.offlineDevice.create({
            data: {
              id: devices[index],
              tenantId,
              storeId: stores[index],
              deviceId: `${runId}:${index}`,
              registeredByUserId: userId,
            },
          })
        }

        stage(
          "absent-key contention, signed bigint, cross-Tenant, rollback release",
        )
        const ids: string[] = []
        // Find both signed halves outside JS's safe integer range for this exact
        // random namespace; then verify the adapter round trip without Number.
        for (let index = 0; ids.length < 2 && index < 1000; index++) {
          const id = `${runId}:absent:${index}`
          const value = key(firstTenant, id)
          if (
            value < -BigInt(Number.MAX_SAFE_INTEGER) &&
            !ids.some((prior) => key(firstTenant, prior) < 0n)
          )
            ids.push(id)
          if (
            value > BigInt(Number.MAX_SAFE_INTEGER) &&
            !ids.some((prior) => key(firstTenant, prior) > 0n)
          )
            ids.push(id)
        }
        expect(ids).toHaveLength(2)
        expect(
          await db.offlineCommand.count({
            where: { tenantId: firstTenant, clientCommandId: { in: ids } },
          }),
        ).toBe(0)
        const held = gate()
        const release = gate()
        const rollback = Error("QA intentional fence rollback")
        const holder = track(
          transaction(async (tx) => {
            await acquireOfflineCommandFences(tx, {
              tenantId: firstTenant,
              clientCommandIds: ids,
            })
            held.release()
            await release.wait()
            throw rollback
          }),
        )
        try {
          await held.wait()
          await transaction(async (tx) => {
            for (const id of ids)
              expect(await tryKey(tx, key(firstTenant, id))).toBe(false)
            const foreignTenant = tenantIds[1]
            if (!foreignTenant) throw Error("Missing foreign QA Tenant")
            await acquireOfflineCommandFences(tx, {
              tenantId: foreignTenant,
              clientCommandIds: ids,
            })
            for (const id of ids)
              expect(await tryKey(tx, key(foreignTenant, id))).toBe(true)
          })
        } finally {
          release.release()
          const result = await holder
          expect(result.ok).toBe(false)
          if (!result.ok) expect(result.error).toBe(rollback)
        }
        await transaction(async (tx) => {
          for (const id of ids)
            expect(await tryKey(tx, key(firstTenant, id))).toBe(true)
        })

        stage("reversed complete sets commit and release")
        const ready = gate()
        const leave = gate()
        const entered = gate()
        const first = track(
          transaction(async (tx) => {
            await acquireOfflineCommandFences(tx, {
              tenantId: firstTenant,
              clientCommandIds: [...ids].reverse(),
            })
            ready.release()
            await leave.wait()
          }),
        )
        let second: Promise<Settled<void>> | undefined
        try {
          await ready.wait()
          second = track(
            transaction(async (tx) => {
              entered.release()
              await acquireOfflineCommandFences(tx, {
                tenantId: firstTenant,
                clientCommandIds: ids,
              })
              for (const id of ids)
                expect(await tryKey(tx, key(firstTenant, id))).toBe(true)
            }),
          )
          await entered.wait()
          // Independent connection proves the first complete set is really held.
          await transaction(async (tx) => {
            for (const id of ids)
              expect(await tryKey(tx, key(firstTenant, id))).toBe(false)
          })
        } finally {
          leave.release()
          success(await first)
          if (second) success(await second)
        }
        await transaction(async (tx) => {
          for (const id of ids)
            expect(await tryKey(tx, key(firstTenant, id))).toBe(true)
        })

        for (const winner of ["correction", "canonical"] as const)
          for (const rollsBack of [false, true]) {
            stage(`${winner} wins; rollback=${rollsBack}`)
            const identity = `${runId}:${winner}:${rollsBack}`
            const command = await seedCommand(identity)
            const before = await db.tenant.findUniqueOrThrow({
              where: { id: firstTenant },
              select: { lastCommercialOrderSequence: true },
            })
            const ownerReady = gate()
            const ownerRelease = gate()
            const contenderStarted = gate()
            const deliberate = Error("QA intentional winner rollback")
            const owner = track(
              transaction(async (tx) => {
                if (winner === "correction") await correction(tx, identity)
                else await canonical(tx, identity)
                ownerReady.release()
                await ownerRelease.wait()
                if (rollsBack) throw deliberate
              }),
            )
            let contender: Promise<Settled<unknown>> | undefined
            try {
              await ownerReady.wait()
              // NOWAIT establishes actual Tenant contention deterministically;
              // the expected error aborts only this separate probe transaction.
              const probe = await track(
                transaction(
                  async (tx) =>
                    tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${firstTenant} FOR UPDATE NOWAIT`,
                ),
              )
              expect(probe.ok).toBe(false)
              if (!probe.ok)
                expect(JSON.stringify(probe.error)).toContain("55P03")
              contender = track(
                transaction(async (tx) => {
                  contenderStarted.release()
                  return winner === "correction"
                    ? canonical(tx, identity)
                    : correction(tx, identity)
                }),
              )
              await contenderStarted.wait()
            } finally {
              ownerRelease.release()
              const settled = await owner
              if (rollsBack) {
                expect(settled.ok).toBe(false)
                if (!settled.ok) expect(settled.error).toBe(deliberate)
              } else success(settled)
            }
            if (!contender) throw Error("Missing QA contender")
            const outcome = await contender
            expect(outcome.ok).toBe(rollsBack)
            if (!outcome.ok) {
              if (winner === "correction")
                expect(outcome.error).toBeInstanceOf(CatalogError)
              else
                expect(outcome.error).toEqual(
                  Error("QA original already exists"),
                )
            }
            const order = await db.commercialOrder.findUnique({
              where: {
                tenantId_clientOrderId: {
                  tenantId: firstTenant,
                  clientOrderId: identity,
                },
              },
            })
            const stored = await db.offlineCommand.findUniqueOrThrow({
              where: { id: command.id },
            })
            const retired = winner === "correction" ? !rollsBack : rollsBack
            expect(Boolean(order)).toBe(!retired)
            expect(
              Boolean(
                readOfflineQuickSaleCorrectionRecord(stored.authoritativeState),
              ),
            ).toBe(retired)
            expect(stored.payloadHash).toBe(command.payloadHash)
            expect(stored.payload).toEqual(command.payload)
            const after = await db.tenant.findUniqueOrThrow({
              where: { id: firstTenant },
              select: { lastCommercialOrderSequence: true },
            })
            expect(after.lastCommercialOrderSequence).toBe(
              before.lastCommercialOrderSequence + (retired ? 0 : 1),
            )
          }

        stage(
          "inherited RepeatableRead snapshot rejects stale allocation, fresh whole retry sees retirement",
        )
        const identity = `${runId}:repeatable-read`
        await seedCommand(identity)
        const beforeSnapshot = await db.tenant.findUniqueOrThrow({
          where: { id: firstTenant },
          select: { lastCommercialOrderSequence: true },
        })
        const snapshotReady = gate()
        const resume = gate()
        const stale = track(
          db.$transaction(
            async (tx) => {
              await tx.tenant.findUniqueOrThrow({
                where: { id: firstTenant },
                select: { lastCommercialOrderSequence: true },
              })
              // This prior read proves the command was visible and unretired in the
              // inherited snapshot before the concurrent correction commits.
              await assertOfflineOrderIdentityNotRetired(tx, {
                tenantId: firstTenant,
                clientOrderId: identity,
              })
              snapshotReady.release()
              await resume.wait()
              await canonical(tx, identity)
            },
            { ...options, isolationLevel: "RepeatableRead" },
          ),
        )
        try {
          await snapshotReady.wait()
          await transaction((tx) => correction(tx, identity))
        } finally {
          resume.release()
        }
        const staleResult = await stale
        expect(staleResult.ok).toBe(false)
        if (!staleResult.ok) {
          // Prisma maps PostgreSQL 40001 writes under RR to P2034. Retain the
          // SQLSTATE alternative for adapter versions exposing raw driver errors.
          const diagnostic = JSON.stringify(staleResult.error)
          expect(/P2034|40001/.test(diagnostic)).toBe(true)
          expect(staleResult.error).not.toBeInstanceOf(CatalogError)
        }
        const retry = await track(transaction((tx) => canonical(tx, identity)))
        expect(retry.ok).toBe(false)
        if (!retry.ok) expect(retry.error).toBeInstanceOf(CatalogError)
        expect(
          await db.commercialOrder.count({
            where: { tenantId: firstTenant, clientOrderId: identity },
          }),
        ).toBe(0)
        expect(
          await db.tenant.findUniqueOrThrow({
            where: { id: firstTenant },
            select: { lastCommercialOrderSequence: true },
          }),
        ).toEqual(beforeSnapshot)
        stage("scenario complete")
      } finally {
        for (const release of releases) release()
        await Promise.all([...jobs])
        try {
          await dispose(
            db,
            runId,
            createdTenants,
            createdUser ? userId : null,
            email,
          )
        } finally {
          await db.$disconnect()
        }
      }
    }, 900000)
  },
)

async function dispose(
  db: PrismaClient,
  runId: string,
  tenantIds: string[],
  userId: string | null,
  email: string,
) {
  assertQaAccessAcceptanceDatabase()
  const tenants = await db.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, slug: true, dataClassification: true },
  })
  if (
    tenants.length !== tenantIds.length ||
    tenants.some(
      (tenant) =>
        tenant.dataClassification !== "QA" ||
        ![0, 1].some(
          (index) =>
            tenant.slug === `offline-correction-coordination-${runId}-${index}`,
        ),
    )
  )
    throw Error(`QA ${runId}: Tenant disposal proof failed`)
  if (userId && (await db.user.count({ where: { id: userId, email } })) !== 1)
    throw Error(`QA ${runId}: User disposal proof failed`)
  await db.$transaction(
    async (tx) => {
      const where = { tenantId: { in: tenantIds } }
      await tx.offlineCommand.deleteMany({ where })
      await tx.commercialOrder.deleteMany({ where })
      await tx.tenant.deleteMany({
        where: { id: { in: tenantIds }, dataClassification: "QA" },
      })
    },
    { maxWait: 10000, timeout: 30000 },
  )
  if (userId) {
    if ((await db.membership.count({ where: { userId } })) !== 0)
      throw Error(`QA ${runId}: foreign membership prevents User disposal`)
    await db.user.delete({ where: { id: userId, email } })
  }
  const residue = await Promise.all([
    db.tenant.count({ where: { id: { in: tenantIds } } }),
    db.store.count({ where: { tenantId: { in: tenantIds } } }),
    db.offlineDevice.count({ where: { tenantId: { in: tenantIds } } }),
    db.offlineCommand.count({ where: { tenantId: { in: tenantIds } } }),
    db.commercialOrder.count({ where: { tenantId: { in: tenantIds } } }),
    ...(userId ? [db.user.count({ where: { id: userId } })] : []),
  ])
  if (residue.some((count) => count !== 0))
    throw Error(`QA ${runId}: owned rows remain after disposal`)
  console.info(
    `[offline-correction-coordination QA ${runId}] cleanup zero owned rows`,
  )
}
