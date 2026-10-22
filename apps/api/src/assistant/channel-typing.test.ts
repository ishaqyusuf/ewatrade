import { expect, test } from "bun:test"
import { WhatsAppTypingError } from "@ewatrade/communications"
import {
  type AssistantWhatsAppTypingReport,
  type TypingIdentity,
  type WhatsAppTypingSkipReason,
  defaultChannelTypingDependencies,
  startAssistantWhatsAppTyping,
} from "./channel-typing"

type MutableTypingIdentity = {
  -readonly [Key in keyof TypingIdentity]: TypingIdentity[Key]
}

const now = new Date("2026-10-22T10:00:00Z")
function fixture() {
  const identity: MutableTypingIdentity = {
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
    requestId: "wa-turn-internal-request",
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
  const reports: AssistantWhatsAppTypingReport[] = []
  const deps: ReturnType<typeof defaultChannelTypingDependencies> = {
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
      return { outcome: "accepted", httpStatus: 200 }
    },
    report: (event) => {
      reports.push(event)
    },
  }
  return { identity, ctx, inbox, deps, sends, reports }
}

test("typing is optional after current linked authority and provider failure cannot block the reply", async () => {
  const f = fixture()
  const accepted = await startAssistantWhatsAppTyping(
    f.ctx,
    f.inbox,
    f.deps,
    now,
  )
  expect(accepted).toEqual({
    outcome: "accepted",
    providerStatus: 200,
    elapsedMs: expect.any(Number),
  })
  expect(f.reports).toEqual([{ requestId: f.ctx.requestId, ...accepted }])
  expect(f.sends).toEqual([
    {
      accessToken: "synthetic",
      phoneNumberId: "123456789",
      messageId: "wamid.source",
    },
  ])
  let ordinaryReplyReached = false
  const failed = await startAssistantWhatsAppTyping(
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
  expect(failed).toEqual({
    outcome: "failed",
    reason: "unexpected",
    elapsedMs: expect.any(Number),
  })
  expect(f.reports[1]).toEqual({ requestId: f.ctx.requestId, ...failed })
  expect(JSON.stringify(f.reports)).not.toContain("private transport failure")
  // A request-shaped object cannot forge the default private identity brand.
  await startAssistantWhatsAppTyping(
    f.ctx,
    f.inbox,
    { ...f.deps, linked: defaultChannelTypingDependencies().linked },
    now,
  )
  expect(f.sends).toHaveLength(1)
})

test("typing reports only internal correlation and safe outcomes; a broken reporter never blocks", async () => {
  const f = fixture()
  await startAssistantWhatsAppTyping(f.ctx, f.inbox, f.deps, now)
  f.inbox.kind = "CONTROL"
  const skipped = await startAssistantWhatsAppTyping(
    f.ctx,
    f.inbox,
    f.deps,
    now,
  )
  expect(skipped).toEqual({
    outcome: "skipped",
    reason: "not_turn",
    elapsedMs: expect.any(Number),
  })
  expect(f.reports).toHaveLength(2)
  const serialized = JSON.stringify(f.reports)
  for (const privateValue of [
    "synthetic",
    "wamid.source",
    "2348000000000",
    "123456789",
    "lease-owner",
    "binding",
    "grant",
  ]) {
    expect(serialized).not.toContain(privateValue)
  }
  expect(serialized).toContain(f.ctx.requestId)
  f.inbox.kind = "TURN"
  const accepted = await startAssistantWhatsAppTyping(
    f.ctx,
    f.inbox,
    {
      ...f.deps,
      report: async () => {
        throw new Error("private diagnostic failure")
      },
    },
    now,
  )
  expect(accepted.outcome).toBe("accepted")
  expect(f.sends).toHaveLength(2)
})

test("typing gives stable skip reasons without contacting Meta", async () => {
  const cases: Array<
    [WhatsAppTypingSkipReason, (f: ReturnType<typeof fixture>) => void]
  > = [
    [
      "not_processing",
      (f) => {
        f.inbox.state = "COMPLETED"
      },
    ],
    [
      "non_live",
      (f) => {
        f.ctx.tenantContext.tenant.dataClassification = "QA"
      },
    ],
    [
      "unlinked_identity",
      (f) => {
        f.deps.linked = defaultChannelTypingDependencies().linked
      },
    ],
    [
      "non_general",
      (f) => {
        f.identity.purpose = "SETUP"
      },
    ],
    [
      "missing_lease",
      (f) => {
        delete f.identity.inboxLease
      },
    ],
    [
      "binding_mismatch",
      (f) => {
        f.inbox.bindingId = "other"
      },
    ],
    [
      "phone_mismatch",
      (f) => {
        f.inbox.phoneNumberId = "999"
      },
    ],
    [
      "lease_inbox_mismatch",
      (f) => {
        f.inbox.id = "other"
      },
    ],
    [
      "lease_generation_mismatch",
      (f) => {
        f.inbox.leaseGeneration++
      },
    ],
    [
      "lease_owner_mismatch",
      (f) => {
        f.inbox.leaseOwner = "other"
      },
    ],
    [
      "lease_expired",
      (f) => {
        f.inbox.leaseExpiresAt = now
      },
    ],
    [
      "ingress_expired",
      (f) => {
        f.inbox.expiresAt = now
      },
    ],
    [
      "invalid_source_time",
      (f) => {
        f.inbox.providerOccurredAt = new Date(Number.NaN)
      },
    ],
    [
      "future_source",
      (f) => {
        f.inbox.providerOccurredAt = new Date(now.getTime() + 1)
      },
    ],
    [
      "session_expired",
      (f) => {
        f.inbox.providerOccurredAt = new Date(now.getTime() - 24 * 60 * 60_000)
      },
    ],
    [
      "invalid_message_id",
      (f) => {
        f.inbox.providerMessageId = "control:opaque"
      },
    ],
    [
      "not_enrolled",
      (f) => {
        f.deps.allowed = () => false
      },
    ],
    [
      "unavailable_config",
      (f) => {
        f.deps.config = () => null
      },
    ],
    [
      "configured_phone_mismatch",
      (f) => {
        f.deps.config = () => ({
          accessToken: "synthetic",
          phoneNumberId: "999",
          displayNumber: "2348000000000",
        })
      },
    ],
  ]
  for (const [reason, mutate] of cases) {
    const f = fixture()
    mutate(f)
    const outcome = await startAssistantWhatsAppTyping(
      f.ctx,
      f.inbox,
      f.deps,
      now,
    )
    expect(outcome).toEqual({
      outcome: "skipped",
      reason,
      elapsedMs: expect.any(Number),
    })
    expect(f.reports).toEqual([{ requestId: f.ctx.requestId, ...outcome }])
    expect(f.sends).toHaveLength(0)
  }
})

test("typing distinguishes sanitized provider rejection, timeout and network failure", async () => {
  const failures = [
    new WhatsAppTypingError("timeout"),
    new WhatsAppTypingError("network"),
    new WhatsAppTypingError("invalid_success", { httpStatus: 200 }),
    new WhatsAppTypingError("rejected", {
      httpStatus: 400,
      metaCode: 131000,
      metaSubcode: 2494055,
    }),
  ]
  for (const error of failures) {
    const f = fixture()
    const outcome = await startAssistantWhatsAppTyping(
      { session: f.ctx.session, tenantContext: f.ctx.tenantContext },
      f.inbox,
      {
        ...f.deps,
        send: async () => {
          throw error
        },
      },
      now,
    )
    expect(outcome).toEqual({
      outcome: "failed",
      reason: error.reason,
      elapsedMs: expect.any(Number),
      ...(error.httpStatus === undefined
        ? {}
        : { providerStatus: error.httpStatus }),
      ...(error.metaCode === undefined ? {} : { providerCode: error.metaCode }),
      ...(error.metaSubcode === undefined
        ? {}
        : { providerSubcode: error.metaSubcode }),
    })
    expect(f.reports).toEqual([outcome])
    expect(f.sends).toHaveLength(0)
  }
})
