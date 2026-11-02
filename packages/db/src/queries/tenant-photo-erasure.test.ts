import { describe, expect, test } from "bun:test"
import {
  classifyTenantPhotoErasureObject,
  readTenantPhotoErasurePage,
  tenantPhotoErasureBackoffMs,
} from "./tenant-photo-erasure"

const now = new Date("2026-11-02T12:00:00.000Z")
const digest = "a".repeat(64)
const base = {
  kind: "ORDER_ATTACHMENT" as const,
  sourceId: "source",
  storageProvider: "vercel_blob_private",
  storageStoreId: "store_pinned",
  storagePath: "orders/attachments/t/o/a/x.jpg",
  contentDigest: digest,
  sizeBytes: 4,
  notBefore: now,
}

function tx(rows: Record<string, unknown[]>) {
  const queries: unknown[] = []
  const model = (name: string) => ({
    findMany: async (query: unknown) => {
      queries.push({ name, query })
      return rows[name] ?? []
    },
  })
  return {
    queries,
    client: {
      catalogPhotoAsset: model("catalogPhotoAsset"),
      catalogPhotoDerivative: model("catalogPhotoDerivative"),
      financeExpenseReceiptAsset: model("financeExpenseReceiptAsset"),
      commercialOrderAttachment: model("commercialOrderAttachment"),
      assistantAttachment: model("assistantAttachment"),
      serviceCommerceMediaAsset: model("serviceCommerceMediaAsset"),
      prescriptionMedia: model("prescriptionMedia"),
    } as unknown as Parameters<typeof readTenantPhotoErasurePage>[0],
  }
}

describe("Tenant photo erasure classification", () => {
  test("pinned objects matching the run classification are deletable", () => {
    expect(classifyTenantPhotoErasureObject("LIVE", base)?.holdReason).toBe(
      null,
    )
    expect(
      classifyTenantPhotoErasureObject("QA", {
        ...base,
        storageProvider: "local_test",
        storageStoreId: "store_localtest",
      })?.holdReason,
    ).toBe(null)
  })

  test("missing ownership and cross-classification providers are held, not skipped", () => {
    expect(
      classifyTenantPhotoErasureObject("LIVE", { ...base, storagePath: null })
        ?.holdReason,
    ).toBe("OWNERSHIP_UNKNOWN")
    expect(
      classifyTenantPhotoErasureObject("LIVE", {
        ...base,
        storageStoreId: null,
        storagePath: null,
      })?.holdReason,
    ).toBe("OWNERSHIP_UNKNOWN")
    expect(classifyTenantPhotoErasureObject("QA", base)?.holdReason).toBe(
      "PROVIDER_UNSUPPORTED",
    )
  })

  test("only unpinned, pathless QA metadata is treated as never stored", () => {
    expect(
      classifyTenantPhotoErasureObject("QA", {
        ...base,
        storageStoreId: null,
        storagePath: null,
      }),
    ).toBeNull()
  })

  test("a stated retention always wins over deletion", () => {
    expect(
      classifyTenantPhotoErasureObject("LIVE", {
        ...base,
        retained: "FINANCIAL_EVIDENCE_POLICY_PENDING",
      })?.holdReason,
    ).toBe("FINANCIAL_EVIDENCE_POLICY_PENDING")
  })

  test("backoff grows from five minutes and is capped at six hours", () => {
    expect(tenantPhotoErasureBackoffMs(1)).toBe(300_000)
    expect(tenantPhotoErasureBackoffMs(2)).toBe(600_000)
    expect(tenantPhotoErasureBackoffMs(8)).toBe(6 * 60 * 60_000)
  })
})

describe("Tenant photo erasure inventory pages", () => {
  const read = (
    kind: Parameters<typeof readTenantPhotoErasurePage>[1]["kind"],
    rows: Record<string, unknown[]>,
    classification: "LIVE" | "QA" = "LIVE",
  ) => {
    const fake = tx(rows)
    return readTenantPhotoErasurePage(fake.client, {
      kind,
      tenantId: "tenant",
      classification,
      now,
    }).then((page) => ({ ...page, queries: fake.queries }))
  }

  test("receipts: attached evidence and holds are retained; orphan uploads are deletable", async () => {
    const receipt = {
      storageProvider: "vercel_blob_private",
      storageStoreId: "store_pinned",
      storagePath: "finance/receipts/x.pdf",
      contentDigest: digest,
      sizeBytes: 5,
      uploadLeaseUntil: null,
      retentionHold: false,
      attachedAt: null,
      attachmentState: "UNATTACHED",
    }
    const page = await read("EXPENSE_RECEIPT", {
      financeExpenseReceiptAsset: [
        { ...receipt, id: "orphan" },
        {
          ...receipt,
          id: "attached",
          attachedAt: now,
          attachmentState: "ATTACHED",
        },
        {
          ...receipt,
          id: "withdrawn",
          attachedAt: now,
          attachmentState: "WITHDRAWN",
        },
        { ...receipt, id: "held", retentionHold: true },
      ],
    })
    expect(page.rows.map((row) => [row.sourceId, row.holdReason])).toEqual([
      ["orphan", null],
      ["attached", "FINANCIAL_EVIDENCE_POLICY_PENDING"],
      ["withdrawn", "FINANCIAL_EVIDENCE_POLICY_PENDING"],
      ["held", "RETENTION_HOLD"],
    ])
    expect(page.next).toBe(true)
    expect(page.queries[0]).toMatchObject({
      query: { where: { tenantId: "tenant", bytesDeletedAt: null } },
    })
  })

  test("catalog originals use the canonical pinned path; contradictions are held", async () => {
    const asset = {
      tenantId: "tenant",
      storeId: "store",
      contentDigest: digest,
      contentType: "image/png",
      sizeBytes: 8,
      storageProvider: "vercel_blob_private",
      storageStoreId: "store_pinned",
      storagePath: null,
    }
    const page = await read("CATALOG_ORIGINAL", {
      catalogPhotoAsset: [
        { ...asset, id: "intent" },
        { ...asset, id: "conflict", storagePath: "arbitrary/key" },
        { ...asset, id: "unpinned", storageStoreId: null },
      ],
    })
    expect(page.rows[0]).toMatchObject({
      sourceId: "intent",
      storagePath: `catalog/quarantine/tenant/store/intent/${digest}.png`,
      holdReason: null,
    })
    expect(page.rows[1]?.holdReason).toBe("OWNERSHIP_UNKNOWN")
    expect(page.rows[2]?.holdReason).toBe("OWNERSHIP_UNKNOWN")
  })

  test("pending uploads wait for their upload window plus grace", async () => {
    const uploadExpiresAt = new Date(now.getTime() + 600_000)
    const page = await read("ORDER_ATTACHMENT", {
      commercialOrderAttachment: [{ ...base, id: "pending", uploadExpiresAt }],
    })
    expect(page.rows[0]?.notBefore.getTime()).toBe(
      uploadExpiresAt.getTime() + 180_000,
    )
  })

  test("clinical and unadapted service media are held with their reason", async () => {
    const media = {
      provider: "development",
      objectKey: "media/key",
      contentDigest: digest,
      verifiedSizeBytes: 3,
      retentionClass: "ORDINARY_COMMERCE",
      retentionHoldAt: null,
      lifecycle: "SAFE",
    }
    const service = await read("SERVICE_MEDIA", {
      serviceCommerceMediaAsset: [
        { ...media, id: "ordinary" },
        { ...media, id: "clinical", retentionClass: "CLINICAL_EXTENSION" },
        { ...media, id: "hold", lifecycle: "RETENTION_HOLD" },
      ],
    })
    expect(service.rows.map((row) => row.holdReason)).toEqual([
      "PROVIDER_UNSUPPORTED",
      "CLINICAL_RETENTION",
      "RETENTION_HOLD",
    ])
    const prescription = await read("PRESCRIPTION_MEDIA", {
      prescriptionMedia: [
        { id: "rx", objectKey: "rx/key", sha256: digest, sizeBytes: 3 },
      ],
    })
    expect(prescription.rows[0]?.holdReason).toBe("CLINICAL_RETENTION")
  })

  test("a full page returns its last id as the next cursor", async () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      ...base,
      id: `a${String(index).padStart(3, "0")}`,
      uploadExpiresAt: now,
    }))
    const page = await read("ASSISTANT_ATTACHMENT", {
      assistantAttachment: rows,
    })
    expect(page.next).toBe("a099")
    expect(page.rows).toHaveLength(100)
  })
})
