import { expect, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  assertQaAccessAcceptanceDatabase,
  describeWithQaAccessDatabase,
} from "./acceptance/qa-access/database"
import { CatalogError } from "./catalog-errors"
import { ensureCatalogFreeOfferingInTransaction } from "./catalog-free-lines"
import { createCommercialOrder } from "./commercial-orders"
import { createFinanceBook } from "./finance/accounts"
import { getFinanceAccountBalances } from "./finance/reads"
import {
  type OfflineCommandEnvelope,
  offlineCommandEnvelopeHash,
  replayOfflineCommands,
  reviewOfflineConflict,
} from "./offline-commands"
import { registerOwnedOfflineDevice } from "./offline-device-registration"
import { correctBlankQuickSale } from "./offline-quick-sale-correction"
import { deriveBlankQuickSaleReplacement } from "./offline-quick-sale-correction-input"
import { readOfflineQuickSaleCorrectionRecord } from "./offline-quick-sale-correction-record"
import { updateOfflineOperationsPolicy } from "./offline-settings"

// Actual DB/coordinator/replay/review/canonical commands. No UI or endpoint
// coverage is claimed. The legacy seed below is explicitly synthetic QA data.
const requestedRunId = process.env.QA_OFFLINE_CORRECTION_RUN_ID
if (
  requestedRunId !== undefined &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestedRunId,
  )
)
  throw Error("QA_OFFLINE_CORRECTION_RUN_ID must be a UUID")

// Test-only legacy digest seed: this deliberately duplicates stable JSON to
// seed a pre-description-validation Order, without exporting production internals.
// Canonical reconciliation itself still runs the actual historical hash check.
function legacyJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (value === undefined || value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(legacyJson).join(",")}]`
  return `{${Object.keys(value)
    .sort()
    .filter((key) => Reflect.get(value, key) !== undefined)
    .map(
      (key) => `${JSON.stringify(key)}:${legacyJson(Reflect.get(value, key))}`,
    )
    .join(",")}}`
}
function legacyDigest(value: unknown) {
  return createHash("sha256").update(legacyJson(value)).digest("hex")
}
type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }
const transactionOptions = { maxWait: 10000, timeout: 30000 }

type PlannedUser = { id: string; email: string }

// Drain every dispatched read before cleanup/disconnect even when one fails.
async function settledValues<T extends readonly unknown[]>(
  tasks: {
    [K in keyof T]: Promise<T[K]>
  },
): Promise<T> {
  const results = await Promise.allSettled(tasks)
  const failures = results.filter((result) => result.status === "rejected")
  if (failures.length === 1) throw failures[0]?.reason
  if (failures.length > 1)
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Correction QA reads failed",
    )
  return results.map((result) => {
    if (result.status !== "fulfilled")
      throw Error("Unsettled correction QA read")
    return result.value
  }) as unknown as T
}

describeWithQaAccessDatabase(
  "offline blank Quick sale correction full command integration",
  () => {
    test("retired identities remain final, approved corrected pairs apply once, and legacy canonical results reconcile", async () => {
      assertQaAccessAcceptanceDatabase()
      const runId = requestedRunId ?? randomUUID()
      const started = Date.now()
      const progress = (name: string) => {
        console.info(
          `[offline-correction QA ${runId}] ${name} ${Date.now() - started}ms`,
        )
        // Leave three minutes of the 15-minute test to settle every owned job and
        // perform exact awaited cleanup. No database promise is abandoned/raced.
        if (Date.now() - started > 720000)
          throw Error("Correction integration scenario deadline")
      }
      const { prisma: db } = await import("../client")
      const plannedUsers: PlannedUser[] = []
      let tenantId: string | undefined
      const jobs = new Set<Promise<unknown>>()
      const failures: unknown[] = []
      function tracked<T>(promise: Promise<T>): Promise<Settled<T>> {
        const settled = promise.then(
          (value): Settled<T> => ({ ok: true, value }),
          (error): Settled<T> => ({ ok: false, error }),
        )
        jobs.add(settled)
        void settled.finally(() => jobs.delete(settled))
        return settled
      }
      function succeeded<T>(result: Settled<T>) {
        if (!result.ok) throw result.error
        return result.value
      }
      try {
        progress("setup:start")
        const users = []
        for (const role of ["owner", "rep"]) {
          progress(`setup:user-${role}`)
          const plannedUser = {
            id: randomUUID(),
            email: `offline-correction-${role}-${runId}@example.invalid`,
          }
          // Retain attempted identity BEFORE dispatch: a lost response may
          // follow a committed insert, and a later setup failure still disposes it.
          plannedUsers.push(plannedUser)
          const user = await db.user.create({
            data: {
              ...plannedUser,
              name: `Correction QA ${role}`,
              ageBand: "ADULT",
              ageDeclaredAt: new Date(),
            },
          })
          users.push(user)
        }
        const [owner, rep] = users
        if (!owner || !rep) throw Error("Missing exact QA identities")
        progress("setup:Tenant")
        tenantId = randomUUID()
        const tenant = await db.tenant.create({
          data: {
            id: tenantId,
            name: "Offline correction QA",
            slug: `offline-correction-${runId}`,
            type: "MERCHANT",
            enabledModes: ["MERCHANT"],
            dataClassification: "QA",
            metadata: {
              retailOps: {
                subscription: { planId: "growth", status: "active" },
              },
              offlineOperationsEnabled: true,
              offlineApprovalRequired: false,
            },
            users: {
              create: [
                { userId: owner.id, role: "OWNER", status: "ACTIVE" },
                {
                  userId: rep.id,
                  role: "CASHIER",
                  status: "ACTIVE",
                  staffAccessMode: "LEGACY",
                },
              ],
            },
          },
        })
        progress("setup:Store")
        const store = await db.store.create({
          data: {
            id: randomUUID(),
            tenantId: tenant.id,
            name: "Correction original Store",
            slug: "original",
            status: "ACTIVE",
          },
        })
        const ownerScope = { tenantId: tenant.id, actorUserId: owner.id }
        const scope = {
          tenantId: tenant.id,
          actorUserId: rep.id,
          storeId: store.id,
          deviceId: `offline-correction-${runId}`,
        }
        progress("setup:device")
        const device = await registerOwnedOfflineDevice(db, {
          ...scope,
          platform: "ANDROID",
        })
        // Actual helper preprovisions its hidden charge-only Offering in setup,
        // so an acceptance transaction does not include first-use provisioning.
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
        progress("setup:FinanceBook")
        const book = await createFinanceBook(db, {
          ...ownerScope,
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
        })
        progress("setup:cash-account")
        const cash = await db.financeAccount.findUniqueOrThrow({
          where: { bookId_code: { bookId: book.id, code: "1000" } },
        })
        const draft = (
          label: string,
          amountMinor = 1000,
        ): OfflineCommandEnvelope => ({
          clientCommandId: `${runId}:${label}`,
          createdAtClient: new Date(),
          dependencyClientIds: [],
          eventVersion: 1,
          payload: {
            kind: "commercial_order",
            fulfillNow: true,
            customerName: "Original correction customer",
            lines: [{ custom: "quick_sale", amountMinor, description: "" }],
            initialPayment: {
              amountMinor,
              method: "cash",
              clientPaymentId: `${runId}:${label}:payment`,
              moneyAccountId: cash.id,
            },
          },
        })
        const correctionInput = (
          envelope: OfflineCommandEnvelope,
          suffix = "corrected",
        ) => ({
          ...scope,
          envelope,
          replacementClientCommandId: `${envelope.clientCommandId}:${suffix}`,
          replacementClientPaymentId: `${envelope.clientCommandId}:${suffix}:payment`,
          descriptions: [{ lineIndex: 0, description: "Rice sold" }],
        })
        const canonicalInput = (envelope: OfflineCommandEnvelope) => ({
          ...envelope.payload,
          actorUserId: rep.id,
          tenantId: tenant.id,
          storeId: store.id,
          clientOrderId: envelope.clientCommandId,
          schemaVersion: 1,
        })
        const upload = (commands: OfflineCommandEnvelope[]) =>
          replayOfflineCommands(db, {
            ...scope,
            acceptNewCommands: true,
            requiresApproval: false,
            capabilities: { operateOrders: true },
            commands,
          })
        const command = (clientCommandId: string) =>
          db.offlineCommand.findUniqueOrThrow({
            where: {
              tenantId_clientCommandId: {
                tenantId: tenant.id,
                clientCommandId,
              },
            },
          })
        const snapshot = async () => {
          const where = { tenantId: tenant.id }
          const [
            orders,
            lines,
            payments,
            journals,
            journalLines,
            financeCommands,
            stock,
            orderSequence,
            finance,
          ] = await settledValues([
            db.commercialOrder.count({ where }),
            db.commercialOrderLine.count({ where: { order: where } }),
            db.commercialOrderPayment.count({ where }),
            db.financeJournalEntry.count({ where: { bookId: book.id } }),
            db.financeJournalLine.count({ where: { bookId: book.id } }),
            db.financeCommand.count({ where: { bookId: book.id } }),
            db.stockOperation.count({ where }),
            db.tenant.findUniqueOrThrow({
              where: { id: tenant.id },
              select: { lastCommercialOrderSequence: true },
            }),
            getFinanceAccountBalances(db, { ...ownerScope, bookId: book.id }),
          ])
          return {
            orders,
            lines,
            payments,
            journals,
            journalLines,
            financeCommands,
            stock,
            orderSequence: orderSequence.lastCommercialOrderSequence,
            financeSequence: finance.snapshotSequence,
            accountBalances: finance.accounts
              .map(({ id, balanceMinor }) => ({ id, balanceMinor }))
              .sort((a, b) => a.id.localeCompare(b.id)),
          }
        }
        const audits = () =>
          db.offlineConflictReview.count({
            where: { command: { tenantId: tenant.id } },
          })
        const first = draft("prior-hold")
        const originalHash = offlineCommandEnvelopeHash(first)
        // Web control was created after the offline draft was captured.
        const webEnvelope = draft("web-control", 400)
        progress("setup:canonical-web-control")
        const web = await createCommercialOrder(db, {
          ...canonicalInput(webEnvelope),
          actorUserId: owner.id,
          lines: [
            {
              custom: "quick_sale",
              amountMinor: 400,
              description: "Intervening web sale",
            },
          ],
        })
        const webRead = () =>
          db.commercialOrder.findUniqueOrThrow({
            where: { id: web.id },
            include: { lines: { include: { snapshot: true } }, payments: true },
          })
        progress("setup:baseline-snapshot")
        const webBefore = await webRead()
        const baseline = await snapshot()

        progress("prior-hold:ordinary-blank-refusal")
        const rejectedBlank = await upload([first])
        expect(rejectedBlank[0]).toMatchObject({
          status: "REVIEW_REQUIRED",
          conflictCode: "INVALID_COMMAND",
          result: null,
        })
        expect(await snapshot()).toEqual(baseline)
        const original = await command(first.clientCommandId)
        expect(original.payloadHash).toBe(originalHash)

        progress("concurrent-identical-correction")
        const proposal = correctionInput(first)
        const replacement = deriveBlankQuickSaleReplacement(first, proposal)
        const identical = await Promise.all([
          tracked(correctBlankQuickSale(db, proposal)),
          tracked(correctBlankQuickSale(db, proposal)),
        ])
        const linked = succeeded(
          identical[0] ?? {
            ok: false,
            error: Error("Missing first correction"),
          },
        )
        expect(
          succeeded(
            identical[1] ?? {
              ok: false,
              error: Error("Missing second correction"),
            },
          ),
        ).toEqual(linked)
        expect(linked).toMatchObject({
          outcome: "replaced",
          originalPayloadHash: originalHash,
          replacement: {
            envelope: replacement,
            status: "REVIEW_REQUIRED",
            payloadHash: offlineCommandEnvelopeHash(replacement),
            result: null,
          },
        })
        const retired = await command(first.clientCommandId)
        expect(retired).toMatchObject({
          status: "DISCARDED",
          payloadHash: originalHash,
          payload: original.payload,
        })
        expect(retired.createdAtClient).toEqual(first.createdAtClient)
        expect(retired.dependencyClientIds).toEqual(first.dependencyClientIds)
        expect(
          readOfflineQuickSaleCorrectionRecord(retired.authoritativeState),
        ).toMatchObject({
          originalPayloadHash: originalHash,
          replacementClientCommandId: replacement.clientCommandId,
          replacementPayloadHash: offlineCommandEnvelopeHash(replacement),
          replacedByUserId: rep.id,
        })
        expect(await audits()).toBe(1)
        expect(await snapshot()).toEqual(baseline)

        progress("current-policy-hold")
        await updateOfflineOperationsPolicy(db, {
          tenantId: tenant.id,
          enabled: true,
          approvalRequired: true,
        })
        const policyDraft = draft("current-hold")
        const policyProposal = correctionInput(policyDraft)
        const policyResult = await correctBlankQuickSale(db, policyProposal)
        expect(policyResult).toMatchObject({
          outcome: "replaced",
          replacement: { status: "REVIEW_REQUIRED", result: null },
        })
        expect(await snapshot()).toEqual(baseline)

        progress("competing-proposals-one-winner")
        const contested = draft("competing")
        const competitors = [
          correctionInput(contested, "one"),
          correctionInput(contested, "two"),
        ]
        const competing = await Promise.all(
          competitors.map((input) => tracked(correctBlankQuickSale(db, input))),
        )
        expect(competing.filter((result) => result.ok)).toHaveLength(1)
        expect(competing.filter((result) => !result.ok)).toHaveLength(1)
        for (const result of competing)
          if (!result.ok) {
            expect(result.error).toBeInstanceOf(CatalogError)
            expect(result.error).toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
          }
        const contestRecord = readOfflineQuickSaleCorrectionRecord(
          (await command(contested.clientCommandId)).authoritativeState,
        )
        if (!contestRecord) throw Error("Missing winning correction marker")
        expect(
          await db.offlineCommand.count({
            where: {
              tenantId: tenant.id,
              clientCommandId: {
                in: competitors.map(
                  (input) => input.replacementClientCommandId,
                ),
              },
            },
          }),
        ).toBe(1)
        expect(
          await db.offlineConflictReview.count({
            where: { commandId: (await command(contested.clientCommandId)).id },
          }),
        ).toBe(1)
        expect(await snapshot()).toEqual(baseline)

        progress("old-replay-versus-correction-finality")
        await updateOfflineOperationsPolicy(db, {
          tenantId: tenant.id,
          enabled: true,
          approvalRequired: false,
        })
        const racingDraft = draft("replay-race")
        const racingProposal = correctionInput(racingDraft)
        const raced = await Promise.all([
          tracked(upload([racingDraft])),
          tracked(correctBlankQuickSale(db, racingProposal)),
        ])
        const correctionRace = raced[1]
        if (!correctionRace?.ok)
          throw correctionRace && !correctionRace.ok
            ? correctionRace.error
            : Error("Missing race correction")
        expect(correctionRace.value).toMatchObject({ outcome: "replaced" })
        expect((await command(racingDraft.clientCommandId)).status).toBe(
          "DISCARDED",
        )
        expect((await upload([racingDraft]))[0]?.status).toBe("DISCARDED")
        expect(
          await db.offlineConflictReview.count({
            where: {
              commandId: (await command(racingDraft.clientCommandId)).id,
            },
          }),
        ).toBe(1)
        expect(await snapshot()).toEqual(baseline)

        progress("late-original-child-blocked")
        const child = draft("late-child", 200)
        child.dependencyClientIds = [first.clientCommandId]
        child.payload.lines = [
          {
            custom: "quick_sale",
            amountMinor: 200,
            description: "Late child sale",
          },
        ]
        expect((await upload([child]))[0]).toMatchObject({
          status: "BLOCKED",
          conflictCode: "DEPENDENCY_BLOCKED",
          result: null,
        })
        expect(await snapshot()).toEqual(baseline)

        progress("direct-canonical-retired-id-refusal-and-counter-rollback")
        const beforeDirect = await snapshot()
        await expect(
          createCommercialOrder(db, {
            ...canonicalInput(first),
            lines: [
              {
                custom: "quick_sale",
                amountMinor: 1000,
                description: "Nonblank direct bypass attempt",
              },
            ],
          }),
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
        expect(await snapshot()).toEqual(beforeDirect)
        expect(
          await db.commercialOrder.count({
            where: {
              tenantId: tenant.id,
              clientOrderId: first.clientCommandId,
            },
          }),
        ).toBe(0)

        progress("approve-exact-replacement")
        const replacementCommand = await command(replacement.clientCommandId)
        expect(replacementCommand).toMatchObject({
          status: "REVIEW_REQUIRED",
          payloadHash: offlineCommandEnvelopeHash(replacement),
          offlineDeviceId: device.id,
          payload: {
            actorUserId: rep.id,
            initialPayment: first.payload.initialPayment
              ? {
                  ...first.payload.initialPayment,
                  clientPaymentId:
                    replacement.payload.initialPayment?.clientPaymentId,
                }
              : undefined,
          },
        })
        const approved = await reviewOfflineConflict(db, {
          ...ownerScope,
          commandId: replacementCommand.id,
          decision: "approve",
          reason:
            "QA reviewed original author/account and description-only replacement",
        })
        expect(approved.status).toBe("APPLIED")
        const saved = await db.commercialOrder.findUniqueOrThrow({
          where: {
            tenantId_clientOrderId: {
              tenantId: tenant.id,
              clientOrderId: replacement.clientCommandId,
            },
          },
          include: { payments: true, lines: { include: { snapshot: true } } },
        })
        expect(saved.createdByUserId).toBe(rep.id)
        expect(saved.payloadHash).toBe(
          legacyDigest(canonicalInput(replacement)),
        )
        expect(saved.lines).toHaveLength(1)
        expect(saved.lines[0]?.snapshot).toMatchObject({
          customLineRole: "QUICK_SALE",
          catalogItemName: "Rice sold",
        })
        expect(saved.payments).toHaveLength(1)
        expect(saved.payments[0]).toMatchObject({
          amountMinor: 1000,
          moneyAccountId: cash.id,
          recordedByUserId: rep.id,
          clientPaymentId: replacement.payload.initialPayment?.clientPaymentId,
        })
        const afterApproval = await snapshot()
        expect(afterApproval.orders).toBe(baseline.orders + 1)
        expect(afterApproval.lines).toBe(baseline.lines + 1)
        expect(afterApproval.payments).toBe(baseline.payments + 1)
        expect(afterApproval.orderSequence).toBe(baseline.orderSequence + 1)
        expect(afterApproval.stock).toBe(baseline.stock)
        expect(
          BigInt(
            afterApproval.accountBalances.find((entry) => entry.id === cash.id)
              ?.balanceMinor ?? "missing",
          ) -
            BigInt(
              baseline.accountBalances.find((entry) => entry.id === cash.id)
                ?.balanceMinor ?? "missing",
            ),
        ).toBe(1000n)

        progress("status-reconciliation-no-extra-effects")
        const beforeRetryAudits = await audits()
        const beforeRetryTenant = await db.tenant.findUniqueOrThrow({
          where: { id: tenant.id },
          select: { updatedAt: true },
        })
        const oldRetry = await correctBlankQuickSale(db, proposal)
        expect(oldRetry).toMatchObject({
          outcome: "replaced",
          replacement: {
            status: "APPLIED",
            payloadHash: replacementCommand.payloadHash,
          },
        })
        expect((await upload([first]))[0]?.status).toBe("DISCARDED")
        expect((await upload([replacement]))[0]?.status).toBe("APPLIED")
        expect(
          (
            await reviewOfflineConflict(db, {
              ...ownerScope,
              commandId: replacementCommand.id,
              decision: "approve",
            })
          ).status,
        ).toBe("APPLIED")
        expect(await audits()).toBe(beforeRetryAudits)
        expect(await snapshot()).toEqual(afterApproval)
        expect(
          await db.tenant.findUniqueOrThrow({
            where: { id: tenant.id },
            select: { updatedAt: true },
          }),
        ).toEqual(beforeRetryTenant)
        expect(await webRead()).toEqual(webBefore)

        progress("synthetic-legacy-blank-history-seed")
        const legacy = draft("legacy-lost-result", 300)
        const blankInput = canonicalInput(legacy)
        const legacyOrder = await createCommercialOrder(db, {
          ...blankInput,
          lines: [
            {
              custom: "quick_sale",
              amountMinor: 300,
              description:
                "Synthetic historical sale before blank compatibility seed",
            },
          ],
        })
        const legacyHash = legacyDigest(blankInput)
        await db.$transaction(async (tx) => {
          const owned = await tx.commercialOrder.findFirst({
            where: {
              id: legacyOrder.id,
              tenantId: tenant.id,
              clientOrderId: legacy.clientCommandId,
              createdByUserId: rep.id,
            },
            include: { lines: { include: { snapshot: true } } },
          })
          const line = owned?.lines[0]
          if (
            !owned ||
            owned.lines.length !== 1 ||
            !line?.snapshot ||
            line.snapshot.customLineRole !== "QUICK_SALE"
          )
            throw Error("Synthetic legacy QA ownership/snapshot proof failed")
          // Only this owned Order's digest and its Quick sale display-description
          // snapshot are changed. Payments, amounts, author and all ledgers remain.
          await tx.commercialOrder.update({
            where: { id: owned.id },
            data: { payloadHash: legacyHash },
          })
          await tx.offeringSnapshot.update({
            where: { id: line.snapshot.id },
            data: { catalogItemName: "Quick sale" },
          })
          await tx.offlineCommand.create({
            data: {
              tenantId: tenant.id,
              storeId: store.id,
              offlineDeviceId: device.id,
              clientCommandId: legacy.clientCommandId,
              type: "COMMERCIAL_ORDER",
              status: "PENDING",
              eventVersion: legacy.eventVersion,
              createdAtClient: legacy.createdAtClient,
              dependencyClientIds: [],
              payloadHash: offlineCommandEnvelopeHash(legacy),
              payload: JSON.parse(
                JSON.stringify({ ...legacy.payload, actorUserId: rep.id }),
              ),
            },
          })
        }, transactionOptions)
        const beforeLegacy = await snapshot()
        const beforeLegacyAudits = await audits()
        const legacyProposal = correctionInput(legacy)
        const history = await correctBlankQuickSale(db, legacyProposal)
        expect(history).toMatchObject({
          outcome: "already_applied",
          originalClientCommandId: legacy.clientCommandId,
          result: { id: legacyOrder.id },
        })
        expect(await command(legacy.clientCommandId)).toMatchObject({
          status: "APPLIED",
          payloadHash: offlineCommandEnvelopeHash(legacy),
        })
        expect(
          await db.offlineCommand.count({
            where: {
              tenantId: tenant.id,
              clientCommandId: legacyProposal.replacementClientCommandId,
            },
          }),
        ).toBe(0)
        expect(
          await db.commercialOrder.count({
            where: {
              tenantId: tenant.id,
              clientOrderId: legacy.clientCommandId,
            },
          }),
        ).toBe(1)
        expect(
          await db.commercialOrderPayment.count({
            where: { tenantId: tenant.id, orderId: legacyOrder.id },
          }),
        ).toBe(1)
        expect(await correctBlankQuickSale(db, legacyProposal)).toMatchObject({
          outcome: "already_applied",
          result: { id: legacyOrder.id },
        })
        expect(await audits()).toBe(beforeLegacyAudits)
        expect(await snapshot()).toEqual(beforeLegacy)
        expect(await webRead()).toEqual(webBefore)
        progress("scenario:complete")
      } catch (error) {
        failures.push(error)
        console.error(
          `[offline-correction QA ${runId}] scenario failure before cleanup`,
          error,
        )
      } finally {
        await Promise.all([...jobs])
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
          `Correction QA ${runId}: scenario/disposal failures (original first)`,
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
      `[offline-correction QA ${runId}] cleanup skipped: no fixture writes attempted`,
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
    throw Error(`Correction QA ${runId}: cleanup User proof failed`)
  if (
    tenant &&
    (tenant.slug !== `offline-correction-${runId}` ||
      tenant.dataClassification !== "QA")
  )
    throw Error(`Correction QA ${runId}: cleanup Tenant proof failed`)
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
      console.info(`[offline-correction QA ${runId}] cleanup:${label}`)
      try {
        await db.$transaction(async (tx) => {
          // Re-prove exact QA identity and hold its row in EVERY disposal
          // transaction; a prior successful group grants no later authority.
          const owned = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Tenant" WHERE "id"=${ownedTenantId}
              AND "slug"=${`offline-correction-${runId}`} AND "dataClassification"='QA'
            FOR UPDATE
          `
          if (owned.length !== 1)
            throw Error(`Correction QA ${runId}: cleanup Tenant proof failed`)
          await work(tx)
        }, transactionOptions)
      } catch (error) {
        throw new Error(
          `Correction QA ${runId}: cleanup group ${label} failed`,
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
      // Expected empty for charge-only Quick sales; still dispose exact owned
      // stock rows if a failed assertion exposes an unexpected stock effect.
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
      throw Error(`Correction QA ${runId}: cleanup User proof failed`)
    if (
      (await tx.membership.count({ where: { userId: { in: userIds } } })) !== 0
    )
      throw Error(
        `Correction QA ${runId}: foreign membership prevents User disposal`,
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
        ]
      : []),
  ])
  if (residual.some((count) => count !== 0))
    throw Error(`Correction QA ${runId}: cleanup left owned rows`)
  console.info(`[offline-correction QA ${runId}] cleanup zero owned rows`)
  return true
}
