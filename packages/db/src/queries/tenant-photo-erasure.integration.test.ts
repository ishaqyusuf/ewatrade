import { expect, setDefaultTimeout, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { catalogPhotoStoragePath } from "@ewatrade/catalog/photo-contracts"
import { describeWithServiceCommerceDatabase } from "./acceptance/service-commerce/database"
import {
  assessTenantPhotoErasure,
  claimTenantPhotoErasureObject,
  finishTenantPhotoErasureObject,
  getTenantPhotoErasureStatus,
  startTenantPhotoErasure,
  stepTenantPhotoErasureRun,
} from "./tenant-photo-erasure"

setDefaultTimeout(240_000)
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000)

// Disposable closed QA Tenant; bytes are temporary local files, never a provider.
describeWithServiceCommerceDatabase("Tenant photo erasure run", () => {
  test("inventories, retries, deletes, verifies and certifies a closed Tenant", async () => {
    const { prisma: db } = await import("../client")
    const root = await mkdtemp(join(tmpdir(), "tenant-photo-erasure-"))
    const previous = process.env.TENANT_PHOTO_ERASURE_ENABLED
    process.env.TENANT_PHOTO_ERASURE_ENABLED = "true"
    const owner = await db.user.create({
      data: {
        name: "Erasure owner fixture",
        email: `tenant-erasure-${randomUUID()}@example.invalid`,
      },
    })
    const operator = await db.user.create({
      data: {
        name: "Erasure operator fixture",
        email: `tenant-erasure-op-${randomUUID()}@example.invalid`,
        isPlatformAdmin: true,
      },
    })
    let tenantId: string | undefined
    try {
      const tenant = await db.tenant.create({
        data: {
          slug: `tenant-erasure-${randomUUID()}`,
          name: "Erasure fixture",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          dataClassification: "QA",
          isActive: false,
          users: {
            create: { userId: owner.id, role: "OWNER", status: "REMOVED" },
          },
        },
      })
      tenantId = tenant.id
      const store = await db.store.create({
        data: { tenantId, slug: "main", name: "Main", status: "ACTIVE" },
      })
      const bytes = new Uint8Array([137, 80, 78, 71])
      const digest = createHash("sha256").update(bytes).digest("hex")
      const files: string[] = []
      async function stored(path: string) {
        const file = join(root, path)
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, bytes)
        await writeFile(`${file}.type`, "image/png")
        files.push(file)
      }
      const asset = (key: string, pinned: boolean) =>
        db.catalogPhotoAsset.create({
          data: {
            tenantId: tenant.id,
            storeId: store.id,
            actorUserId: owner.id,
            clientOperationId: `erasure-${key}`,
            payloadHash: digest,
            contentDigest: digest,
            contentType: "image/png",
            sizeBytes: bytes.byteLength,
            state: "APPROVED",
            storageProvider: pinned ? "local_test" : "vercel_blob_private",
            storageStoreId: pinned ? "store_localtest" : null,
            expiresAt: later(60),
          },
        })
      const kept = await asset("pinned", true)
      await asset("never-stored", false)
      const originalPath = catalogPhotoStoragePath({
        assetId: kept.id,
        tenantId,
        storeId: store.id,
        contentDigest: digest,
        contentType: "image/png",
      })
      await db.catalogPhotoAsset.update({
        where: { id: kept.id },
        data: { storagePath: originalPath },
      })
      await stored(originalPath)
      const derivativePath = `catalog/derivatives/${tenantId}/${kept.id}/thumb.webp`
      await db.catalogPhotoDerivative.create({
        data: {
          assetId: kept.id,
          tenantId,
          storeId: store.id,
          sourceDigest: digest,
          processingVersion: "v1",
          variant: "thumb",
          displayDigest: digest,
          storageStoreId: "store_localtest",
          storagePath: derivativePath,
          contentDigest: digest,
          contentType: "image/webp",
          sizeBytes: bytes.byteLength,
          width: 1,
          height: 1,
          dataClassification: "QA",
          writeUntil: new Date(),
          availableAt: new Date(),
        },
      })
      await stored(derivativePath)

      await expect(
        startTenantPhotoErasure(db, {
          tenantId,
          operatorUserId: owner.id,
          authorityReference: "approved-closure-1",
        }),
      ).rejects.toThrow("OPERATOR_REQUIRED")
      const started = await startTenantPhotoErasure(db, {
        tenantId,
        operatorUserId: operator.id,
        authorityReference: "approved-closure-1",
      })
      expect(
        (
          await startTenantPhotoErasure(db, {
            tenantId,
            operatorUserId: operator.id,
            authorityReference: "approved-closure-1",
          })
        ).replay,
      ).toBe(true)
      await expect(
        startTenantPhotoErasure(db, {
          tenantId,
          operatorUserId: operator.id,
          authorityReference: "different-closure",
        }),
      ).rejects.toThrow("AUTHORITY_CONFLICT")
      expect((await assessTenantPhotoErasure(db, tenantId)).blockers).toContain(
        "INCOMPLETE",
      )

      async function drain(at: Date) {
        for (let index = 0; index < 20; index++)
          if (
            !(await stepTenantPhotoErasureRun(db, started.runId, at)).progressed
          )
            return
      }
      await drain(new Date())
      expect(
        (
          await db.tenantPhotoErasureRun.findUniqueOrThrow({
            where: { id: started.runId },
          })
        ).status,
      ).toBe("DELETING")
      // Grace protects in-flight writers.
      expect(await claimTenantPhotoErasureObject(db)).toBeNull()

      // A reactivated Tenant pauses provider work.
      await db.tenant.update({
        where: { id: tenantId },
        data: { isActive: true },
      })
      expect(await claimTenantPhotoErasureObject(db, later(10))).toBeNull()
      await db.tenant.update({
        where: { id: tenantId },
        data: { isActive: false },
      })

      const { createTenantObjectEraser } = await import(
        "@ewatrade/private-media/tenant-object-erasure"
      )
      const { createLocalTestPrivateObjectPort } = await import(
        "@ewatrade/private-media/local-test-object-port"
      )
      const local = createLocalTestPrivateObjectPort<string>({
        rootDir: root,
        environment: { APP_ENV: "development" },
      })
      const erase = createTenantObjectEraser((provider, classification) =>
        provider === "local_test" && classification === "QA" ? local : null,
      )
      const first = await claimTenantPhotoErasureObject(db, later(10))
      if (!first) throw new Error("Expected a due object")
      // Provider failure: bounded retry with backoff, then success.
      expect(
        await finishTenantPhotoErasureObject(
          db,
          first,
          { ok: false, code: "STORAGE_UNAVAILABLE" },
          later(10),
        ),
      ).toEqual({ recorded: true, state: "PENDING" })
      for (const at of [later(30), later(31)]) {
        const claim = await claimTenantPhotoErasureObject(db, at)
        if (!claim) throw new Error("Expected a retry")
        expect(claim.target.dataClassification).toBe("QA")
        const result = await erase(claim.target)
        expect(result).toEqual({ ok: true })
        expect(
          await finishTenantPhotoErasureObject(db, claim, result, at),
        ).toEqual({
          recorded: true,
          state: "DELETED",
        })
      }
      expect(await claimTenantPhotoErasureObject(db, later(60))).toBeNull()
      await drain(later(61))

      const status = await getTenantPhotoErasureStatus(db, {
        tenantId,
        operatorUserId: operator.id,
      })
      expect(status?.status).toBe("COMPLETED")
      expect(status?.objects).toHaveLength(2)
      expect(status?.objects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "CATALOG_DERIVATIVE",
            state: "DELETED",
            count: 1,
          }),
          expect.objectContaining({
            kind: "CATALOG_ORIGINAL",
            state: "DELETED",
            count: 1,
          }),
        ]),
      )
      expect(JSON.stringify(status)).not.toContain(originalPath)
      expect(await assessTenantPhotoErasure(db, tenantId)).toEqual({
        complete: true,
        blockers: [],
      })
      for (const file of files) await expect(stat(file)).rejects.toThrow()
      expect(
        (
          await db.catalogPhotoAsset.findUniqueOrThrow({
            where: { id: kept.id },
          })
        ).bytesDeletedAt,
      ).not.toBeNull()
      expect(
        await db.catalogPhotoDerivative.count({ where: { tenantId } }),
      ).toBe(0)

      // New bytes after certification reopen the gate.
      await asset("late", true)
      expect((await assessTenantPhotoErasure(db, tenantId)).blockers).toContain(
        "BYTES_REMAIN",
      )
    } finally {
      if (previous === undefined)
        Reflect.deleteProperty(process.env, "TENANT_PHOTO_ERASURE_ENABLED")
      else process.env.TENANT_PHOTO_ERASURE_ENABLED = previous
      if (tenantId) {
        const runs = await db.tenantPhotoErasureRun.findMany({
          where: { tenantId },
          select: { id: true },
        })
        await db.tenantPhotoErasureObject.deleteMany({
          where: { runId: { in: runs.map((run) => run.id) } },
        })
        await db.tenantPhotoErasureRun.deleteMany({ where: { tenantId } })
        await db.catalogPhotoDerivative.deleteMany({ where: { tenantId } })
        await db.catalogPhotoAsset.deleteMany({ where: { tenantId } })
        await db.store.deleteMany({ where: { tenantId } })
        await db.membership.deleteMany({ where: { tenantId } })
        await db.tenant.delete({ where: { id: tenantId } })
      }
      await db.user.deleteMany({
        where: { id: { in: [owner.id, operator.id] } },
      })
      await rm(root, { recursive: true, force: true })
    }
  })
})
