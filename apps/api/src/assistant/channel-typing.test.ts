import { expect, test } from "bun:test"
import {
  type TypingIdentity,
  defaultChannelTypingDependencies,
  startAssistantWhatsAppTyping,
} from "./channel-typing"

const now = new Date("2026-10-22T10:00:00Z")
function fixture() {
  const identity: TypingIdentity = {
    purpose: "GENERAL",
    user: { id: "actor" },
    principal: {
      kind: "linked_whatsapp",
      bindingId: "binding",
      phoneNumberId: "123456789",
      senderId: "2348000000000",
      grantId: "grant",
      grantGeneration: 1,
      identityGeneration: 1,
      selectionGeneration: 1,
    },
    inboxLease: {
      inboxId: "inbox",
      bindingId: "binding",
      owner: "lease-owner",
      generation: 2,
    },
  }
  const ctx = {
    session: identity,
    tenantContext: { tenant: { dataClassification: "LIVE" } },
  }
  const inbox = {
    id: "inbox",
    kind: "TURN",
    state: "PROCESSING",
    bindingId: "binding",
    phoneNumberId: "123456789",
    providerMessageId: "wamid.source",
    providerOccurredAt: new Date(now.getTime() - 1000),
    expiresAt: new Date(now.getTime() + 60_000),
    leaseOwner: "lease-owner",
    leaseGeneration: 2,
    leaseExpiresAt: new Date(now.getTime() + 30_000),
  }
  const sends: Array<{
    accessToken: string
    phoneNumberId: string
    messageId: string
  }> = []
  const deps = {
    ...defaultChannelTypingDependencies(),
    linked: (value: unknown): value is TypingIdentity => value === identity,
    allowed: () => true,
    config: () => ({
      accessToken: "synthetic",
      phoneNumberId: "123456789",
      displayNumber: "2348000000000",
    }),
    send: async (input: {
      accessToken: string
      phoneNumberId: string
      messageId: string
    }) => {
      sends.push(input)
    },
  }
  return { identity, ctx, inbox, deps, sends }
}

test("typing is optional after current linked authority and provider failure cannot block the reply", async () => {
  const f = fixture()
  await startAssistantWhatsAppTyping(f.ctx, f.inbox, f.deps, now)
  expect(f.sends).toEqual([
    {
      accessToken: "synthetic",
      phoneNumberId: "123456789",
      messageId: "wamid.source",
    },
  ])
  let ordinaryReplyReached = false
  await startAssistantWhatsAppTyping(
    f.ctx,
    f.inbox,
    {
      ...f.deps,
      send: async () => {
        throw new Error("private transport failure")
      },
    },
    now,
  )
  ordinaryReplyReached = true
  expect(ordinaryReplyReached).toBe(true)
  // A request-shaped object cannot forge the default private identity brand.
  await startAssistantWhatsAppTyping(
    f.ctx,
    f.inbox,
    { ...f.deps, linked: defaultChannelTypingDependencies().linked },
    now,
  )
  expect(f.sends).toHaveLength(1)
})

test("typing skips QA, controls, workflow, stale or mismatched sources and disabled enrollment", async () => {
  const mutations: Array<(f: ReturnType<typeof fixture>) => void> = [
    (f) => {
      f.ctx.tenantContext.tenant.dataClassification = "QA"
    },
    (f) => {
      f.inbox.kind = "ACTION"
    },
    (f) => {
      f.inbox.kind = "CONTROL"
    },
    (f) => {
      f.identity.purpose = "SETUP"
    },
    (f) => {
      f.identity.purpose = "PRODUCT_CREATE"
    },
    (f) => {
      f.inbox.bindingId = "another-binding"
    },
    (f) => {
      f.inbox.phoneNumberId = "987654321"
    },
    (f) => {
      f.inbox.leaseGeneration++
    },
    (f) => {
      f.inbox.leaseOwner = "another-owner"
    },
    (f) => {
      f.inbox.id = "another-inbox"
    },
    (f) => {
      f.inbox.state = "COMPLETED"
    },
    (f) => {
      f.inbox.expiresAt = now
    },
    (f) => {
      f.inbox.leaseExpiresAt = now
    },
    (f) => {
      f.inbox.providerOccurredAt = new Date(now.getTime() - 24 * 60 * 60_000)
    },
    (f) => {
      f.inbox.providerOccurredAt = new Date(now.getTime() + 1)
    },
    (f) => {
      f.inbox.providerMessageId = "control:opaque"
    },
    (f) => {
      f.deps.allowed = () => false
    },
    (f) => {
      f.deps.config = () => ({
        accessToken: "synthetic",
        phoneNumberId: "987654321",
        displayNumber: "2348000000000",
      })
    },
  ]
  for (const mutate of mutations) {
    const f = fixture()
    mutate(f)
    await startAssistantWhatsAppTyping(f.ctx, f.inbox, f.deps, now)
    expect(f.sends).toHaveLength(0)
  }
})
