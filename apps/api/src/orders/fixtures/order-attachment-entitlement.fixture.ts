import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { createHash } from "node:crypto"
import { OpenAPIHono } from "@hono/zod-openapi"
import { TRPCError } from "@trpc/server"
import { assertAttachmentEntitlement } from "../../../../../packages/db/src/queries/attachment-entitlement"
import { CatalogError } from "../../../../../packages/db/src/queries/catalog-errors"
import {
  markCommercialOrderAttachmentUploaded,
  readCommercialOrderAttachment,
} from "../../../../../packages/db/src/queries/commercial-order-activity"
import { RetailOpsSubscriptionError } from "../../../../../packages/db/src/queries/retail-ops-subscriptions"

// Actual HTTP registration, fresh entitlement, scoped attachment lookup/mark and
// verified byte reader. Native auth/session resolution and storage ports are
// inert. Isolated process prevents module stand-ins affecting adjacent suites.
const verified = {
  ...(await import("@ewatrade/private-media/verified-upload")),
}
const attachments = {
  ...(await import("@ewatrade/private-media/order-attachments")),
}
const videos = { ...(await import("@ewatrade/private-media/order-videos")) }
const bytes = new TextEncoder().encode("%PDF-1.7\nprivate entitlement fixture")
const calls: string[] = []
const lookups: unknown[] = []
let freshPlan = "free"
let rowStatus = "PENDING_UPLOAD"
let kind = "DOCUMENT"
let visible = true
let expired = false
let planReadFailure: Error | undefined
let admissionFailure: Error | undefined
let role = "OWNER"
let downgradeOnStage = false
let marked = 0
let networkCalls = 0
const originalFetch = globalThis.fetch
const scope = { tenantId: "tenant-a", storeId: "store-a" }
const db = {
  tenant: {
    findUniqueOrThrow: async (input: unknown) => {
      calls.push("fresh-plan")
      lookups.push(input)
      if (planReadFailure) throw planReadFailure
      return {
        metadata: { retailOps: { subscription: { planId: "pro" } } },
        subscription: { plan: { key: freshPlan } },
      }
    },
  },
  commercialOrderAttachment: {
    findFirst: async (input: unknown) => {
      calls.push("attachment-read")
      lookups.push(input)
      return visible
        ? {
            id: "attachment-a",
            tenantId: "tenant-a",
            orderId: "order-a",
            status: rowStatus,
            kind,
            contentType: kind === "VIDEO" ? "video/mp4" : "application/pdf",
            contentDigest: createHash("sha256").update(bytes).digest("hex"),
            sizeBytes: bytes.byteLength,
            storagePath: rowStatus === "READY" ? "inert-private-path" : null,
            uploadExpiresAt: new Date(
              Date.now() + (expired ? -60_000 : 60_000),
            ),
          }
        : null
    },
    updateMany: async () => {
      calls.push("mark-ready")
      marked++
      return { count: 1 }
    },
  },
}
const context = () => ({
  db,
  session: { user: { id: "owner-a" } },
  tenantContext: {
    // Deliberately stale: the HTTP boundary must reread the durable plan.
    tenant: {
      id: "tenant-a",
      dataClassification: "QA",
      metadata: { retailOps: { subscription: { planId: "pro" } } },
    },
    membership: { role },
  },
})
mock.module("@ewatrade/db/queries", () => ({
  CatalogError,
  RetailOpsSubscriptionError,
  assertAttachmentEntitlement,
  markCommercialOrderAttachmentUploaded,
  readCommercialOrderAttachment,
}))
const api = new URL("../../", import.meta.url)
mock.module(new URL("trpc/init.ts", api).pathname, () => ({
  createTRPCContext: async () => {
    calls.push("create-context")
    return context()
  },
  resolveProtectedTenantContext: async (value: unknown) => {
    calls.push("authorize-context")
    if (admissionFailure) throw admissionFailure
    return value
  },
}))
mock.module(new URL("trpc/order-scope.ts", api).pathname, () => ({
  orderScope: async () => {
    calls.push("order-scope")
    return scope
  },
}))
mock.module(new URL("trpc/routers/orders.ts", api).pathname, () => ({
  assertCanOperateOrders: (value: string) => {
    calls.push("role-check")
    if (value === "DENIED")
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Order access denied.",
      })
  },
}))
mock.module("@ewatrade/private-media/verified-upload", () => ({
  ...verified,
  readVerifiedUpload: async (
    ...args: Parameters<typeof verified.readVerifiedUpload>
  ) => {
    calls.push("read-upload-bytes")
    return verified.readVerifiedUpload(...args)
  },
}))
mock.module("@ewatrade/private-media/order-attachments", () => ({
  ...attachments,
  createOrderAttachmentStorage: () => {
    calls.push("attachment-storage")
    return {
      provider: "inert",
      storeId: null,
      stage: async (input: { bytes: Uint8Array }) => {
        calls.push("stage-bytes")
        expect(input.bytes).toEqual(bytes)
        if (downgradeOnStage) freshPlan = "free"
        return { storagePath: "inert-private-path" }
      },
      read: async () => {
        calls.push("read-historical-bytes")
        return bytes
      },
    }
  },
}))
mock.module("@ewatrade/private-media/order-videos", () => ({
  ...videos,
  createOrderVideoStorage: () => {
    calls.push("video-storage")
    return {
      mode: "api",
      provider: "inert",
      storeId: null,
      write: async () => {
        calls.push("video-write")
        return { storagePath: "inert-video-path" }
      },
      open: async () => {
        calls.push("open-historical-video")
        return {
          status: 200,
          body: new Response(bytes).body,
          contentLength: bytes.byteLength,
          contentRange: null,
        }
      },
    }
  },
}))
const { registerOrderAttachmentRoutes } = await import(
  "../order-attachment-routes"
)

beforeEach(() => {
  calls.length = lookups.length = 0
  freshPlan = "free"
  rowStatus = "PENDING_UPLOAD"
  kind = "DOCUMENT"
  visible = true
  expired = false
  planReadFailure = admissionFailure = undefined
  role = "OWNER"
  downgradeOnStage = false
  marked = 0
  networkCalls = 0
  globalThis.fetch = Object.assign(
    async () => {
      networkCalls++
      throw Error("No network or provider calls are permitted")
    },
    { preconnect: originalFetch.preconnect },
  )
})
afterEach(() => {
  expect(networkCalls).toBe(0)
  globalThis.fetch = originalFetch
})
function server() {
  const app = new OpenAPIHono()
  app.onError(() => new Response("Unexpected failure", { status: 500 }))
  registerOrderAttachmentRoutes(app)
  return app
}
function upload() {
  let pulls = 0
  let cancellations = 0
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++
        controller.enqueue(bytes)
        controller.close()
      },
      cancel() {
        cancellations++
      },
    },
    { highWaterMark: 0 },
  )
  const request = new Request(
    "http://localhost/api/orders/attachments/attachment-a/upload",
    {
      method: "PUT",
      body,
      headers: {
        "content-type": kind === "VIDEO" ? "video/mp4" : "application/pdf",
        "content-length": String(bytes.byteLength),
      },
    },
  )
  return { request, pulls: () => pulls, cancellations: () => cancellations }
}
function noUploadEffects() {
  expect(calls).not.toContain("read-upload-bytes")
  expect(calls).not.toContain("attachment-storage")
  expect(calls).not.toContain("stage-bytes")
  expect(calls).not.toContain("video-storage")
  expect(calls).not.toContain("video-write")
  expect(calls).not.toContain("mark-ready")
  expect(marked).toBe(0)
}

for (const attachmentKind of ["DOCUMENT", "IMAGE", "VIDEO"]) {
  test(`fresh Free denies pending ${attachmentKind} PUT despite stale paid context before consuming bytes`, async () => {
    kind = attachmentKind
    const input = upload()
    const response = await server().fetch(input.request)
    expect(response.status).toBe(403)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(await response.json()).toEqual({
      code: "PLAN_UPGRADE_REQUIRED",
      error: "Upgrade from Free to attach photos, videos and documents.",
    })
    expect(calls).toEqual([
      "create-context",
      "authorize-context",
      "role-check",
      "order-scope",
      "attachment-read",
      "fresh-plan",
    ])
    expect(lookups).toEqual([
      { where: { id: "attachment-a", order: scope, tenantId: "tenant-a" } },
      {
        where: { id: "tenant-a" },
        select: {
          metadata: true,
          subscription: { select: { plan: { select: { key: true } } } },
        },
      },
    ])
    expect(input.pulls()).toBe(0)
    expect(input.cancellations()).toBe(1)
    noUploadEffects()
  })
}

test("fresh paid PUT verifies actual bytes only after entitlement and rechecks before READY", async () => {
  freshPlan = "starter"
  const input = upload()
  const response = await server().fetch(input.request)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    attachmentId: "attachment-a",
    status: "READY",
  })
  expect(calls.indexOf("fresh-plan")).toBeLessThan(
    calls.indexOf("read-upload-bytes"),
  )
  expect(calls.indexOf("read-upload-bytes")).toBeLessThan(
    calls.indexOf("stage-bytes"),
  )
  expect(calls.filter((call) => call === "fresh-plan")).toHaveLength(2)
  expect(input.pulls()).toBe(1)
  expect(marked).toBe(1)
})

test("a downgrade after staging still refuses the READY mutation", async () => {
  freshPlan = "starter"
  downgradeOnStage = true
  const input = upload()
  const response = await server().fetch(input.request)
  expect(response.status).toBe(403)
  expect((await response.json()).code).toBe("PLAN_UPGRADE_REQUIRED")
  expect(calls).toContain("stage-bytes")
  expect(marked).toBe(0)
  expect(calls.filter((call) => call === "fresh-plan")).toHaveLength(2)
})

for (const denial of ["revoked", "role", "scope"]) {
  test(`${denial} access remains denied before entitlement, body or storage`, async () => {
    if (denial === "revoked")
      admissionFailure = new TRPCError({
        code: "FORBIDDEN",
        message: "Session access revoked.",
      })
    if (denial === "role") role = "DENIED"
    if (denial === "scope") visible = false
    const input = upload()
    const response = await server().fetch(input.request)
    expect(response.status).toBe(denial === "scope" ? 404 : 403)
    expect((await response.json()).code).toBe(
      denial === "scope" ? "ORDER_NOT_FOUND" : "FORBIDDEN",
    )
    expect(calls).not.toContain("fresh-plan")
    expect(input.pulls()).toBe(0)
    noUploadEffects()
  })
}

test("unknown fresh entitlement never falls back to the stale paid snapshot", async () => {
  planReadFailure = new Error("Inert fresh lookup failure")
  const input = upload()
  const response = await server().fetch(input.request)
  expect(response.status).toBe(500)
  expect(input.pulls()).toBe(0)
  noUploadEffects()
})

test("authorized READY PUT acknowledgement remains available on Free without rereading bytes", async () => {
  rowStatus = "READY"
  const input = upload()
  const response = await server().fetch(input.request)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    attachmentId: "attachment-a",
    status: "READY",
  })
  expect(calls).not.toContain("fresh-plan")
  expect(input.pulls()).toBe(0)
  expect(input.cancellations()).toBe(1)
  noUploadEffects()
})

for (const attachmentKind of ["DOCUMENT", "VIDEO"]) {
  test(`authorized historical ${attachmentKind} GET remains viewable on Free`, async () => {
    rowStatus = "READY"
    kind = attachmentKind
    const response = await server().request(
      "/api/orders/attachments/attachment-a/content",
    )
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(calls).not.toContain("fresh-plan")
    expect(calls).toContain(
      kind === "VIDEO" ? "open-historical-video" : "read-historical-bytes",
    )
    expect(marked).toBe(0)
  })
}

test("Free historical GET remains scoped and cannot reveal another Order's file", async () => {
  visible = false
  rowStatus = "READY"
  const response = await server().request(
    "/api/orders/attachments/attachment-a/content",
  )
  expect(response.status).toBe(404)
  expect(calls).not.toContain("read-historical-bytes")
  expect(calls).not.toContain("video-storage")
})
