import { afterAll, expect, test } from "bun:test"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { createQaPrivateMediaSafetyAttestation } from "@ewatrade/service-commerce"
import type { Prisma } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import {
  FINANCE_EXPENSE_RECEIPT_GRANT_PURPOSE,
  FINANCE_EXPENSE_RECEIPT_GRANT_VERSION,
  FINANCE_EXPENSE_RECEIPT_QA_SAFETY_PURPOSE,
  attachFinanceExpenseReceiptInTransaction as attach,
  consumeFinanceExpenseReceiptGrantInTransaction as consume,
  issueFinanceExpenseReceiptGrantInTransaction as issue,
  withdrawFinanceExpenseReceiptInTransaction as withdraw,
} from "./expense-receipt-lifecycle"
import { financeExpenseReceiptStoragePath } from "./expense-receipt-rules"

const tenantIds: string[] = []
const userIds: string[] = []
const rollback = new Error("ROLLBACK_SYNTHETIC_RECEIPT_LIFECYCLE")
const sha = (value: string) => createHash("sha256").update(value).digest("hex")

async function fixture(tx: Prisma.TransactionClient, attached = false) {
  const suffix = randomUUID()
  const owner = await tx.user.create({
    data: {
      email: `receipt-life-owner-${suffix}@example.invalid`,
      name: "Synthetic lifecycle owner",
    },
  })
  userIds.push(owner.id)
  const admin = await tx.user.create({
    data: {
      email: `receipt-life-admin-${suffix}@example.invalid`,
      name: "Synthetic lifecycle admin",
    },
  })
  userIds.push(admin.id)
  const tenant = await tx.tenant.create({
    data: {
      slug: `receipt-life-${suffix}`,
      name: "Synthetic lifecycle acceptance",
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      dataClassification: "QA",
      users: {
        create: [
          { userId: owner.id, role: "OWNER", status: "ACTIVE" },
          { userId: admin.id, role: "ADMIN", status: "ACTIVE" },
        ],
      },
    },
  })
  tenantIds.push(tenant.id)
  const book = await tx.financeBook.create({
    data: {
      tenantId: tenant.id,
      currencyCode: "NGN",
      timezone: "Africa/Lagos",
      startsAt: new Date("2026-01-01"),
      closedThrough: new Date("2026-03-01"),
      createdById: owner.id,
    },
  })
  const bill = await tx.financeBill.create({
    data: {
      bookId: book.id,
      kind: "EXPENSE",
      payeeName: "Synthetic supplier",
      description: "Synthetic retained receipt",
      incurredAt: new Date("2026-02-01"),
      totalMinor: 1000n,
      actorUserId: owner.id,
    },
  })
  const scope = {
    tenantId: tenant.id,
    bookId: book.id,
    billId: bill.id,
    actorUserId: owner.id,
  }
  const id = randomUUID()
  const now = new Date()
  const contentDigest = sha("synthetic original PDF fixture")
  const attestation = createQaPrivateMediaSafetyAttestation({
    byteSize: 16,
    contentDigest,
    mimeType: "application/pdf",
    mediaAssetId: id,
    storageReference: "owned synthetic original; no storage call",
  })
  const asset = await tx.financeExpenseReceiptAsset.create({
    data: {
      id,
      ...scope,
      clientCommandId: `synthetic-intent-${suffix}`,
      payloadHash: sha(suffix),
      originalFileName: "synthetic.pdf",
      contentDigest,
      contentType: "application/pdf",
      sizeBytes: 16,
      storageProvider: "vercel_blob_private",
      storageStoreId: "store_qa",
      storagePath: financeExpenseReceiptStoragePath({
        ...scope,
        assetId: id,
        contentDigest,
        contentType: "application/pdf",
      }),
      uploadState: "VERIFIED",
      safetyState: "SAFE",
      attachmentState: attached ? "ATTACHED" : "UNATTACHED",
      version: 2,
      verifiedAt: new Date(now.getTime() - 500),
      verifiedClaimId: "synthetic-claim",
      verifiedClaimVersion: 1,
      safetyReviewedAt: new Date(now.getTime() - 250),
      safetyAttestation: {
        purpose: FINANCE_EXPENSE_RECEIPT_QA_SAFETY_PURPOSE,
        version: 1,
        runtime: "qa_fixture",
        attestation,
      },
      attachedAt: attached ? now : null,
      attachedById: attached ? owner.id : null,
      retentionHold: true,
      retentionHoldReason: "Synthetic retained evidence",
      createdAt: new Date(now.getTime() - 1000),
      expiresAt: new Date(now.getTime() + 86400_000),
    },
  })
  const command = {
    ...scope,
    assetId: asset.id,
    clientCommandId: `synthetic-attach-${suffix}`,
  }
  const grantInput = {
    ...scope,
    assetId: asset.id,
    nonceDigest: sha(randomBytes(32).toString("hex")),
    sessionDigest: sha(
      `${FINANCE_EXPENSE_RECEIPT_GRANT_PURPOSE}\nsynthetic-session-${suffix}`,
    ),
  }
  const consumeInput = {
    ...grantInput,
    purpose: FINANCE_EXPENSE_RECEIPT_GRANT_PURPOSE,
    version: FINANCE_EXPENSE_RECEIPT_GRANT_VERSION,
  }
  return {
    scope,
    command,
    grantInput,
    consumeInput,
    owner,
    admin,
    tenant,
    book,
    bill,
    asset,
    attestation,
  }
}

async function rolledBack(
  run: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  const { prisma } = await import("../../client")
  try {
    await prisma.$transaction(
      async (tx) => {
        await run(tx)
        throw rollback
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (error !== rollback) throw error
  }
}

async function unchangedMoney(
  tx: Prisma.TransactionClient,
  f: Awaited<ReturnType<typeof fixture>>,
) {
  const source = await tx.financeBill.findUniqueOrThrow({
    where: { id: f.bill.id },
  })
  const book = await tx.financeBook.findUniqueOrThrow({
    where: { id: f.book.id },
  })
  expect(source.totalMinor).toBe(f.bill.totalMinor)
  expect(source.paidMinor).toBe(f.bill.paidMinor)
  expect(source.incurredAt).toEqual(f.bill.incurredAt)
  expect(book.lastSequence).toBe(f.book.lastSequence)
  expect(book.closedThrough).toEqual(f.book.closedThrough)
  expect(
    await tx.financeJournalEntry.count({ where: { bookId: book.id } }),
  ).toBe(0)
}

describeWithServiceCommerceDatabase("expense receipt lifecycle", () => {
  afterAll(async () => {
    const { prisma } = await import("../../client")
    const where = { tenantId: { in: tenantIds } }
    const counts = await Promise.all([
      prisma.tenant.count({ where: { id: { in: tenantIds } } }),
      prisma.user.count({ where: { id: { in: userIds } } }),
      prisma.financeExpenseReceiptAsset.count({ where }),
      prisma.financeExpenseReceiptAuditEvent.count({ where }),
      prisma.financeExpenseReceiptDownloadGrant.count({ where }),
    ])
    for (const count of counts) expect(count).toBe(0)
    console.info(
      "Receipt lifecycle rollback absence evidence",
      JSON.stringify({
        tenantIds,
        userIds,
        tenantUserAssetAuditGrantCounts: counts,
      }),
    )
  })

  test("creator attaches complete persisted QA original in closed period; exact replay survives expiry and cancellation", async () => {
    await rolledBack(async (tx) => {
      const f = await fixture(tx)
      const attached = await attach(tx, f.command)
      expect(attached).toMatchObject({
        attachmentState: "ATTACHED",
        safetyState: "SAFE",
        uploadState: "VERIFIED",
        retentionHold: true,
      })
      expect(await attach(tx, f.command)).toEqual(attached)
      await tx.financeExpenseReceiptAsset.update({
        where: { id: f.asset.id },
        data: { expiresAt: new Date(0) },
      })
      await tx.financeBill.update({
        where: { id: f.bill.id },
        data: { voidedAt: new Date() },
      })
      expect((await attach(tx, f.command)).attachedAt).toEqual(
        attached.attachedAt,
      )
      const stored = await tx.financeExpenseReceiptAsset.findUniqueOrThrow({
        where: { id: f.asset.id },
      })
      expect(stored.storagePath).toBe(f.asset.storagePath)
      expect(stored.contentDigest).toBe(f.asset.contentDigest)
      expect(stored.actorUserId).toBe(f.owner.id)
      expect(
        await tx.financeExpenseReceiptAuditEvent.count({
          where: { assetId: f.asset.id, kind: "ATTACHED" },
        }),
      ).toBe(1)
      await unchangedMoney(tx, f)
    })
  }, 120_000)

  test("noncreator, unfinished upload, expiry and cancellation cannot attach", async () => {
    await rolledBack(async (tx) => {
      const f = await fixture(tx)
      await expect(
        attach(tx, { ...f.command, actorUserId: f.admin.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await tx.financeExpenseReceiptAsset.update({
        where: { id: f.asset.id },
        data: { uploadState: "PENDING" },
      })
      await expect(attach(tx, f.command)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      await tx.financeExpenseReceiptAsset.update({
        where: { id: f.asset.id },
        data: { uploadState: "VERIFIED", expiresAt: new Date(0) },
      })
      await expect(attach(tx, f.command)).rejects.toMatchObject({
        code: "CONFLICT",
      })
      await tx.financeBill.update({
        where: { id: f.bill.id },
        data: { voidedAt: new Date() },
      })
      await expect(attach(tx, f.command)).rejects.toMatchObject({
        code: "CONFLICT",
      })
      expect(
        await tx.financeCommand.count({ where: { bookId: f.book.id } }),
      ).toBe(0)
      expect(
        await tx.financeExpenseReceiptAuditEvent.count({
          where: { assetId: f.asset.id },
        }),
      ).toBe(0)
    })
  }, 120_000)

  test("persisted SAFE alone, claimed live provenance and actual LIVE Tenant fail closed", async () => {
    await rolledBack(async (tx) => {
      const f = await fixture(tx)
      await tx.financeExpenseReceiptAsset.update({
        where: { id: f.asset.id },
        data: { safetyAttestation: { attestation: f.attestation } },
      })
      await expect(attach(tx, f.command)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      await tx.financeExpenseReceiptAsset.update({
        where: { id: f.asset.id },
        data: {
          safetyAttestation: {
            purpose: FINANCE_EXPENSE_RECEIPT_QA_SAFETY_PURPOSE,
            version: 1,
            runtime: "qa_fixture",
            attestation: { ...f.attestation, source: "live" },
          },
        },
      })
      await expect(attach(tx, f.command)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      await tx.financeExpenseReceiptAsset.update({
        where: { id: f.asset.id },
        data: {
          safetyAttestation: {
            purpose: FINANCE_EXPENSE_RECEIPT_QA_SAFETY_PURPOSE,
            version: 1,
            runtime: "qa_fixture",
            attestation: f.attestation,
          },
        },
      })
      await tx.tenant.update({
        where: { id: f.tenant.id },
        data: { dataClassification: "LIVE" },
      })
      await expect(attach(tx, f.command)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      expect(
        await tx.financeCommand.count({ where: { bookId: f.book.id } }),
      ).toBe(0)
    })
  }, 120_000)

  test("ever-attached withdrawn receipts reserve the Expense quota", async () => {
    await rolledBack(async (tx) => {
      const f = await fixture(tx)
      await tx.financeExpenseReceiptAsset.createMany({
        data: Array.from({ length: 12 }, (_, index) => {
          const id = randomUUID()
          return {
            ...f.asset,
            id,
            safetyAttestation: undefined,
            clientCommandId: `synthetic-quota-${index}`,
            storagePath: financeExpenseReceiptStoragePath({
              ...f.scope,
              assetId: id,
              contentDigest: f.asset.contentDigest,
              contentType: "application/pdf",
            }),
            attachmentState: "WITHDRAWN" as const,
            attachedAt: new Date(),
            attachedById: f.owner.id,
            withdrawnAt: new Date(),
            withdrawnById: f.owner.id,
          }
        }),
      })
      await expect(attach(tx, f.command)).rejects.toMatchObject({
        code: "CONFLICT",
      })
      expect(
        await tx.financeExpenseReceiptAsset.count({
          where: { billId: f.bill.id, attachedAt: { not: null } },
        }),
      ).toBe(12)
      expect(
        await tx.financeCommand.count({ where: { bookId: f.book.id } }),
      ).toBe(0)
    })
  }, 120_000)

  test("Admin withdrawal retains original evidence and revokes unused grants", async () => {
    await rolledBack(async (tx) => {
      const f = await fixture(tx, true)
      const grant = await issue(tx, f.grantInput)
      await tx.financeBill.update({
        where: { id: f.bill.id },
        data: { voidedAt: new Date() },
      })
      const command = {
        ...f.command,
        actorUserId: f.admin.id,
        clientCommandId: `synthetic-withdraw-${f.asset.id}`,
      }
      const withdrawn = await withdraw(tx, command)
      expect(await withdraw(tx, command)).toEqual(withdrawn)
      await expect(consume(tx, f.consumeInput)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      const stored = await tx.financeExpenseReceiptAsset.findUniqueOrThrow({
        where: { id: f.asset.id },
      })
      expect(stored).toMatchObject({
        attachmentState: "WITHDRAWN",
        attachedAt: f.asset.attachedAt,
        attachedById: f.owner.id,
        contentDigest: f.asset.contentDigest,
        storagePath: f.asset.storagePath,
        retentionHold: true,
        bytesDeletedAt: null,
      })
      expect(
        (
          await tx.financeExpenseReceiptDownloadGrant.findUniqueOrThrow({
            where: { id: grant.id },
          })
        ).revokedAt,
      ).not.toBeNull()
      expect(
        await tx.financeExpenseReceiptAuditEvent.count({
          where: { assetId: f.asset.id, kind: "WITHDRAWN" },
        }),
      ).toBe(1)
      await unchangedMoney(tx, f)
    })
  }, 120_000)

  test("original attachment retry never reattaches a withdrawn retained receipt", async () => {
    await rolledBack(async (tx) => {
      const f = await fixture(tx)
      await attach(tx, f.command)
      const withdrawn = await withdraw(tx, {
        ...f.command,
        clientCommandId: `synthetic-withdraw-${f.asset.id}`,
      })
      expect(await attach(tx, f.command)).toEqual(withdrawn)
      await expect(
        attach(tx, {
          ...f.command,
          clientCommandId: `synthetic-reattach-${f.asset.id}`,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(
        await tx.financeExpenseReceiptAuditEvent.count({
          where: { assetId: f.asset.id, kind: "ATTACHED" },
        }),
      ).toBe(1)
      expect(
        (
          await tx.financeExpenseReceiptAsset.findUniqueOrThrow({
            where: { id: f.asset.id },
          })
        ).attachedAt,
      ).toEqual(withdrawn.attachedAt)
      await unchangedMoney(tx, f)
    })
  }, 120_000)

  test("short hash-only grant is used once, including two overlapping conditional consumers", async () => {
    await rolledBack(async (tx) => {
      const f = await fixture(tx, true)
      await tx.financeBill.update({
        where: { id: f.bill.id },
        data: { voidedAt: new Date() },
      })
      await expect(
        issue(tx, { ...f.grantInput, sessionDigest: "raw-session" }),
      ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
      const grant = await issue(tx, f.grantInput)
      await expect(issue(tx, f.grantInput)).rejects.toMatchObject({
        code: "CONFLICT",
      })
      expect(grant.expiresAt.getTime() - grant.issuedAt.getTime()).toBe(60_000)
      expect(grant).toMatchObject({
        purpose: "FINANCE_EXPENSE_RECEIPT_DOWNLOAD",
        version: 1,
      })
      for (const field of [
        "sessionDigest",
        "nonceDigest",
        "storagePath",
        "token",
        "url",
      ])
        expect(grant).not.toHaveProperty(field)
      const results = await Promise.allSettled([
        consume(tx, f.consumeInput),
        consume(tx, f.consumeInput),
      ])
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1)
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1)
      const stored =
        await tx.financeExpenseReceiptDownloadGrant.findUniqueOrThrow({
          where: { id: grant.id },
        })
      expect(stored).toMatchObject({
        nonceDigest: f.grantInput.nonceDigest,
        sessionDigest: f.grantInput.sessionDigest,
        contentDigest: f.asset.contentDigest,
      })
      expect(stored.consumedAt).not.toBeNull()
      expect(
        await tx.financeExpenseReceiptAuditEvent.count({
          where: { assetId: f.asset.id, kind: "DOWNLOAD_CONSUMED" },
        }),
      ).toBe(1)
      await unchangedMoney(tx, f)
    })
  }, 120_000)

  test("grants refuse wrong actor session purpose version and expiry without consuming", async () => {
    await rolledBack(async (tx) => {
      const f = await fixture(tx, true)
      const grant = await issue(tx, f.grantInput)
      for (const change of [
        { actorUserId: f.admin.id },
        { sessionDigest: sha("another-session") },
        { purpose: "other-purpose" },
        { version: 2 },
      ]) {
        await expect(
          consume(tx, { ...f.consumeInput, ...change }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" })
      }
      await tx.financeExpenseReceiptDownloadGrant.update({
        where: { id: grant.id },
        data: { contentDigest: sha("another-original") },
      })
      await expect(consume(tx, f.consumeInput)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      await tx.financeExpenseReceiptDownloadGrant.update({
        where: { id: grant.id },
        data: { expiresAt: new Date(0), contentDigest: f.asset.contentDigest },
      })
      await expect(consume(tx, f.consumeInput)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      expect(
        (
          await tx.financeExpenseReceiptDownloadGrant.findUniqueOrThrow({
            where: { id: grant.id },
          })
        ).consumedAt,
      ).toBeNull()
      expect(
        await tx.financeExpenseReceiptAuditEvent.count({
          where: { assetId: f.asset.id, kind: "DOWNLOAD_CONSUMED" },
        }),
      ).toBe(0)
    })
  }, 120_000)

  test("current revocation purge and deletion invalidate issued grants", async () => {
    await rolledBack(async (tx) => {
      const f = await fixture(tx, true)
      const grant = await issue(tx, f.grantInput)
      await tx.membership.updateMany({
        where: { tenantId: f.tenant.id, userId: f.owner.id },
        data: { status: "SUSPENDED" },
      })
      await expect(consume(tx, f.consumeInput)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      await tx.membership.updateMany({
        where: { tenantId: f.tenant.id, userId: f.owner.id },
        data: { status: "ACTIVE" },
      })
      await tx.tenant.update({
        where: { id: f.tenant.id },
        data: { qaPurgeStartedAt: new Date() },
      })
      await expect(consume(tx, f.consumeInput)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      await tx.tenant.update({
        where: { id: f.tenant.id },
        data: { qaPurgeStartedAt: null },
      })
      await tx.financeExpenseReceiptAsset.update({
        where: { id: f.asset.id },
        data: { bytesDeletedAt: new Date() },
      })
      await expect(consume(tx, f.consumeInput)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      expect(
        (
          await tx.financeExpenseReceiptDownloadGrant.findUniqueOrThrow({
            where: { id: grant.id },
          })
        ).consumedAt,
      ).toBeNull()
    })
  }, 120_000)
})
