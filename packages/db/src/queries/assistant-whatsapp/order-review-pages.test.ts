import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type {
  AssistantActionProposal,
  AssistantWhatsAppActionReview,
  Prisma,
} from "../../../generated/prisma/client"
import type { resolveAssistantWhatsAppConversation } from "./conversations"
import { assistantWhatsAppAuthorityDigest } from "./execution"
import {
  advanceNativeOrderReviewPage,
  assertCompleteNativeOrderReview,
  nativeOrderReviewPageInfo,
  stageNativeOrderReviewPage,
} from "./order-review-pages"

function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error("Missing fixture row")
  return value
}

const now = new Date("2026-11-10T10:00:00.000Z")
const expiresAt = new Date(now.getTime() + 300000)
function fixture() {
  const sessions = new Map<string, Record<string, unknown>>()
  const boxes = new Map<string, Record<string, unknown>>()
  const inboxes = new Map<string, Record<string, unknown>>()
  const policy = {
    role: "CASHIER",
    status: "ACTIVE",
    staffAccessMode: "SCOPED",
    catalogEditor: false,
    staffAccessRevision: 1,
    staffStoreAssignments: [
      { storeId: "store", role: "CASHIER", status: "ACTIVE", revision: 1 },
    ],
  }
  const resolved = {
    scope: {
      tenantId: "tenant",
      storeId: "store",
      userId: "user",
      membershipId: "member",
    },
    binding: {
      id: "binding",
      identityGeneration: 1,
      grantGeneration: 1,
      selectionGeneration: 1,
    },
    conversation: { id: "conversation", purpose: "GENERAL" },
    tenantContext: {
      membership: { role: "CASHIER" },
      tenant: {
        type: "MERCHANT",
        enabledModes: ["MERCHANT"],
        retailOpsPlanId: "pro",
        dataClassification: "QA",
        currencyCode: "NGN",
      },
      activeStore: { currencyCode: "NGN" },
    },
  } as unknown as Awaited<
    ReturnType<typeof resolveAssistantWhatsAppConversation>
  >
  const proposal = {
    id: "proposal",
    revision: 1,
    action: "order_create",
    status: "PENDING",
    expiresAt,
    tenantId: "tenant",
    storeId: "store",
    actorUserId: "user",
    conversationId: "conversation",
    payloadHash: "a".repeat(64),
    targetRevision: "target",
  } as AssistantActionProposal
  const tx = {
    membership: { findFirst: async () => policy },
    onboardingSession: {
      findUnique: async ({ where }: { where: { token: string } }) =>
        sessions.get(where.token) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: "session", completed: false }
        sessions.set(String(data.token), row)
        return row
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        const row = [...sessions.values()][0]
        if (!row) throw Error("Missing session")
        Object.assign(row, data)
        return row
      },
    },
    assistantWhatsAppActionReview: {
      findUnique: async ({ where }: { where: { reviewOutboxId: string } }) => ({
        bindingId: "binding",
        state: "PENDING",
        proposal,
        reviewOutboxId: where.reviewOutboxId,
      }),
    },
    assistantWhatsAppOutbox: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        boxes.get(where.id) ?? null,
    },
    assistantWhatsAppInbox: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        inboxes.get(where.id) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) =>
        inboxes.get(where.id) ?? null,
    },
  } as unknown as Prisma.TransactionClient
  const pages = [
    "Page 1 · exact item 1",
    "Page 2 · exact item 2",
    "Page 3 · complete summary",
  ]
  async function stage(index: number, id = `page-${index}`) {
    const authorityDigest = await assistantWhatsAppAuthorityDigest(tx, resolved)
    await stageNativeOrderReviewPage(
      tx,
      {
        resolved,
        proposal,
        pages,
        index,
        outboxId: id,
        expiresAt,
        authorityDigest,
      },
      now,
    )
    return id
  }
  async function deliver(index: number, id = `page-${index}`) {
    const authorityDigest = await assistantWhatsAppAuthorityDigest(tx, resolved)
    boxes.set(id, {
      id,
      content: pages[index],
      contentDigest: createHash("sha256")
        .update(pages[index] ?? "")
        .digest("hex"),
      authorityDigest,
      sentAt: now,
      providerMessageId: `wamid-${id}`,
      phoneNumberId: "phone",
      state: "DELIVERED",
      renderKind: "action_review",
      inbox: { bindingId: "binding", kind: "TURN", sequence: index * 10 },
      deliveryAttempts: [
        { state: "ACCEPTED", providerMessageId: `wamid-${id}` },
      ],
    })
    return id
  }
  async function next(index: number, ingressId = `next-${index}`) {
    const command = {
      type: "order_review_page",
      sourceOutboxId: `page-${index}`,
      direction: "next",
      replyToMessageId: `wamid-page-${index}`,
    }
    inboxes.set(ingressId, {
      id: ingressId,
      content: command,
      bindingId: "binding",
      phoneNumberId: "phone",
      sequence: index * 10 + 1,
      state: "PROCESSING",
      providerOccurredAt: now,
      executionAuthorityDigest: await assistantWhatsAppAuthorityDigest(
        tx,
        resolved,
      ),
    })
    const result = await advanceNativeOrderReviewPage(
      tx,
      resolved,
      command,
      ingressId,
      now,
    )
    required(inboxes.get(ingressId)).state = "COMPLETED"
    return result
  }
  return {
    tx,
    resolved,
    proposal,
    pages,
    sessions,
    boxes,
    inboxes,
    policy,
    stage,
    deliver,
    next,
  }
}
test("Confirm refuses skipped/unseen pages; accepted quoted Next completes one immutable review chain", async () => {
  const f = fixture()
  await f.stage(0)
  await f.deliver(0)
  await expect(f.stage(2)).rejects.toThrow()
  const review = { reviewOutboxId: "page-0" } as AssistantWhatsAppActionReview
  await expect(
    assertCompleteNativeOrderReview(f.tx, f.resolved, f.proposal, review, now),
  ).rejects.toThrow()
  expect((await f.next(0)).index).toBe(1)
  await f.stage(1)
  await f.deliver(1)
  expect((await f.next(0, "duplicate-next-0")).index).toBe(1)
  await expect(f.stage(2)).rejects.toThrow()
  expect((await f.next(1)).index).toBe(2)
  await f.stage(2)
  await f.deliver(2)
  await assertCompleteNativeOrderReview(
    f.tx,
    f.resolved,
    f.proposal,
    { reviewOutboxId: "page-2" } as AssistantWhatsAppActionReview,
    now,
  )
  required(f.inboxes.get("next-0")).executionAuthorityDigest = "different"
  await expect(
    assertCompleteNativeOrderReview(
      f.tx,
      f.resolved,
      f.proposal,
      { reviewOutboxId: "page-2" } as AssistantWhatsAppActionReview,
      now,
    ),
  ).rejects.toThrow()
})
test("unknown delivery, wrong quote, changed source/authority, expiry and body mutation refuse navigation", async () => {
  for (const mutation of [
    "unknown",
    "quote",
    "body",
    "generation",
    "role",
    "expiry",
    "payload",
  ]) {
    const f = fixture()
    await f.stage(0)
    await f.deliver(0)
    const page = required(f.boxes.get("page-0"))
    if (mutation === "unknown") page.deliveryAttempts = []
    if (mutation === "quote") page.providerMessageId = "other"
    if (mutation === "body") page.content = "Changed material facts"
    if (mutation === "generation") f.resolved.binding.selectionGeneration++
    if (mutation === "role") f.policy.role = "SUSPENDED"
    if (mutation === "expiry")
      required([...f.sessions.values()][0]).expiresAt = now
    if (mutation === "payload") f.proposal.payloadHash = "b".repeat(64)
    await expect(f.next(0)).rejects.toThrow()
  }
})
test("page reissue cannot substitute facts or advance progress; foreign Store and completed Order refuse", async () => {
  const f = fixture()
  await f.stage(0)
  await expect(
    stageNativeOrderReviewPage(
      f.tx,
      {
        resolved: f.resolved,
        proposal: f.proposal,
        outboxId: "other",
        index: 0,
        pages: ["Different facts"],
        expiresAt,
        authorityDigest: await assistantWhatsAppAuthorityDigest(
          f.tx,
          f.resolved,
        ),
      },
      now,
    ),
  ).rejects.toThrow()
  f.proposal.storeId = "foreign"
  await expect(
    nativeOrderReviewPageInfo(f.tx, f.resolved, f.proposal, "page-0", now),
  ).rejects.toThrow()
  f.proposal.storeId = "store"
  f.proposal.status = "COMPLETED"
  await expect(
    nativeOrderReviewPageInfo(f.tx, f.resolved, f.proposal, "page-0", now),
  ).rejects.toThrow()
})
