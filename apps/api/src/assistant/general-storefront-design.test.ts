import { afterAll, beforeAll, expect, test } from "bun:test"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import {
  generalActionSchema,
  generalReceiptSchema,
} from "@ewatrade/assistant/general/contracts"
import { siteContentHash } from "@ewatrade/db/queries"
import {
  catalogV4Manifest,
  defaultComposition,
  retailEditorialManifest,
  serviceDeskManifest,
} from "@ewatrade/storefront-templates"
import type { GeneralTransactionContext } from "./general-actions"
import { createStorefrontDesignAdapters } from "./general-storefront-design"

const savedKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
    "offline-storefront-approval-key-000000000"
})
afterAll(() => {
  if (savedKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = savedKey
})
const generate = generalActionSchema.parse({
  action: "storefront_design_generate",
  expectedSiteId: "site1",
  expectedRevision: 14,
  desiredJourney: "browse",
  refinement: "Larger pictures",
})
const accept = generalActionSchema.parse({
  action: "storefront_design_accept",
  expectedSiteId: "site1",
  expectedRevision: 14,
  runId: "run1",
  directionId: "02",
})
if (
  generate.action !== "storefront_design_generate" ||
  accept.action !== "storefront_design_accept"
)
  throw new Error("Invalid test actions")
function harness() {
  const composition = defaultComposition(catalogV4Manifest)
  const site = {
    siteId: "site1",
    storeId: "store1",
    status: "PUBLISHED" as const,
    activeReleaseId: "live11",
    draft: {
      revision: 14,
      composition,
      updatedAt: new Date(),
      updatedById: "owner1",
    },
  }
  const output = {
    baseRevision: 14,
    directions: [
      catalogV4Manifest,
      retailEditorialManifest,
      serviceDeskManifest,
    ].map((manifest, i) => ({
      id: ["01", "02", "03"][i],
      composition: defaultComposition(manifest),
      rationale: ["collection-first"],
      missingAssets: [],
      sourceReferences: [],
    })),
  }
  const run = {
    id: "run1",
    status: "READY" as const,
    baseDraftRevision: 14,
    output,
    outputHash: siteContentHash(output),
    acceptedAt: null as Date | null,
  }
  const calls: Array<{ kind: string; input: unknown }> = []
  // Only the General scope projection and transaction identity are used; canonical commands are injected.
  const ctx = {
    db: {},
    session: { user: { id: "owner1" } },
    tenantContext: {
      tenant: { id: "tenant1", dataClassification: "LIVE" },
      membership: { role: "OWNER" },
      activeStore: { id: "store1" },
      staffAccess: { status: "ACTIVE", mode: "LEGACY" },
    },
  } as unknown as GeneralTransactionContext
  const adapters = createStorefrontDesignAdapters({
    read: async () => site,
    run: (async () => run) as NonNullable<
      Parameters<typeof createStorefrontDesignAdapters>[0]
    >["run"],
    generate: async (tx, actor, input) => {
      expect(tx).toBe(ctx.db)
      expect(actor).toEqual({ tenantId: "tenant1", actorUserId: "owner1" })
      calls.push({ kind: "generate", input })
      return {
        replayed: false,
        run: {
          id: "queued1",
          status: "QUEUED",
          baseRevision: 14,
          createdAt: new Date(),
          completedAt: null,
          errorCode: null,
          needsReconciliation: false,
          output: null,
          acceptedDirectionId: null,
          acceptedDraftRevision: null,
        },
      }
    },
    accept: async (tx, actor, input) => {
      expect(tx).toBe(ctx.db)
      expect(actor.actorUserId).toBe("owner1")
      calls.push({ kind: "accept", input })
      return {
        ok: true,
        replayed: false,
        acceptedRevision: 15,
        ...site,
        draft: { ...site.draft, revision: 15 },
      }
    },
  })
  return { adapters, ctx, site, run, calls }
}

test("Storefront assistant actions have a dashboard Owner/Admin ceiling and strict finite input", () => {
  const capabilities = capabilityManifest.filter((entry) =>
    entry.id.startsWith("storefront.design."),
  )
  expect(capabilities).toHaveLength(3)
  for (const capability of capabilities) {
    expect(capability.clients).toEqual(["dashboard"])
    expect(capability.policy.roles).toEqual(["OWNER", "ADMIN"])
    expect(
      capability.procedures.some((path) => path === "storefront.publish"),
    ).toBe(false)
  }
  for (const extra of [
    { tenantId: "another" },
    { provider: "OPENAI" },
    { publicBrowsingConsent: true },
  ])
    expect(
      generalActionSchema.safeParse({ ...generate, ...extra }).success,
    ).toBe(false)
  expect(
    generalActionSchema.safeParse({ ...accept, directionId: "04" }).success,
  ).toBe(false)
})

test("review stages no effect, execution uses the canonical command in the existing approval transaction", async () => {
  const h = harness()
  const review = await h.adapters.accept.review?.(h.ctx, accept)
  expect(review?.lines.join(" ")).toContain("Quiet editorial")
  expect(review?.lines.join(" ")).toContain("Live content stays unchanged")
  expect(h.calls).toHaveLength(0)
  const generation = await h.adapters.generate.execute(
    h.ctx,
    generate,
    "approval-key-123",
  )
  expect(generalReceiptSchema.parse(generation).kind).toBe(
    "storefront_design_run",
  )
  expect(h.calls[0]?.input).toEqual({
    expectedSiteId: "site1",
    expectedDraftRevision: 14,
    desiredJourney: "browse",
    refinement: "Larger pictures",
    clientRequestId: "approval-key-123",
  })
  const result = await h.adapters.accept.execute(
    h.ctx,
    accept,
    "approval-accept-123",
  )
  expect(generalReceiptSchema.parse(result).kind).toBe(
    "storefront_design_draft",
  )
  expect(h.calls[1]?.input).toEqual({
    expectedSiteId: "site1",
    expectedRevision: 14,
    runId: "run1",
    directionId: "02",
  })
  expect(h.site.activeReleaseId).toBe("live11")
})

test("changed Store, draft, output and used set are refused before a command can execute", async () => {
  const h = harness()
  const original = await h.adapters.accept.validate(h.ctx, accept, false)
  h.run.output.directions[1].composition.theme.accent = "#ff0000"
  h.run.outputHash = siteContentHash(h.run.output)
  const changed = await h.adapters.accept.validate(h.ctx, accept, false)
  expect(changed?.revision).not.toBe(original?.revision)
  h.site.storeId = "other"
  await expect(
    h.adapters.generate.validate(h.ctx, generate, false),
  ).rejects.toThrow("Store")
  h.site.storeId = "store1"
  h.site.draft.revision = 15
  await expect(h.adapters.accept.validate(h.ctx, accept, true)).rejects.toThrow(
    "changed",
  )
  h.site.draft.revision = 14
  h.run.acceptedAt = new Date()
  await expect(h.adapters.accept.validate(h.ctx, accept, true)).rejects.toThrow(
    "already accepted",
  )
  h.run.acceptedAt = null
  h.run.outputHash = "invalid"
  await expect(h.adapters.accept.validate(h.ctx, accept, true)).rejects.toThrow(
    "unavailable",
  )
  expect(h.calls).toHaveLength(0)
})
