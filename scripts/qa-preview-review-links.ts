/** Bounded Preview-only review-link acceptance. No provider, OTP or phone operations. */
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { chmod, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  generalActionSchema,
  generalProposalSchema,
} from "@ewatrade/assistant/general/contracts"
import superjson from "superjson"
import { z } from "zod"
import {
  applyDatabaseProfile,
  databaseTargetsEqual,
  loadProductionDatabaseUrl,
} from "./database-profile.mjs"
import { loadRootEnvironment } from "./environment-profile.mjs"

type Actor = {
  userId: string
  tenantId: string
  storeId: string
  membershipId: string
  sessionId: string
}
type Input = { actor: Actor; marker?: string; otherStoreId?: string }
type Prepared = {
  marker: string
  targetRef: string
  actor: Actor
  otherStoreId?: string
  bindingId: string
  conversationId: string
  phoneNumberId: string
  senderId: string
  cases: Array<{
    name: string
    proposalId: string
    inboxId: string
    token: string
    href: string
  }>
  expiredToken: string
  refreshedFromProposalId?: string
  expiredApprovalFixtures?: Array<{
    proposalId: string
    inboxId: string
    runId: string | null
    revision: number
    status: string
    reason: string
  }>
  priorCancellation?: {
    http: number
    status: string
    proposalId: string
    error: null
  }
  recoveryVersion?: 2
  excludedFixtures?: Array<{
    inboxId: string
    proposalId: string
    runId: string
    status: string
    reason: string
    outboxId: string
  }>
  preparationIntent?: string
  preparationSources?: Array<{
    name: string
    inboxId: string
    proposalId: string
    lease: {
      inboxId: string
      bindingId: string
      owner: string
      generation: number
    }
  }>
  readCheckpoint?: { phase: "before_edit"; results: Record<string, unknown> }
  reviewCheckpoint?: {
    phase: "after_edit"
    token: string
    revision: number
    results: Record<string, unknown>
  }
}
const root = resolve(import.meta.dir, "..")
const args = process.argv.slice(2)
const phase = args[0]
const path = args[1] ? resolve(args[1]) : ""
const output = args[2] ? resolve(args[2]) : ""
const pauseAfterEdit = args.includes("--pause-after-edit")
assert(!pauseAfterEdit || phase === "run", "Pause applies only to run")
assert(
  [
    "prepare",
    "resume-prepare",
    "refresh-approval",
    "run",
    "finish",
    "inspect",
  ].includes(phase ?? ""),
  "Choose prepare|resume-prepare|refresh-approval|run|finish|inspect",
)
assert(path && output, "Provide input and output paths")
assert(
  process.env.APP_ENV === "preview" &&
    process.env.DEV_PROFILE === "preview" &&
    process.env.DATABASE_PROFILE_VERIFIED === "1",
  "Explicit verified Preview profile required",
)
const selected = loadRootEnvironment(root, {
  APP_ENV: "preview",
  DEV_PROFILE: "preview",
  NODE_ENV: "production",
}).env
const prod = loadProductionDatabaseUrl(root)
const safe = applyDatabaseProfile(
  { ...selected, ...process.env, APP_ENV: "preview", DEV_PROFILE: "preview" },
  prod,
)
assert(
  safe.EWATRADE_DATABASE_URL &&
    selected.EWATRADE_DATABASE_URL &&
    !databaseTargetsEqual(safe.EWATRADE_DATABASE_URL, prod),
  "Production target forbidden",
)
assert(
  databaseTargetsEqual(
    safe.EWATRADE_DATABASE_URL,
    selected.EWATRADE_DATABASE_URL,
  ),
  "Only selected Preview database allowed",
)
assert(
  new URL(safe.EWATRADE_DATABASE_URL).hostname.endsWith(".neon.tech"),
  "Explicit Neon Preview required",
)
const apiOrigin = "https://preview-api.ewatrade.com"
const dashboardOrigin = "https://preview-dashboard.ewatrade.com"
assert(
  process.env.API_URL === apiOrigin &&
    process.env.DASHBOARD_URL === dashboardOrigin,
  "Exact paired Preview origins required",
)
assert(
  process.env.ASSISTANT_WHATSAPP_ENABLED === "true",
  "Preview assistant pilot must be configured before acceptance",
)
const targetRef = createHash("sha256")
  .update(new URL(safe.EWATRADE_DATABASE_URL).hostname)
  .update(new URL(safe.EWATRADE_DATABASE_URL).pathname)
  .digest("hex")
  .slice(0, 16)
const { PrismaClient } = await import("../packages/db/src/index")
const { PrismaPg } = await import("@prisma/adapter-pg")
const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: safe.EWATRADE_DATABASE_URL,
    max: 2,
  }),
  transactionOptions: { maxWait: 10_000, timeout: 30_000 },
})
const checks: Record<string, unknown> = {}
const rpcResult = z
  .object({
    status: z.string().optional(),
    proposal: generalProposalSchema.optional(),
    token: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough()
// Protected browser scope resolution rejects missing identity, forbidden scope,
// or an inaccessible Store with these codes; server/transport errors prove nothing.
const protectedScopeDenials = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
])
function assertReviewDenied(
  response: z.infer<typeof rpcResult>,
  status: "unavailable" | "scope_mismatch",
) {
  assert(
    response.status === status ||
      (response.error !== undefined &&
        protectedScopeDenials.has(response.error)),
    `Expected ${status} or a protected identity/scope denial`,
  )
  assert.equal(response.proposal, undefined, "Denied review leaked a proposal")
}
async function save(value: unknown) {
  await writeFile(output, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  })
  await chmod(output, 0o600)
}
async function verifyActor(actor: Actor) {
  const [tenant, session] = await Promise.all([
    db.tenant.findFirst({
      where: {
        id: actor.tenantId,
        dataClassification: "QA",
        qaPurgeStartedAt: null,
      },
      select: { id: true, slug: true, dataClassification: true },
    }),
    db.session.findFirst({
      where: {
        id: actor.sessionId,
        userId: actor.userId,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    }),
  ])
  assert(
    tenant?.dataClassification === "QA" && session,
    "Only existing QA tenant and current real Session allowed",
  )
  const { getActiveTenantForUser } = await import(
    "../packages/db/src/queries/tenants"
  )
  const context = await getActiveTenantForUser(db, {
    userId: actor.userId,
    tenantSlug: tenant.slug,
    storeId: actor.storeId,
  })
  assert(
    context?.tenant.id === actor.tenantId &&
      context.membership.id === actor.membershipId &&
      context.activeStore?.id === actor.storeId,
    "Exact current QA actor scope required",
  )
  return context
}
async function inspect(prepared: Prepared) {
  assert(prepared.targetRef === targetRef, "Fixture target changed")
  await verifyActor(prepared.actor)
  const ids = prepared.cases.map((c) => c.proposalId)
  const proposals = await db.assistantActionProposal.findMany({
    where: {
      id: { in: ids },
      tenantId: prepared.actor.tenantId,
      actorUserId: prepared.actor.userId,
    },
    select: {
      id: true,
      status: true,
      revision: true,
      executedResult: true,
      payload: true,
    },
  })
  assert(proposals.length === ids.length, "Exact proposals unavailable")
  const outboxes = await db.assistantWhatsAppOutbox.findMany({
    where: { inbox: { bindingId: prepared.bindingId } },
    select: {
      id: true,
      inboxId: true,
      renderKind: true,
      responseRevision: true,
      state: true,
      errorCode: true,
      createdAt: true,
    },
  })
  const attempts = await db.assistantWhatsAppAttempt.count({
    where: { outbox: { inbox: { bindingId: prepared.bindingId } } },
  })
  assert(
    attempts === 0,
    "QA live-provider fence failed: delivery attempt exists",
  )
  checks.zeroProviderAttempts = true
  const products = await db.catalogItem.findMany({
    where: {
      tenantId: prepared.actor.tenantId,
      name: { startsWith: prepared.marker },
    },
    select: { id: true, name: true },
  })
  return { proposals, outboxes, products, providerAttempts: attempts }
}
try {
  if (
    phase === "prepare" ||
    phase === "resume-prepare" ||
    phase === "refresh-approval"
  ) {
    const input = JSON.parse(await readFile(path, "utf8")) as Input
    const actor = input.actor
    await verifyActor(actor)
    const marker = input.marker ?? `review-preview-${randomUUID()}`
    assert(
      /^review-preview-[a-zA-Z0-9-]+$/.test(marker),
      "Scoped marker required",
    )
    const phoneNumberId = process.env.WHATSAPP_OTP_PHONE_NUMBER_ID ?? ""
    assert(
      /^\d+$/.test(phoneNumberId),
      "Existing Preview platform identity required",
    )
    // IANA/NANP fictional range. QA provider policy blocks it before attempt creation.
    const senderId = "12025550123"
    const channel = await import(
      "../packages/db/src/queries/assistant-whatsapp"
    )
    const { startGeneralConversation } = await import(
      "../packages/db/src/queries/assistant-general"
    )
    const { appendAssistantMessage } = await import(
      "../packages/db/src/queries/assistant"
    )
    const {
      createLinkedAssistantContext,
      lockLinkedAssistantIdentity,
      isLinkedAssistantIdentity,
    } = await import("../apps/api/src/assistant/channel-principal")
    const { draftGeneralProposal, decideGeneralProposal } = await import(
      "../apps/api/src/assistant/general-proposals"
    )
    const { generalProposalReferencePart } = await import(
      "../apps/api/src/assistant/general-persistence"
    )
    const { proposalDigest } = await import(
      "../apps/api/src/assistant/proposal-security"
    )
    const { prepareAssistantWhatsAppWebReview } = await import(
      "../apps/api/src/assistant/channel-web-review-staging"
    )
    let prepared: Prepared
    let principal: Awaited<
      ReturnType<typeof channel.selectAssistantWhatsAppConversation>
    >
    if (phase !== "prepare") {
      prepared = JSON.parse(await readFile(path, "utf8")) as Prepared
      assert(
        prepared.targetRef === targetRef && prepared.marker === marker,
        "Exact selected Preview checkpoint required",
      )
      assert(
        actor.userId === "f2rb8LHk5y2RlubYkx6YyiVo8lV0NcWs" &&
          actor.tenantId === "cmuv4c0450001z49kd8k5o0s1" &&
          actor.storeId === "cmuv4c0mm0005z49kdycddipr",
        "Exact existing approved QA actor required",
      )
      assert(
        prepared.senderId === senderId &&
          prepared.phoneNumberId === phoneNumberId,
        "Original synthetic platform identity required",
      )
      assert(
        !prepared.preparationIntent,
        "A prior mutation has uncertain completion; reconcile checkpoint before resuming",
      )
      const binding = await db.assistantWhatsAppBinding.findFirstOrThrow({
        where: {
          id: prepared.bindingId,
          conversationId: prepared.conversationId,
        },
        include: { identity: true },
      })
      assert(
        binding.identity.userId === actor.userId &&
          binding.identity.phoneNumberId === phoneNumberId &&
          binding.identity.senderId === senderId &&
          binding.purpose === "GENERAL",
        "Exact current binding owner required",
      )
      principal = {
        kind: "linked_whatsapp",
        phoneNumberId,
        senderId,
        bindingId: binding.id,
        grantId: binding.grantId,
        identityGeneration: binding.identityGeneration,
        grantGeneration: binding.grantGeneration,
        selectionGeneration: binding.selectionGeneration,
      }
      // Canonical read revalidates the existing binding; never relink or alter its source kind.
      await createLinkedAssistantContext(
        db,
        principal,
        "preview-review-recovery",
      )
      if (!prepared.recoveryVersion) {
        assert(
          prepared.cases.length === 0,
          "Only the original empty partial checkpoint can enter recovery",
        )
        const original = await db.assistantWhatsAppInbox.findFirstOrThrow({
          where: {
            bindingId: binding.id,
            providerMessageId: `${marker}-approve-edit`,
          },
          include: { run: true },
        })
        assert(
          original.kind === "ACTION" &&
            original.run?.conversationId === prepared.conversationId &&
            original.run.actorUserId === actor.userId,
          "Exact excluded original source required",
        )
        const rows = await db.assistantActionProposal.findMany({
          where: {
            conversationId: prepared.conversationId,
            actorUserId: actor.userId,
            tenantId: actor.tenantId,
          },
          take: 2,
        })
        assert(
          rows.length === 1 &&
            rows[0]?.payload &&
            (rows[0].payload as { name?: string }).name ===
              `${marker} Eggs approve-edit`,
          "Exactly one original owned draft required",
        )
        const row = rows[0]
        const status = row.status
        assert(
          status !== "COMPLETED",
          "Original excluded fixture unexpectedly committed; reconcile",
        )
        const content = z
          .object({ type: z.literal("invalid_action") })
          .strict()
          .safeParse(original.content)
        assert(
          content.success || original.state === "COMPLETED",
          "Only exact original malformed-action refusal may settle",
        )
        let refusalOutboxId: string | undefined
        if (["PENDING", "PROCESSING"].includes(original.state)) {
          const reclaimed = await channel.claimAssistantWhatsAppInbox(
            db,
            original.id,
            [actor.userId],
          )
          assert(
            reclaimed.kind === "claimed",
            "Original ACTION lease must expire before canonical refusal recovery",
          )
          if (reclaimed.kind !== "claimed") throw Error("ORIGINAL_ACTION_BUSY")
          const originalContext = await createLinkedAssistantContext(
            db,
            principal,
            original.requestId,
            reclaimed.lease,
          )
          const { processAssistantWhatsAppAction } = await import(
            "../apps/api/src/assistant/channel-action-turn"
          )
          const refused = await processAssistantWhatsAppAction(
            originalContext,
            reclaimed.lease,
          )
          assert(
            refused.status === "completed",
            "Original malformed ACTION must settle canonically before new turns",
          )
          if (refused.status === "completed") refusalOutboxId = refused.outboxId
        }
        if (!refusalOutboxId) {
          const refusal = await db.assistantWhatsAppOutbox.findFirstOrThrow({
            where: { inboxId: original.id, renderKind: "action_result" },
            select: { id: true },
          })
          refusalOutboxId = refusal.id
        }
        prepared.excludedFixtures = [
          {
            inboxId: original.id,
            proposalId: row.id,
            runId: original.run.id,
            status,
            outboxId: refusalOutboxId,
            reason:
              "invalid_action: original proof-like fixture input excluded; canonical ACTION refusal only, no product execution",
          },
        ]
        prepared.recoveryVersion = 2
        await save({ ...prepared, checkpoint: "original_action_excluded" })
      }
    } else {
      const link = await channel.createAssistantWhatsAppLink(
        db,
        actor,
        phoneNumberId,
      )
      await save({
        checkpoint: "canonical_link_created",
        marker,
        targetRef,
        actor,
        linkId: link.id,
      })
      assert(
        await channel.claimAssistantWhatsAppLink(db, {
          code: link.code,
          phoneNumberId,
          senderId,
          messageId: `${marker}-claim`,
        }),
        "Canonical link claim failed",
      )
      const grant = await channel.confirmAssistantWhatsAppLink(db, actor, {
        linkId: link.id,
        expectedRevision: 2,
        phoneNumberId,
      })
      const linkedIdentity =
        await db.assistantWhatsAppIdentity.findUniqueOrThrow({
          where: { phoneNumberId_senderId: { phoneNumberId, senderId } },
          select: { userId: true, generation: true },
        })
      assert.equal(
        linkedIdentity.userId,
        actor.userId,
        "Exact canonical QA identity required",
      )
      const chat = await startGeneralConversation(db, {
        userId: actor.userId,
        tenantId: actor.tenantId,
        storeId: actor.storeId,
      })
      principal = await channel.selectAssistantWhatsAppConversation(
        db,
        {
          kind: "linked_whatsapp",
          phoneNumberId,
          senderId,
          grantId: grant.id,
          grantGeneration: grant.generation,
          identityGeneration: linkedIdentity.generation,
        },
        chat.id,
      )
      prepared = {
        marker,
        targetRef,
        actor,
        otherStoreId: input.otherStoreId,
        bindingId: principal.bindingId,
        conversationId: chat.id,
        phoneNumberId,
        senderId,
        cases: [],
        expiredToken: "",
        recoveryVersion: 2,
      }
      await save({ ...prepared, checkpoint: "canonical_binding_selected" })
    }
    const { bindingId, conversationId } = prepared
    assert(
      bindingId === principal.bindingId,
      "Exact checkpoint binding required",
    )
    let refreshedPayload:
      | ReturnType<typeof generalActionSchema.parse>
      | undefined
    if (phase === "refresh-approval") {
      assert(
        !prepared.refreshedFromProposalId,
        "A refresh has already started; reconcile existing checkpoint instead of creating another",
      )
      const old = prepared.cases.find((c) => c.name === "approve-edit")
      const retainedCancel = prepared.cases.find((c) => c.name === "cancel")
      assert(
        old &&
          retainedCancel &&
          prepared.priorCancellation?.proposalId ===
            retainedCancel.proposalId &&
          prepared.priorCancellation.status === "CANCELLED" &&
          prepared.priorCancellation.http === 200,
        "Exact prior approval/cancellation evidence required",
      )
      const oldSource = channel.readAssistantReviewLinkToken(
        prepared.reviewCheckpoint?.token ?? old.token,
      )
      assert(
        oldSource &&
          oldSource.expiresAt <= Date.now() &&
          oldSource.proposalId === old.proposalId &&
          oldSource.bindingId === bindingId &&
          oldSource.inboxId === old.inboxId,
        "Only the exact expired original locator may refresh",
      )
      const oldRow = await db.assistantActionProposal.findFirstOrThrow({
        where: {
          id: old.proposalId,
          actorUserId: actor.userId,
          tenantId: actor.tenantId,
          storeId: actor.storeId,
          conversationId,
          revision: 2,
          status: "PENDING",
        },
      })
      const oldInbox = await db.assistantWhatsAppInbox.findFirstOrThrow({
        where: { id: old.inboxId, bindingId, kind: "TURN", state: "COMPLETED" },
        select: { runId: true },
      })
      const retained = await db.assistantActionProposal.findFirst({
        where: {
          id: retainedCancel.proposalId,
          actorUserId: actor.userId,
          tenantId: actor.tenantId,
          conversationId,
          status: "CANCELLED",
        },
        select: { id: true },
      })
      assert(retained, "Retained cancellation must remain canonical CANCELLED")
      refreshedPayload = generalActionSchema.parse(oldRow.payload)
      assert(
        refreshedPayload.action === "product_create" &&
          refreshedPayload.name === `${marker} Eggs accepted edit`,
        "Exact persisted edited product payload required",
      )
      prepared.preparationIntent = "cancel_expired_approval_before_refresh"
      await save({ ...prepared, checkpoint: "before_expired_approval_cancel" })
      const oldContext = await createLinkedAssistantContext(
        db,
        principal,
        "preview-review-expired-source-cancel",
      )
      const closed = await decideGeneralProposal(oldContext, {
        proposalId: oldRow.id,
        revision: oldRow.revision,
        decision: "cancel",
      })
      assert(
        closed.status === "CANCELLED",
        "Old pending product must close canonically before replacement",
      )
      prepared.expiredApprovalFixtures = [
        ...(prepared.expiredApprovalFixtures ?? []),
        {
          proposalId: oldRow.id,
          inboxId: old.inboxId,
          runId: oldInbox.runId,
          revision: oldRow.revision,
          status: closed.status,
          reason:
            "Original approval source expired while waiting for Preview provider configuration build; no product committed",
        },
      ]
      prepared.refreshedFromProposalId = oldRow.id
      prepared.preparationSources = prepared.preparationSources?.filter(
        (source) => source.name !== "approve-edit",
      )
      prepared.cases = prepared.cases.filter((c) => c.name !== "approve-edit")
      prepared.preparationIntent = undefined
      await save({ ...prepared, checkpoint: "expired_approval_excluded" })
    }
    const sourceSuffix = phase === "refresh-approval" ? "turn-v3" : "turn-v2"
    // These two exact canonically prepared drafts cover rich product approve/edit and cancel.
    for (const name of ["approve-edit", "cancel"]) {
      if (prepared.cases.some((c) => c.name === name)) continue
      assert(
        !prepared.preparationIntent,
        "Uncertain previous source write requires reconciliation",
      )
      const recorded = prepared.preparationSources?.find(
        (source) => source.name === name,
      )
      let inbox: Awaited<
        ReturnType<typeof db.assistantWhatsAppInbox.findUniqueOrThrow>
      >
      let lease: {
        inboxId: string
        bindingId: string
        owner: string
        generation: number
      }
      let proposalId: string
      if (recorded) {
        inbox = await db.assistantWhatsAppInbox.findUniqueOrThrow({
          where: { id: recorded.inboxId },
        })
        assert(
          inbox.bindingId === bindingId && inbox.kind === "TURN",
          "Checkpoint must remain exact canonical TURN",
        )
        assert(
          inbox.providerMessageId === `${marker}-${name}-${sourceSuffix}`,
          "Exact source provider ID required",
        )
        const sourceRow = await db.assistantActionProposal.findFirst({
          where: {
            id: recorded.proposalId,
            actorUserId: actor.userId,
            tenantId: actor.tenantId,
            storeId: actor.storeId,
            conversationId,
            status: "PENDING",
          },
          select: { id: true },
        })
        assert(sourceRow, "Exact owned pending source proposal required")
        lease = recorded.lease
        assert(
          lease.inboxId === inbox.id && lease.bindingId === bindingId,
          "Exact checkpoint lease required",
        )
        proposalId = recorded.proposalId
      } else {
        prepared.preparationIntent = name
        await save({ ...prepared, checkpoint: `before_ingress_${name}` })
        const messageId = `${marker}-${name}-${sourceSuffix}`
        const accepted = await channel.acceptAssistantWhatsAppIngress(
          db,
          {
            phoneNumberId,
            providerMessageId: messageId,
            senderId,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            text:
              phase === "refresh-approval"
                ? "Please review the Egg product again."
                : "Prepare eggs in small and big sizes with owner-specified pack prices.",
          },
          [actor.userId],
        )
        assert(accepted.kind === "accepted", "Exact canonical ingress failed")
        if (accepted.kind !== "accepted") throw Error("INGRESS_UNAVAILABLE")
        inbox = await db.assistantWhatsAppInbox.findUniqueOrThrow({
          where: { id: accepted.id },
        })
        assert(
          inbox.kind === "TURN",
          "Plain business ingress must be canonical TURN",
        )
        const claimed = await channel.claimAssistantWhatsAppInbox(
          db,
          inbox.id,
          [actor.userId],
        )
        assert(claimed.kind === "claimed", "Exact canonical lease failed")
        if (claimed.kind !== "claimed") throw Error("LEASE_UNAVAILABLE")
        lease = claimed.lease
        const ctx = await createLinkedAssistantContext(
          db,
          principal,
          inbox.requestId,
          claimed.lease,
        )
        const drafted = await draftGeneralProposal(
          ctx,
          conversationId,
          refreshedPayload ?? {
            action: "product_create",
            name: `${marker} Eggs ${name}`,
            canonicalUnitName: "Egg",
            illustrationId: null,
            sellingUnits: [{ name: "Crate", containsQuantity: "30" }],
            options: [{ name: "Size", values: ["Small", "Big"] }],
            variants: [
              {
                selections: [{ optionName: "Size", value: "Small" }],
                priceMinor: 15000,
                sellingUnitPrices: [{ unitName: "Crate", priceMinor: 400000 }],
                stockByUnit: [{ unitName: "Crate", quantity: "25" }],
              },
              {
                selections: [{ optionName: "Size", value: "Big" }],
                priceMinor: 20000,
                sellingUnitPrices: [{ unitName: "Crate", priceMinor: 550000 }],
                stockByUnit: [{ unitName: "Crate", quantity: "500" }],
              },
            ],
          },
        )
        const reference = generalProposalReferencePart(drafted.proposalId, {
          proposalId: drafted.proposalId,
          revision: drafted.revision,
          payloadHash: proposalDigest(drafted.payload),
        })
        assert(reference, "Exact canonical proposal reference required")
        await db.$transaction(async (tx) => {
          assert(
            isLinkedAssistantIdentity(ctx.session),
            "Real linked principal required",
          )
          const resolved = await lockLinkedAssistantIdentity(tx, ctx.session)
          await channel.stampAssistantWhatsAppExecution(
            tx,
            claimed.lease,
            resolved,
          )
          const mid = randomUUID()
          assert(
            await appendAssistantMessage(tx, {
              conversationId,
              message: {
                id: mid,
                role: "assistant",
                parts: [
                  {
                    type: "text",
                    text: "Review the exact prepared product draft.",
                  },
                  reference,
                ],
              },
            }),
            "Exact reference persist failed",
          )
          const run = await tx.assistantRun.create({
            data: {
              conversationId,
              actorUserId: actor.userId,
              requestId: inbox.requestId,
              provider: "ewatrade-rehearsal",
              model: "synthetic-no-model",
              promptVersion: "preview-review-link-exact-source",
              status: "COMPLETED",
              completedAt: new Date(),
              assistantMessageId: mid,
            },
          })
          await tx.assistantWhatsAppInbox.update({
            where: { id: inbox.id },
            data: { runId: run.id },
          })
        })
        proposalId = drafted.proposalId
        prepared.preparationSources ??= []
        prepared.preparationSources.push({
          name,
          inboxId: inbox.id,
          proposalId,
          lease,
        })
        prepared.preparationIntent = undefined
        await save({ ...prepared, checkpoint: `source_committed_${name}` })
      }
      if (inbox.state !== "COMPLETED") {
        const webReview = await prepareAssistantWhatsAppWebReview(db, lease)
        assert(webReview, "Exact rich web review unavailable")
        assert.deepEqual(
          await channel.settleAssistantWhatsAppInbox(db, lease, {
            permittedUserIds: [actor.userId],
            webReview,
          }),
          { state: "COMPLETED" },
        )
      }
      const outbox = await db.assistantWhatsAppOutbox.findFirstOrThrow({
        where: { inboxId: inbox.id, renderKind: "web_review" },
      })
      const href = outbox.content?.match(/^Review draft: (\S+)$/m)?.[1]
      assert(
        href && new URL(href).origin === dashboardOrigin,
        "Exact Preview destination required",
      )
      const token = new URL(href).searchParams.get("token")
      assert(token, "Missing signed locator")
      prepared.cases.push({
        name,
        proposalId,
        inboxId: inbox.id,
        token,
        href,
      })
      await save({ ...prepared, checkpoint: `prepared_${name}` })
    }
    const first = prepared.cases.find((c) => c.name === "approve-edit")
    assert(first, "No draft prepared")
    const source = channel.readAssistantReviewLinkToken(first.token)
    assert(source, "Exact locator signature unavailable")
    prepared.expiredToken = channel.createAssistantReviewLinkToken({
      ...source,
      expiresAt: Date.now() - 1,
    })
    if (phase === "refresh-approval") {
      const row = await db.assistantActionProposal.findUniqueOrThrow({
        where: { id: first.proposalId },
        select: { revision: true },
      })
      prepared.reviewCheckpoint = {
        phase: "after_edit",
        token: first.token,
        revision: row.revision,
        results: {
          ...prepared.reviewCheckpoint?.results,
          approvalSourceRefreshedAfterBuildExpiry: true,
          priorEditProofRetained: true,
          repeatedCompletedChecks: false,
        },
      }
    }
    await save(prepared)
    console.log(
      JSON.stringify({
        phase,
        prepared: prepared.cases.length,
        targetRef,
        providerCalls: 0,
        output,
        marker,
        syntheticModelStandIn: true,
      }),
    )
  } else if (phase === "inspect") {
    const prepared = JSON.parse(await readFile(path, "utf8")) as Prepared
    const result = await inspect(prepared)
    await save({
      at: new Date().toISOString(),
      phase,
      targetRef,
      checks,
      ...result,
    })
    console.log(
      JSON.stringify({
        phase,
        targetRef,
        proposals: result.proposals.map((p) => ({
          id: p.id,
          status: p.status,
          revision: p.revision,
        })),
        outboxes: result.outboxes.map((o) => ({
          kind: o.renderKind,
          state: o.state,
          errorCode: o.errorCode,
        })),
        providerAttempts: result.providerAttempts,
        output,
      }),
    )
  } else {
    const prepared = JSON.parse(await readFile(path, "utf8")) as Prepared
    assert(prepared.targetRef === targetRef, "Fixture target changed")
    await verifyActor(prepared.actor)
    const privateInput = JSON.parse(
      await new Response(Bun.stdin.stream()).text(),
    ) as { cookie: string; wrongAccountCookie?: string }
    assert(
      privateInput.cookie && !/[\r\n]/.test(privateInput.cookie),
      "Existing Preview session cookie required over stdin",
    )
    const checkpoint = prepared.reviewCheckpoint
    if (phase === "finish")
      assert(
        checkpoint?.phase === "after_edit",
        "Exact paused edit checkpoint required",
      )
    const results: Record<string, unknown> =
      phase === "finish"
        ? { ...checkpoint?.results }
        : { ...prepared.readCheckpoint?.results }
    const rpc = async (
      name: string,
      input: unknown,
      options?: { cookie?: string; storeId?: string; allowError?: boolean },
    ) => {
      const response = await fetch(
        `${dashboardOrigin}/api/trpc/assistant.${name}`,
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(45_000),
          headers: {
            "content-type": "application/json",
            origin: dashboardOrigin,
            cookie: options?.cookie ?? privateInput.cookie,
            "x-assistant-client": "dashboard",
            "x-store-id": options?.storeId ?? prepared.actor.storeId,
          },
          body: JSON.stringify(superjson.serialize(input)),
        },
      )
      const body = (await response.json()) as {
        error?: { json?: { data?: { code?: string } } }
        result?: { data?: Parameters<typeof superjson.deserialize>[0] }
      }
      if (!response.ok || body.error) {
        if (options?.allowError)
          return rpcResult.parse({
            error: body.error?.json?.data?.code ?? `HTTP_${response.status}`,
          })
        throw Error(`PREVIEW_RPC_${name}_${response.status}`)
      }
      assert(body.result?.data, "Canonical SuperJSON response required")
      return rpcResult.parse(superjson.deserialize(body.result.data))
    }
    const approval = prepared.cases.find((c) => c.name === "approve-edit")
    const cancel = prepared.cases.find((c) => c.name === "cancel")
    assert(approval && cancel, "Exact two prepared drafts required")
    const currentReview = async () => {
      if (phase === "finish") {
        assert(
          checkpoint?.phase === "after_edit",
          "Exact paused edit checkpoint required",
        )
        const ready = await rpc("reviewLink", { token: checkpoint.token })
        assert.equal(ready.status, "ready")
        assert(
          ready.proposal?.approvalToken,
          "Current canonical approval required",
        )
        assert.equal(ready.proposal.revision, checkpoint.revision)
        return { token: checkpoint.token, proposal: ready.proposal }
      }
      const first = await rpc("reviewLink", { token: approval.token })
      assert.equal(first.status, "ready")
      assert(first.proposal, "Ready canonical proposal required")
      results.readOnlyReady = true
      if (prepared.readCheckpoint?.phase !== "before_edit") {
        assert.equal(
          (await rpc("reviewLink", { token: prepared.expiredToken })).status,
          "expired",
        )
        results.expired = true
        const corrupted =
          approval.token.slice(0, -1) +
          (approval.token.endsWith("a") ? "b" : "a")
        assert.equal(
          (await rpc("reviewLink", { token: corrupted })).status,
          "unavailable",
        )
        results.tampered = true
        if (privateInput.wrongAccountCookie) {
          const wrong = await rpc(
            "reviewLink",
            { token: approval.token },
            { cookie: privateInput.wrongAccountCookie, allowError: true },
          )
          assertReviewDenied(wrong, "unavailable")
          results.wrongAccount = wrong.status ?? wrong.error
        } else results.wrongAccount = "not_run_missing_second_session"
        if (prepared.otherStoreId) {
          const wrong = await rpc(
            "reviewLink",
            { token: approval.token },
            { storeId: prepared.otherStoreId, allowError: true },
          )
          const session = await db.session.findUniqueOrThrow({
            where: { id: prepared.actor.sessionId },
            select: { qaStoreId: true, qaTenantId: true },
          })
          if (session.qaStoreId) {
            assert(
              session.qaStoreId === prepared.actor.storeId &&
                session.qaTenantId === prepared.actor.tenantId,
              "QA session must pin exact prepared scope",
            )
            assert(
              wrong.status === "ready" &&
                wrong.proposal?.id === first.proposal.id,
              "Forged Store header must not override pinned QA scope",
            )
            results.qaScopeConfinement =
              "same_exact_proposal_header_override_ignored"
            results.wrongStoreDenial = "not_run_qa_session_pinned_store"
          } else {
            assertReviewDenied(wrong, "scope_mismatch")
            results.wrongStoreDenial = wrong.status ?? wrong.error
          }
        } else results.wrongStoreDenial = "not_run_missing_second_store"
      }
      await save({
        ...prepared,
        readCheckpoint: { phase: "before_edit", results },
      })
      const revised = await rpc("editReviewLink", {
        token: approval.token,
        payload: {
          ...first.proposal.payload,
          name: `${prepared.marker} Eggs accepted edit`,
        },
      })
      assert.equal(
        (await rpc("reviewLink", { token: approval.token })).status,
        "changed",
      )
      results.oldLinkAfterEdit = "changed"
      assert(revised.token, "Replacement locator required")
      const ready = await rpc("reviewLink", { token: revised.token })
      assert.equal(ready.status, "ready")
      assert(
        ready.proposal?.approvalToken,
        "Current canonical approval required",
      )
      assert.equal(ready.proposal.revision, first.proposal.revision + 1)
      if (pauseAfterEdit) {
        await save({
          ...prepared,
          reviewCheckpoint: {
            phase: "after_edit",
            token: revised.token,
            revision: ready.proposal.revision,
            results,
          },
        })
        console.log(
          JSON.stringify({
            phase,
            checkpoint: "after_edit",
            targetRef,
            output,
            awaitingBrowserReview: true,
            approved: false,
            cancelled: false,
          }),
        )
        return null
      }
      return { token: revised.token, proposal: ready.proposal }
    }
    const current = await currentReview()
    if (current) {
      const outcome = await rpc("decideReviewLink", {
        token: current.token,
        decision: "confirm",
        approvalToken: current.proposal.approvalToken,
      })
      assert.equal(outcome.status, "COMPLETED")
      results.approved = true
      const before = await inspect(prepared)
      const repeated = await rpc(
        "decideReviewLink",
        {
          token: current.token,
          decision: "confirm",
          approvalToken: current.proposal.approvalToken,
        },
        { allowError: true },
      )
      assert.equal(
        repeated.error,
        "CONFLICT",
        "Replay must fail with the canonical stale/used refusal",
      )
      results.replay = repeated.error
      assert.equal(
        (await rpc("reviewLink", { token: current.token })).status,
        "used",
      )
      if (prepared.priorCancellation) {
        assert(
          prepared.priorCancellation.http === 200 &&
            prepared.priorCancellation.status === "CANCELLED" &&
            prepared.priorCancellation.error === null &&
            prepared.priorCancellation.proposalId === cancel.proposalId,
          "Exact already-completed cancellation receipt required",
        )
        const savedCancellation = await db.assistantActionProposal.findFirst({
          where: {
            id: cancel.proposalId,
            tenantId: prepared.actor.tenantId,
            actorUserId: prepared.actor.userId,
            conversationId: prepared.conversationId,
            status: "CANCELLED",
          },
          select: { id: true },
        })
        assert(
          savedCancellation,
          "Previously cancelled exact proposal must still be CANCELLED",
        )
        results.priorCancellationReused = true
      } else {
        const cancelled = await rpc("decideReviewLink", {
          token: cancel.token,
          decision: "cancel",
        })
        assert.equal(cancelled.status, "CANCELLED")
      }
      const cancellationLink = await rpc("reviewLink", { token: cancel.token })
      if (
        prepared.refreshedFromProposalId &&
        cancellationLink.status === "expired"
      ) {
        assert(
          prepared.priorCancellation?.status === "CANCELLED",
          "Exact completed cancellation required",
        )
        results.cancelledLink = "expired_after_prior_canonical_cancellation"
      } else {
        assert.equal(cancellationLink.status, "used")
        results.cancelledLink = "used"
      }
      results.cancelled = true
      const final = await inspect(prepared)
      assert.equal(
        final.products.length,
        1,
        "Exactly one canonical product; cancel and replay create none",
      )
      assert(
        final.proposals.find((p) => p.id === approval.proposalId)?.status ===
          "COMPLETED" &&
          final.proposals.find((p) => p.id === cancel.proposalId)?.status ===
            "CANCELLED",
      )
      assert(
        before.proposals.find((p) => p.id === approval.proposalId)?.revision ===
          final.proposals.find((p) => p.id === approval.proposalId)?.revision,
        "Replay changed exact canonical proposal",
      )
      const outcomeIntents = final.outboxes.filter(
        (o) => o.renderKind === "web_review_result",
      )
      assert.equal(
        outcomeIntents.length,
        2,
        "Exactly two durable outcome intents required",
      )
      for (const reviewed of [approval, cancel])
        assert.equal(
          outcomeIntents.filter((o) => o.inboxId === reviewed.inboxId).length,
          1,
          "Each exact source inbox requires one durable outcome intent",
        )
      results.exactOutcomeIntents = true
      assert(
        final.outboxes.filter((o) => o.renderKind === "web_review").length >= 3,
        "Durable edit renewal intent missing",
      )
      await save({
        at: new Date().toISOString(),
        phase,
        targetRef,
        results,
        checks,
        ...final,
      })
      console.log(
        JSON.stringify({
          phase,
          targetRef,
          results,
          providerAttempts: final.providerAttempts,
          output,
          realWhatsAppDeliveryClaimed: false,
        }),
      )
    }
  }
} finally {
  await db.$disconnect()
}
