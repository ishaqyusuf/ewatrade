import { expect } from "bun:test"
import type { Prisma } from "@ewatrade/db"
import { normalizeStockCategoryName } from "@ewatrade/utils/inventory-categories"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposal,
  generalProposalForApp,
} from "./general-proposals"

/** Exact caller-owned QA draft. Setup mutations and all attempted effects roll back. */
export async function verifyPurchaseReceiptProposalGuards(
  ctx: GeneralContext,
  proposalId: string,
) {
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  const actorUserId = ctx.session.user.id
  const storeId = ctx.tenantContext.activeStore?.id
  if (
    !storeId ||
    !(await db.tenant.findFirst({
      where: { id: tenantId, dataClassification: "QA" },
      select: { id: true },
    }))
  )
    throw Error("Classified owned QA Store required")
  const row = await db.assistantActionProposal.findFirstOrThrow({
    where: {
      id: proposalId,
      tenantId,
      actorUserId,
      storeId,
      status: "PENDING",
    },
  })
  const app = generalProposalForApp(row)
  if (
    app.payload.action !== "purchase_recognize" ||
    app.payload.stage !== "RECEIPT" ||
    !app.approvalToken ||
    app.revision < 2
  )
    throw Error("Fresh signed physical receipt draft required")
  const { bookId, recognitionId, effectiveAt } = app.payload
  const source = await db.financePurchaseRecognition.findFirstOrThrow({
    where: { id: recognitionId, tenantId, bookId, storeId },
    include: { lines: true, events: true },
  })
  if (
    !source.lines.length ||
    source.lines.length > 10 ||
    source.events.some((e) => e.stage === "RECEIPT")
  )
    throw Error("Unreceived original QA goods required")
  const balanceIds = source.lines.map((line) => line.balanceSourceId)
  const unitIds = source.lines.map((line) => line.enteredInventoryUnitId)
  const categorySelectors = source.lines.flatMap(
    (line) =>
      line.categories as Array<{ name?: string; categoryNameId?: number }>,
  )
  const category = await db.stockOperationCategoryName.findFirstOrThrow({
    where: {
      tenantId,
      OR: categorySelectors.map((selector) =>
        selector.categoryNameId !== undefined
          ? { id: selector.categoryNameId }
          : {
              normalizedName: normalizeStockCategoryName(selector.name ?? "")
                .normalizedName,
            },
      ),
    },
  })
  const pool = await db.financeInventoryPool.findFirstOrThrow({
    where: {
      tenantId,
      bookId,
      balanceSourceId: { in: balanceIds },
      valueMinor: { not: null },
    },
  })
  const account = await db.financeAccount.findFirstOrThrow({
    where: { bookId, code: "1300", archivedAt: null },
  })
  const membership = await db.membership.findFirstOrThrow({
    where: { tenantId, userId: actorUserId, role: "OWNER" },
  })
  const configurationId = source.lines[0]!.configurationVersionId
  const facts = async () => ({
    commands: await db.financeCommand.count({ where: { bookId } }),
    journals: await db.financeJournalEntry.count({ where: { bookId } }),
    events: await db.financePurchaseRecognitionEvent.count({
      where: { bookId },
    }),
    receipts: await db.financePurchaseReceiptLine.count({ where: { bookId } }),
    valuationEvents: await db.financeInventoryValuationEvent.count({
      where: { bookId },
    }),
    supplierEntries: await db.financeSupplierEntry.count({ where: { bookId } }),
    payments: await db.financeBillPayment.count({ where: { bookId } }),
    allocations: await db.financeSupplierAllocation.count({
      where: { bookId },
    }),
    operations: await db.stockOperation.count({ where: { tenantId, storeId } }),
    movements: await db.stockMovement.count({
      where: { balanceSourceId: { in: balanceIds } },
    }),
    categoryLinks: await db.stockOperationCategory.count({
      where: { tenantId },
    }),
    proposal: await db.assistantActionProposal.findFirstOrThrow({
      where: { id: row.id, tenantId, actorUserId },
      select: {
        status: true,
        revision: true,
        payloadHash: true,
        targetRevision: true,
        executedResult: true,
      },
    }),
    book: await db.financeBook.findFirstOrThrow({
      where: { id: bookId, tenantId },
      select: { lastSequence: true, closedThrough: true },
    }),
    role: (
      await db.membership.findUniqueOrThrow({
        where: { id: membership.id },
        select: { role: true },
      })
    ).role,
    sessionExpiry: (
      await db.session.findUniqueOrThrow({
        where: { id: ctx.session.session.id },
        select: { expiresAt: true },
      })
    ).expiresAt,
    account: await db.financeAccount.findUniqueOrThrow({
      where: { id: account.id },
      select: { archivedAt: true },
    }),
    units: await db.inventoryUnit.findMany({
      where: { id: { in: unitIds } },
      select: {
        id: true,
        factor: true,
        configurationVersion: { select: { status: true } },
      },
      orderBy: { id: "asc" },
    }),
    categories: await db.stockOperationCategoryName.findMany({
      where: { tenantId },
      select: { id: true, name: true, normalizedName: true },
      orderBy: { id: "asc" },
    }),
    pools: await db.financeInventoryPool.findMany({
      where: { tenantId, bookId, balanceSourceId: { in: balanceIds } },
      orderBy: { id: "asc" },
    }),
    stocks: await db.stockBalanceSource.findMany({
      where: { tenantId, storeId, id: { in: balanceIds } },
      select: {
        id: true,
        revision: true,
        onHandQuantity: true,
        reservedQuantity: true,
      },
      orderBy: { id: "asc" },
    }),
  })
  const before = await facts()
  const probes: Array<{
    name: string
    code: string
    message: string
    mutate?: (tx: Prisma.TransactionClient) => Promise<void>
    revision?: number
    approvalToken?: string
  }> = [
    {
      name: "signed-token-changed",
      code: "CONFLICT",
      message: "Approval expired or changed",
      approvalToken: `${app.approvalToken}x`,
    },
    {
      name: "old-revision",
      code: "CONFLICT",
      message: "This draft was edited",
      revision: app.revision - 1,
    },
    {
      name: "role-revoked",
      code: "FORBIDDEN",
      message: "",
      mutate: async (tx) => {
        expect(
          (
            await tx.membership.updateMany({
              where: {
                id: membership.id,
                tenantId,
                userId: actorUserId,
                role: "OWNER",
              },
              data: { role: "CASHIER" },
            })
          ).count,
        ).toBe(1)
      },
    },
    {
      name: "session-expired",
      code: "UNAUTHORIZED",
      message: "Sign in again",
      mutate: async (tx) => {
        expect(
          (
            await tx.session.updateMany({
              where: { id: ctx.session.session.id, userId: actorUserId },
              data: { expiresAt: new Date("2000-01-01") },
            })
          ).count,
        ).toBe(1)
      },
    },
    {
      name: "closed-period",
      code: "CLOSED_PERIOD",
      message: "",
      mutate: async (tx) => {
        expect(
          (
            await tx.financeBook.updateMany({
              where: { id: bookId, tenantId },
              data: { closedThrough: new Date(effectiveAt) },
            })
          ).count,
        ).toBe(1)
      },
    },
    {
      name: "posting-account-archived",
      code: "CONFLICT",
      message: "Purchase control account",
      mutate: async (tx) => {
        expect(
          (
            await tx.financeAccount.updateMany({
              where: { id: account.id, bookId, archivedAt: null },
              data: { archivedAt: new Date() },
            })
          ).count,
        ).toBe(1)
      },
    },
    {
      name: "unit-configuration-retired",
      code: "STALE_CONFIGURATION",
      message: "",
      mutate: async (tx) => {
        expect(
          (
            await tx.unitConfigurationVersion.updateMany({
              where: {
                id: configurationId,
                status: "CURRENT",
                product: { catalogItem: { tenantId } },
              },
              data: { status: "SUPERSEDED" },
            })
          ).count,
        ).toBe(1)
      },
    },
    {
      name: "reviewed-category-label-changed",
      code: "CONFLICT",
      message: "Review again",
      mutate: async (tx) => {
        expect(
          (
            await tx.stockOperationCategoryName.updateMany({
              where: { id: category.id, tenantId, name: category.name },
              data: { name: `${category.name} QA changed` },
            })
          ).count,
        ).toBe(1)
      },
    },
    {
      name: "reviewed-pool-value-changed",
      code: "CONFLICT",
      message: "Review again",
      mutate: async (tx) => {
        expect(
          (
            await tx.financeInventoryPool.updateMany({
              where: {
                id: pool.id,
                tenantId,
                bookId,
                valueMinor: pool.valueMinor,
              },
              data: { valueMinor: { increment: 1n } },
            })
          ).count,
        ).toBe(1)
      },
    },
  ]
  const results = []
  for (const probe of probes) {
    // Fixture mutation is deliberately inside the same caller transaction. It is
    // not the production command lock order and never persists outside this probe.
    const proxyDb = new Proxy(db, {
      get(target, key) {
        if (key === "$transaction")
          return <T>(
            run: (tx: Prisma.TransactionClient) => Promise<T>,
            options?: Parameters<typeof db.$transaction>[1],
          ) =>
            target.$transaction(async (tx) => {
              await probe.mutate?.(tx)
              await run(tx)
              throw Error("GUARD_DID_NOT_REFUSE")
            }, options)
        const value = Reflect.get(target, key)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    const started = performance.now()
    let failure: { code?: string; message: string } | null = null
    try {
      await decideGeneralProposal(
        { ...ctx, db: proxyDb },
        {
          proposalId: app.id,
          revision: probe.revision ?? app.revision,
          approvalToken: probe.approvalToken ?? app.approvalToken,
          decision: "confirm",
        },
      )
    } catch (error) {
      failure = {
        code:
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : undefined,
        message: error instanceof Error ? error.message : String(error),
      }
    }
    const elapsedMs = performance.now() - started
    expect(failure?.code).toBe(probe.code)
    if (probe.message) expect(failure?.message).toContain(probe.message)
    expect(await facts()).toEqual(before)
    const result = {
      name: probe.name,
      elapsedMs,
      failure,
      savedFactsUnchanged: true,
    }
    results.push(result)
    console.info(JSON.stringify(result))
  }
  return {
    verified: true,
    signedApprovalUsed: true,
    pendingRevision: app.revision,
    results,
    savedFactsUnchanged: true,
  }
}
