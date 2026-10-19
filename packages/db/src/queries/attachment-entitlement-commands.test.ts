import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  type AddCommercialOrderActivityInput,
  addCommercialOrderActivity,
  addStoredFileToCommercialOrderInTransaction,
  listCommercialOrderActivity,
  markCommercialOrderAttachmentUploaded,
  readCommercialOrderAttachment,
} from "./commercial-order-activity"
import type { RetailOpsPlanId } from "./retail-ops-subscription-plans"
import {
  addServiceInternalNoteInTransaction,
  captureServiceEvidence,
  getServiceJob,
  publishServiceEvidence,
  revokeServiceEvidencePublication,
  updateServiceEvidenceUpload,
} from "./service-work"

// Real command functions with inert Prisma delegates; no module mocks,
// network, provider, storage or database connection is created by this suite.
const now = new Date("2026-10-17T12:00:00.000Z")
const file = {
  kind: "IMAGE" as const,
  contentType: "image/jpeg",
  contentDigest: "a".repeat(64),
  sizeBytes: 25,
  originalFileName: "receipt.jpg",
}
const scope = { storeId: "store", tenantId: "tenant" }
const activityInput: AddCommercialOrderActivityInput = {
  tenantId: "tenant",
  scope,
  orderId: "order",
  actorUserId: "actor",
  clientActivityId: "activity-identity",
  body: "Delivery received",
  attachments: [file],
}
const captureInput = {
  actorUserId: "actor",
  clientEvidenceId: "evidence-identity",
  jobId: "job",
  mediaType: "photo" as const,
  purpose: "progress" as const,
  tenantId: "tenant",
}
const storage = {
  storagePath: "inert/path",
  storageProvider: "fixture",
  storageStoreId: null,
}
type ActivityCreate = {
  data: {
    clientActivityId: string
    payloadHash: string
    body: string | null
    source: string
    attachments?: { create: unknown[] }
  }
}
const makeAttachment = () => ({
  ...file,
  id: "attachment",
  status: "PENDING_UPLOAD",
  createdAt: now,
  uploadExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
  ...storage,
})
type Attachment = ReturnType<typeof makeAttachment>
type Activity = {
  id: string
  actorUserId: string
  orderId: string
  clientActivityId: string
  payloadHash: string
  body: string | null
  source: string
  createdAt: Date
  attachments: Attachment[]
}

function fixture(initialPlan: RetailOpsPlanId = "free") {
  const state = {
    plan: initialPlan,
    activity: null as Activity | null,
    attachment: null as Attachment | null,
    evidence: {
      id: "evidence",
      serviceJobId: "job",
      tenantId: "tenant",
      uploadStatus: "LOCAL",
      visibility: "INTERNAL",
      safePublicAssetId: "safe-asset",
      safetyMetadata: { reviewed: true },
      mediaType: "PHOTO",
      purpose: "PROGRESS",
    },
  }
  const writes: string[] = []
  const tenantReads: unknown[] = []
  const db = {
    tenant: {
      findUniqueOrThrow: async (query: unknown) => {
        tenantReads.push(query)
        return { metadata: {}, subscription: { plan: { key: state.plan } } }
      },
    },
    commercialOrder: { findFirst: async () => ({ id: "order" }) },
    commercialOrderActivity: {
      findUnique: async () => state.activity,
      findUniqueOrThrow: async () => {
        if (!state.activity) throw Error("Missing fixture activity")
        return state.activity
      },
      findMany: async () => (state.activity ? [state.activity] : []),
      create: async ({ data }: ActivityCreate) => {
        writes.push("activity.create")
        const attachments =
          data.attachments?.create.map(() => makeAttachment()) ?? []
        state.attachment = attachments[0] ?? null
        state.activity = {
          id: "activity",
          actorUserId: "actor",
          orderId: "order",
          clientActivityId: data.clientActivityId,
          payloadHash: data.payloadHash,
          body: data.body,
          source: data.source,
          createdAt: now,
          attachments,
        }
        return state.activity
      },
    },
    commercialOrderAttachment: {
      findFirst: async () => state.attachment,
      create: async () => {
        writes.push("attachment.create")
        state.attachment = makeAttachment()
        state.activity?.attachments.push(state.attachment)
        return state.attachment
      },
      update: async ({ data }: { data: Partial<Attachment> }) => {
        writes.push("attachment.update")
        if (!state.attachment) throw Error("Missing fixture attachment")
        Object.assign(state.attachment, data)
        return state.attachment
      },
      updateMany: async ({ data }: { data: Partial<Attachment> }) => {
        writes.push("attachment.updateMany")
        if (!state.attachment) throw Error("Missing fixture attachment")
        Object.assign(state.attachment, data)
        return { count: 1 }
      },
    },
    user: { findMany: async () => [] },
    serviceJob: {
      findFirst: async () => ({
        id: "job",
        commercialOrderId: "order",
        storeId: "store",
        commercialOrder: {
          amountPaidMinor: 0,
          payments: [],
          paymentStatus: "UNPAID",
          totalMinor: 100,
          currencyCode: "NGN",
        },
        assignments: [],
        dueCommitments: [],
        evidence: [state.evidence],
        exceptions: [],
        lines: [],
        notificationIntents: [],
        notes: [],
      }),
    },
    serviceEvidence: {
      findFirst: async () => state.evidence,
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        writes.push("evidence.upsert")
        Object.assign(state.evidence, create)
        return state.evidence
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push("evidence.update")
        // Prisma omits undefined update fields; it does not erase them.
        Object.assign(
          state.evidence,
          Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
          ),
        )
        return state.evidence
      },
    },
    serviceEvidenceAuditEvent: {
      create: async () => {
        writes.push("evidence.audit")
        return {}
      },
    },
    serviceInternalNote: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        writes.push("serviceNote.upsert")
        return { id: "service-note", ...create }
      },
    },
    customerTrackingAccess: { findFirst: async () => ({ id: "tracking" }) },
    $transaction: async <T>(
      operation: (tx: Prisma.TransactionClient) => Promise<T>,
    ): Promise<T> => operation(db as unknown as Prisma.TransactionClient),
  }
  return {
    db: db as unknown as PrismaClient,
    tx: db as unknown as Prisma.TransactionClient,
    state,
    writes,
    tenantReads,
    store: async (_attachmentId: string) => {
      writes.push("bytes.store")
      return storage
    },
  }
}

const denied = { code: "PLAN_FEATURE_UNAVAILABLE", feature: "attachments" }
function expectFreshTenantRead(reads: unknown[], count = 1) {
  expect(reads).toHaveLength(count)
  expect(reads.at(-1)).toMatchObject({
    where: { id: "tenant" },
    select: {
      metadata: true,
      subscription: { select: { plan: { select: { key: true } } } },
    },
  })
}

test("Free refuses a new Order attachment before activity creation", async () => {
  const f = fixture()
  await expect(
    addCommercialOrderActivity(f.db, activityInput),
  ).rejects.toMatchObject(denied)
  expect(f.writes).toEqual([])
  expect(f.state.activity).toBeNull()
  expectFreshTenantRead(f.tenantReads)
})

test("Free refuses an existing-file copy before creating rows or storing bytes", async () => {
  const f = fixture()
  await expect(
    addStoredFileToCommercialOrderInTransaction(f.tx, {
      ...activityInput,
      source: "assistant",
      file,
      store: f.store,
    }),
  ).rejects.toMatchObject(denied)
  expect(f.writes).toEqual([])
  expect(f.state.activity).toBeNull()
  expectFreshTenantRead(f.tenantReads)
})

test("Free text-only Order notes remain available without an entitlement read", async () => {
  const f = fixture()
  const result = await addCommercialOrderActivity(f.db, {
    ...activityInput,
    attachments: [],
  })
  expect(result.body).toBe("Delivery received")
  expect(result.attachments).toEqual([])
  expect(f.writes).toEqual(["activity.create"])
  expect(f.tenantReads).toEqual([])
})

test("Free text-only Service notes remain available without an entitlement read", async () => {
  const f = fixture()
  const result = await addServiceInternalNoteInTransaction(f.tx, {
    actorUserId: "actor",
    tenantId: "tenant",
    jobId: "job",
    clientCommandId: "service-note-identity",
    body: "  Customer called  ",
  })
  expect(result.body).toBe("Customer called")
  expect(f.writes).toEqual(["serviceNote.upsert"])
  expect(f.tenantReads).toEqual([])
})

test("immutable Order activity replay survives downgrade while pending upload promotion is denied", async () => {
  const f = fixture("starter")
  const original = await addCommercialOrderActivity(f.db, activityInput)
  const priorWrites = [...f.writes]
  f.state.plan = "free"
  expect(await addCommercialOrderActivity(f.db, activityInput)).toEqual(
    original,
  )
  expect(f.writes).toEqual(priorWrites)
  await expect(
    markCommercialOrderAttachmentUploaded(f.db, {
      attachmentId: "attachment",
      tenantId: "tenant",
      ...storage,
    }),
  ).rejects.toMatchObject(denied)
  expect(f.writes).toEqual(priorWrites)
  expect(f.state.attachment?.status).toBe("PENDING_UPLOAD")
  expectFreshTenantRead(f.tenantReads, 2)
})

test("existing stored-file activity replay after downgrade performs no second copy", async () => {
  const f = fixture("starter")
  const input = {
    ...activityInput,
    source: "assistant" as const,
    file,
    store: f.store,
  }
  const original = await addStoredFileToCommercialOrderInTransaction(
    f.tx,
    input,
  )
  f.state.plan = "free"
  expect(
    await addStoredFileToCommercialOrderInTransaction(f.tx, input),
  ).toEqual(original)
  expect(f.writes.filter((event) => event === "bytes.store")).toHaveLength(1)
  expect(f.tenantReads).toHaveLength(1)
})

for (const uploadStatus of [undefined, "local", "queued", "failed"] as const) {
  test(`Free refuses new Service evidence capture (${uploadStatus ?? "default"}) before metadata or audit writes`, async () => {
    const f = fixture()
    await expect(
      captureServiceEvidence(f.db, { ...captureInput, uploadStatus }),
    ).rejects.toMatchObject(denied)
    expect(f.writes).toEqual([])
    expectFreshTenantRead(f.tenantReads)
  })
}

for (const status of ["queued", "uploading", "available"] as const) {
  test(`Service evidence ${status} promotion reads current entitlement after downgrade`, async () => {
    const f = fixture("starter")
    await captureServiceEvidence(f.db, captureInput)
    f.state.plan = "free"
    const priorWrites = [...f.writes]
    await expect(
      updateServiceEvidenceUpload(f.db, {
        actorUserId: "actor",
        tenantId: "tenant",
        evidenceId: "evidence",
        status,
      }),
    ).rejects.toMatchObject(denied)
    expect(f.writes).toEqual(priorWrites)
    expect(f.state.evidence.uploadStatus).toBe("LOCAL")
    expectFreshTenantRead(f.tenantReads, 2)
  })
}

test("Free still allows failed-upload cleanup and publication revocation", async () => {
  const f = fixture()
  const failed = await updateServiceEvidenceUpload(f.db, {
    actorUserId: "actor",
    tenantId: "tenant",
    evidenceId: "evidence",
    status: "failed",
    failureReason: "Plan changed before upload",
  })
  expect(failed.uploadStatus).toBe("FAILED")
  const revoked = await revokeServiceEvidencePublication(f.db, {
    actorUserId: "actor",
    tenantId: "tenant",
    evidenceId: "evidence",
    reason: "Remove public access",
  })
  expect(revoked.visibility).toBe("REVOKED")
  expect(f.tenantReads).toEqual([])
  expect(f.writes).toEqual([
    "evidence.update",
    "evidence.audit",
    "evidence.update",
    "evidence.audit",
  ])
})

test("Free cannot publish an otherwise available safety-reviewed Service asset", async () => {
  const f = fixture()
  f.state.evidence.uploadStatus = "AVAILABLE"
  await expect(
    publishServiceEvidence(f.db, {
      actorUserId: "actor",
      tenantId: "tenant",
      evidenceId: "evidence",
    }),
  ).rejects.toMatchObject(denied)
  expect(f.writes).toEqual([])
  expectFreshTenantRead(f.tenantReads)
})

test("downgrade preserves historical Order attachment and Service evidence reads", async () => {
  const f = fixture("starter")
  await addCommercialOrderActivity(f.db, activityInput)
  await markCommercialOrderAttachmentUploaded(f.db, {
    attachmentId: "attachment",
    tenantId: "tenant",
    ...storage,
  })
  await updateServiceEvidenceUpload(f.db, {
    actorUserId: "actor",
    tenantId: "tenant",
    evidenceId: "evidence",
    status: "available",
  })
  f.state.plan = "free"
  if (f.state.attachment)
    f.state.attachment.uploadExpiresAt = new Date("2020-01-01T00:00:00.000Z")
  const readsBefore = f.tenantReads.length
  const writesBefore = [...f.writes]
  expect(
    (
      await readCommercialOrderAttachment(f.db, {
        tenantId: "tenant",
        scope,
        attachmentId: "attachment",
      })
    ).status,
  ).toBe("READY")
  expect(
    (
      await listCommercialOrderActivity(f.db, {
        tenantId: "tenant",
        scope,
        orderId: "order",
      })
    )[0]?.attachments[0]?.status,
  ).toBe("READY")
  expect(
    (await getServiceJob(f.db, { tenantId: "tenant", jobId: "job" }))
      ?.evidence[0]?.uploadStatus,
  ).toBe("AVAILABLE")
  expect(f.tenantReads).toHaveLength(readsBefore)
  expect(f.writes).toEqual(writesBefore)
})

for (const plan of ["starter", "growth", "pro"] as const) {
  test(`${plan} continues to create/copy Order files and capture/upload/publish Service evidence`, async () => {
    const f = fixture(plan)
    await addCommercialOrderActivity(f.db, activityInput)
    expect(
      await markCommercialOrderAttachmentUploaded(f.db, {
        attachmentId: "attachment",
        tenantId: "tenant",
        ...storage,
      }),
    ).toBe(true)
    await captureServiceEvidence(f.db, captureInput)
    await updateServiceEvidenceUpload(f.db, {
      actorUserId: "actor",
      tenantId: "tenant",
      evidenceId: "evidence",
      status: "available",
    })
    expect(
      (
        await publishServiceEvidence(f.db, {
          actorUserId: "actor",
          tenantId: "tenant",
          evidenceId: "evidence",
        })
      ).visibility,
    ).toBe("PUBLISHED")
    expectFreshTenantRead(f.tenantReads, 5)
    const copy = fixture(plan)
    expect(
      (
        await addStoredFileToCommercialOrderInTransaction(copy.tx, {
          ...activityInput,
          source: "assistant",
          file,
          store: copy.store,
        })
      ).attachments[0]?.status,
    ).toBe("READY")
    expect(copy.writes).toContain("bytes.store")
    expectFreshTenantRead(copy.tenantReads)
  })
}
