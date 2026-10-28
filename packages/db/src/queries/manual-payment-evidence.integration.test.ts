import { expect, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { assertQaAccessAcceptanceDatabase } from "./acceptance/qa-access/database"
import {
  type ManualPaymentDecision,
  createBusinessPaymentLink,
  createManualBankAccount,
  prepareManualPaymentReport,
  reviewManualPaymentReport,
  submitManualPaymentReport,
} from "./business-payment-links"
import { createCommercialOrderInTransaction } from "./commercial-orders"
import { createFinanceBookInTransaction } from "./finance/accounts"

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
// Setup-only adapter joins an explicitly owned QA transaction; no providers/storage.
function joinedClient(tx: Prisma.TransactionClient): PrismaClient {
  return new Proxy(tx, {
    get(target, key) {
      if (key === "$transaction")
        return (run: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          run(tx)
      const value = Reflect.get(target, key)
      return typeof value === "function" ? value.bind(target) : value
    },
  }) as PrismaClient
}

/** Each retry opens a fresh real SERIALIZABLE transaction; never retries an aborted tx. */
async function raceDecisions(
  db: PrismaClient,
  decisions: ManualPaymentDecision[],
) {
  let started = 0
  let release!: () => void
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  const sessions = new Set<number>()
  const traced = new Proxy(db, {
    get(target, key) {
      if (key === "$transaction")
        return (
          run: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options: {
            isolationLevel?: string
            maxWait?: number
            timeout?: number
          },
        ) => {
          expect(options.isolationLevel).toBe("Serializable")
          return db.$transaction(
            async (tx) => {
              const [row] = await tx.$queryRaw<
                { pid: number }[]
              >`SELECT pg_backend_pid() AS pid`
              if (!row) throw new Error("Missing SQL session")
              sessions.add(row.pid)
              started++
              if (started <= 2) {
                if (started === 2) release()
                await barrier
              }
              return run(tx)
            },
            { ...options, isolationLevel: "Serializable" },
          )
        }
      const value = Reflect.get(target, key)
      return typeof value === "function" ? value.bind(target) : value
    },
  }) as PrismaClient
  const outcomes = await Promise.allSettled(
    decisions.map((decision) => reviewManualPaymentReport(traced, decision)),
  )
  const rejected = outcomes.flatMap((outcome) => {
    if (outcome.status !== "rejected") return []
    const error: unknown = outcome.reason
    const code =
      error && typeof error === "object" ? Reflect.get(error, "code") : null
    return [
      {
        name: error instanceof Error ? error.name : "UnknownRejection",
        code: typeof code === "string" ? code.slice(0, 80) : null,
        // Tail retains database cause; bounded, no stack/metadata/connection URL dump.
        message:
          error instanceof Error
            ? error.message
                .replace(
                  /\b(?:postgres(?:ql)?|https?):\/\/[^\s]+/gi,
                  "[redacted URL]",
                )
                .slice(-1000)
            : "Non-Error rejection",
      },
    ]
  })
  if (outcomes.every((outcome) => outcome.status === "rejected"))
    throw new Error(
      `Both evidence confirmations failed: ${JSON.stringify(rejected)}`,
    )
  expect(sessions.size).toBeGreaterThanOrEqual(2)
  expect(
    outcomes.filter((outcome) => outcome.status === "fulfilled"),
  ).toHaveLength(1)
  const refusal = outcomes.find((outcome) => outcome.status === "rejected")
  if (!refusal || refusal.status !== "rejected")
    throw new Error("Expected duplicate refusal")
  expect(String(refusal.reason)).toMatch(/already (been )?used/)
  const success = outcomes.find((outcome) => outcome.status === "fulfilled")
  if (!success || success.status !== "fulfilled")
    throw new Error("Missing canonical confirmation")
  return success.value
}
;(enabled ? test : test.skip)(
  "verified artifact and NIBSS account-alias races each consume one receipt across different Orders",
  async () => {
    assertQaAccessAcceptanceDatabase()
    const { prisma } = await import("../client")
    const nonce = randomUUID()
    const tenantId = `manual-evidence-${nonce}`
    const actorUserId = `manual-evidence-user-${nonce}`
    const actor = { tenantId, actorUserId }
    let bookId: string | undefined
    try {
      const decisions = await prisma.$transaction(
        async (tx) => {
          await tx.tenant.create({
            data: {
              id: tenantId,
              slug: tenantId,
              name: "Manual evidence QA",
              type: "MERCHANT",
              enabledModes: ["MERCHANT"],
              currencyCode: "NGN",
              timezone: "Africa/Lagos",
              dataClassification: "QA",
              qaSourceDomain: "manual-evidence.test",
              qaMarkedAt: new Date(),
            },
          })
          await tx.user.create({
            data: { id: actorUserId, email: `${nonce}@example.test` },
          })
          await tx.membership.create({
            data: {
              tenantId,
              userId: actorUserId,
              role: "OWNER",
              status: "ACTIVE",
            },
          })
          const store = await tx.store.create({
            data: {
              tenantId,
              name: "Main",
              slug: `main-${nonce}`,
              status: "ACTIVE",
            },
          })
          const book = await createFinanceBookInTransaction(tx, {
            ...actor,
            startsAt: new Date(Date.now() - 86400_000),
          })
          bookId = book.id
          const db = joinedClient(tx)
          const accounts = []
          for (const index of [0, 1])
            accounts.push(
              await createManualBankAccount(db, {
                ...actor,
                bookId,
                clientAccountId: `evidence-bank-${index}`,
                name: `Synthetic bank alias ${index}`,
                bankName: "GTBank",
                accountNumber: "0123456789",
                accountHolder: "QA Business",
              }),
            )
          const decisions: ManualPaymentDecision[] = []
          for (const index of [0, 1, 2, 3]) {
            const account = accounts[index % 2]
            if (!account) throw new Error("Missing QA bank")
            const order = await createCommercialOrderInTransaction(tx, {
              ...actor,
              clientOrderId: `${nonce}-${index}`,
              schemaVersion: 1,
              storeId: store.id,
              lines: [
                {
                  custom: "quick_sale",
                  description: "Synthetic receipt race",
                  amountMinor: 10000,
                },
              ],
            })
            const now = new Date()
            const link = await createBusinessPaymentLink(db, {
              ...actor,
              orderId: order.id,
              storeId: store.id,
              bankAccountId: account.id,
              clientLinkId: `evidence-link-${index}`,
              allowPartial: true,
              now,
              expiresAt: new Date(now.getTime() + 3600_000),
            })
            const report = await prepareManualPaymentReport(db, {
              linkId: link.link.id,
              expiresAt: link.link.expiresAt,
              paymentAttemptId: link.attempt.id,
              clientReportId: `evidence-report-${index}`,
              payerName: "Synthetic QA payer",
              claimedAmountMinor: 5000,
            })
            await submitManualPaymentReport(db, { reportId: report.report.id })
            if (index < 2) {
              // DB-policy fixture only: emulates ingress metadata; this is NOT upload-safety proof.
              await tx.manualPaymentReport.update({
                where: { id: report.report.id },
                data: {
                  receiptDigest: createHash("sha256")
                    .update(`synthetic-private-artifact:${nonce}`)
                    .digest("hex"),
                  receiptUploadedAt: now,
                  receiptContentType: "image/png",
                  receiptSizeBytes: 1,
                  receiptStoragePath: "synthetic-never-read",
                },
              })
            }
            decisions.push({
              ...actor,
              reportId: report.report.id,
              expectedRevision: 2,
              outcome: "received",
              bankCheckAttested: true,
              receivedAmountMinor: 5000,
              moneyAccountId: account.id,
              receivedAt: new Date(now.getTime() - 1000),
              reference:
                index < 2
                  ? "synthetic-bank-review"
                  : "123456789012345678901234567890",
              ...(index >= 2
                ? { transferReferenceNamespace: "nibss_session_id" }
                : {}),
            })
          }
          return decisions
        },
        { maxWait: 10000, timeout: 120000 },
      )
      const artifact = await raceDecisions(prisma, decisions.slice(0, 2))
      const bankId = await raceDecisions(prisma, decisions.slice(2, 4))
      expect(artifact.report.canonicalPaymentId).toBeTruthy()
      expect(bankId.report.canonicalPaymentId).toBeTruthy()
      expect(
        await prisma.manualPaymentTransferConsumption.count({
          where: { tenantId },
        }),
      ).toBe(1)
      expect(
        await prisma.commercialOrderPayment.count({ where: { tenantId } }),
      ).toBe(2)
      expect(
        (
          await prisma.commercialOrderPayment.aggregate({
            where: { tenantId },
            _sum: { amountMinor: true },
          })
        )._sum.amountMinor,
      ).toBe(10000)
      const confirmed = await prisma.manualPaymentReport.findMany({
        where: { link: { tenantId }, status: "CONFIRMED" },
        select: { id: true },
      })
      for (const row of confirmed) {
        const decision = decisions.find(
          (decision) => decision.reportId === row.id,
        )
        if (!decision) throw new Error("Missing replay input")
        expect((await reviewManualPaymentReport(prisma, decision)).replay).toBe(
          true,
        )
      }
    } finally {
      await prisma.$transaction(
        async (tx) => {
          await tx.manualReceiptAssessment.deleteMany({ where: { tenantId } })
          await tx.manualPaymentTransferConsumption.deleteMany({
            where: { tenantId },
          })
          await tx.manualPaymentReport.deleteMany({
            where: { link: { tenantId } },
          })
          await tx.manualPaymentAttempt.deleteMany({ where: { tenantId } })
          await tx.manualPaymentLink.deleteMany({ where: { tenantId } })
          await tx.commercialOrderPayment.deleteMany({ where: { tenantId } })
          await tx.commercialOrder.deleteMany({ where: { tenantId } })
          if (bookId) {
            await tx.financeCommand.deleteMany({ where: { bookId } })
            await tx.financeJournalLine.deleteMany({ where: { bookId } })
            await tx.financeJournalEntry.deleteMany({ where: { bookId } })
            await tx.financeAccount.deleteMany({ where: { bookId } })
            await tx.financeBook.deleteMany({ where: { id: bookId, tenantId } })
          }
          await tx.tenant.deleteMany({
            where: {
              id: tenantId,
              dataClassification: "QA",
              qaSourceDomain: "manual-evidence.test",
            },
          })
          await tx.user.deleteMany({
            where: { id: actorUserId, email: `${nonce}@example.test` },
          })
        },
        { maxWait: 10000, timeout: 120000 },
      )
      expect(await prisma.tenant.count({ where: { id: tenantId } })).toBe(0)
    }
  },
  300000,
)
