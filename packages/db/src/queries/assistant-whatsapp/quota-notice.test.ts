import { afterAll, beforeAll, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { primaryControlScope } from "./control-authority"
import {
  assistantWhatsAppQuotaNoticeId,
  stageAssistantWhatsAppQuotaNoticeInTransaction,
} from "./quota-notice"

const now = new Date("2026-10-15T12:00:00Z")
const env = {
  APP_ENV: "local",
  NODE_ENV: "test",
  ASSISTANT_WHATSAPP_ENABLED: "true",
  ASSISTANT_WHATSAPP_PILOT_USER_IDS: "actor",
  ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: "tenant",
  WHATSAPP_OTP_ACCESS_TOKEN: "synthetic-token",
  WHATSAPP_OTP_PHONE_NUMBER_ID: "123456789",
  ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "2348000000000",
}
const previous = new Map(Object.keys(env).map((key) => [key, process.env[key]]))
beforeAll(() => Object.assign(process.env, env))
afterAll(() => {
  for (const [key, value] of previous) {
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }
})
const principal = {
  kind: "linked_whatsapp" as const,
  phoneNumberId: "123456789",
  senderId: "2348000000000",
  bindingId: "binding",
  grantId: "grant",
  identityGeneration: 1,
  grantGeneration: 1,
  selectionGeneration: 1,
}
function fixture(
  options: {
    collision?: boolean
    revoked?: boolean
    anchorGrants?: Array<{ id: string; tenantId: string }>
  } = {},
) {
  const notices: unknown[] = []
  const output: unknown[] = []
  const queries: unknown[] = []
  const saved = new Set<string>()
  const tenant = {
    id: "tenant",
    slug: "tenant",
    name: "Synthetic business",
    type: "MERCHANT",
    enabledModes: ["MERCHANT"],
    currencyCode: "NGN",
    timezone: "Africa/Lagos",
    dataClassification: "QA",
    qaPurgeStartedAt: null,
    metadata: { retailOps: { subscription: { planId: "pro" } } },
    subscription: null,
    stores: [
      {
        id: "store",
        slug: "store",
        name: "Synthetic Store",
        status: "ACTIVE",
        currencyCode: "NGN",
        metadata: null,
      },
    ],
  }
  const tx = {
    $queryRaw: async () => [],
    $executeRaw: async () => 1,
    tenant: { findUnique: async () => ({ slug: "tenant" }) },
    membership: {
      findFirst: async () => ({
        id: "member",
        tenantId: "tenant",
        role: "OWNER",
        status: "ACTIVE",
        staffAccessMode: "LEGACY",
        catalogEditor: true,
        staffAccessRevision: 1,
        staffStoreAssignments: [],
        retailOpsStaffProfile: null,
        tenant,
      }),
    },
    user: { findUnique: async () => ({ ageBand: "ADULT" }) },
    accountPrivacyRequest: { findUnique: async () => null },
    assistantWhatsAppGrant: {
      findFirst: async (query: unknown) => {
        queries.push(query)
        if (options.revoked) return null
        let selected = { id: "grant", tenantId: "tenant" }
        if (options.anchorGrants) {
          const { where } = query as {
            where: { id?: string; tenantId?: { in: string[] } }
          }
          const candidate = options.anchorGrants.find(
            (grant) =>
              (!where.id || grant.id === where.id) &&
              (!where.tenantId || where.tenantId.in.includes(grant.tenantId)),
          )
          if (!candidate) return null
          selected = candidate
        }
        return {
          ...selected,
          storeId: "store",
          membershipId: "member",
          identity: { id: "identity", userId: "actor", generation: 1 },
        }
      },
    },
    assistantWhatsAppBinding: {
      findFirst: async () => ({
        id: "binding",
        purpose: "GENERAL",
        conversation: { id: "chat", purpose: "GENERAL" },
      }),
      update: async () => ({ inboundSequence: 9 }),
    },
    assistantWhatsAppInbox: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        saved.has(where.id) ? { id: where.id } : null,
      createMany: async ({
        data,
        skipDuplicates,
      }: { data: Array<{ id: string }>; skipDuplicates: boolean }) => {
        expect(skipDuplicates).toBe(true)
        if (options.collision) return { count: 0 }
        notices.push(...data)
        for (const row of data) saved.add(row.id)
        return { count: 1 }
      },
    },
    assistantWhatsAppOutbox: {
      create: async (input: unknown) => {
        output.push(input)
        return { id: "outbox" }
      },
    },
  }
  return {
    tx: tx as unknown as Parameters<
      typeof stageAssistantWhatsAppQuotaNoticeInTransaction
    >[0],
    notices,
    output,
    queries,
  }
}
const input = {
  principal,
  providerMessageId: "original-provider-id",
  providerOccurredAt: now,
}

test("daily notice identity is server actor/endpoint/UTCday only", () => {
  const actor = { userId: "actor", phoneNumberId: "123456789" }
  const id = assistantWhatsAppQuotaNoticeId(actor, now)
  expect(id).toMatch(/^wa-quota-[a-f0-9]{64}$/)
  expect(
    assistantWhatsAppQuotaNoticeId(actor, new Date("2026-10-15T23:59:59Z")),
  ).toBe(id)
  for (const [scope, time] of [
    [{ ...actor, userId: "other" }, now],
    [{ ...actor, phoneNumberId: "987654321" }, now],
    [actor, new Date("2026-10-16T00:00:00Z")],
  ] as const)
    expect(assistantWhatsAppQuotaNoticeId(scope, time)).not.toBe(id)
})

test("one immutable server fixed notice stages no denied content/digest/model and repeat IDs cannot enqueue twice", async () => {
  const f = fixture()
  const result = await stageAssistantWhatsAppQuotaNoticeInTransaction(
    f.tx,
    input,
    now,
  )
  expect(result).toMatchObject({
    kind: "quota_notice_accepted",
    bindingId: "binding",
    outboxId: "outbox",
  })
  expect(f.notices).toHaveLength(1)
  expect(f.notices[0]).toMatchObject({
    kind: "TURN",
    state: "COMPLETED",
    bindingId: "binding",
    providerMessageId: input.providerMessageId,
    errorCode: "INGRESS_RATE_LIMITED",
    content: { type: "channel_notice", code: "TRANSPORT_RATE_LIMITED" },
    expiresAt: new Date(now.getTime() + 5 * 60_000),
    contentDigest: createHash("sha256")
      .update(
        JSON.stringify({
          type: "channel_notice",
          code: "TRANSPORT_RATE_LIMITED",
        }),
      )
      .digest("hex"),
  })
  expect(Object.keys(f.notices[0] as object)).not.toContain("runId")
  expect(f.output).toHaveLength(1)
  expect(JSON.stringify(f.output)).toContain("/assistant/c/chat")
  expect(
    await stageAssistantWhatsAppQuotaNoticeInTransaction(
      f.tx,
      { ...input, providerMessageId: "different-provider-id" },
      now,
    ),
  ).toBeUndefined()
  expect(f.notices).toHaveLength(1)
  expect(f.output).toHaveLength(1)
  expect(f.queries[0]).toMatchObject({
    where: {
      revokedAt: null,
      expiresAt: { gt: now },
      idleExpiresAt: { gt: now },
      generation: 1,
      identity: { revokedAt: null, generation: 1 },
    },
  })
})

test("atomic insert conflict and revoked authority cannot produce a second output", async () => {
  const duplicate = fixture({ collision: true })
  expect(
    await stageAssistantWhatsAppQuotaNoticeInTransaction(
      duplicate.tx,
      input,
      now,
    ),
  ).toBeUndefined()
  expect(duplicate.output).toEqual([])
  const revoked = fixture({ revoked: true })
  await expect(
    stageAssistantWhatsAppQuotaNoticeInTransaction(revoked.tx, input, now),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  expect(revoked.notices).toEqual([])
  expect(revoked.output).toEqual([])
})

test("default-off configuration and Tenant enrollment cannot stage a quota notice", async () => {
  try {
    process.env.ASSISTANT_WHATSAPP_ENABLED = "false"
    const disabled = fixture()
    expect(
      await stageAssistantWhatsAppQuotaNoticeInTransaction(
        disabled.tx,
        input,
        now,
      ),
    ).toBeUndefined()
    expect(disabled.queries).toEqual([])
    process.env.ASSISTANT_WHATSAPP_ENABLED = "true"
    process.env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS = "other-tenant"
    const denied = fixture()
    await expect(
      stageAssistantWhatsAppQuotaNoticeInTransaction(denied.tx, input, now),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(denied.notices).toEqual([])
    expect(denied.output).toEqual([])
  } finally {
    Object.assign(process.env, env)
  }
})

test("personal control quota anchor skips an unenrolled first grant and still resolves the later enrolled grant canonically", async () => {
  const current = fixture({
    anchorGrants: [
      { id: "a-unenrolled", tenantId: "foreign-tenant" },
      { id: "b-enrolled", tenantId: "tenant" },
    ],
  })
  const selected = await primaryControlScope(
    current.tx,
    {
      id: "identity",
      userId: "actor",
      phoneNumberId: "123456789",
      senderId: "2348000000000",
      generation: 1,
      selectionGeneration: 1,
      controlSequence: 0,
      activeBindingId: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    now,
  )
  expect(selected.grant.id).toBe("b-enrolled")
  expect(selected.scope).toEqual({
    userId: "actor",
    tenantId: "tenant",
    membershipId: "member",
    storeId: "store",
  })
  expect(current.notices).toEqual([])
  expect(current.output).toEqual([])
  expect(current.queries).toHaveLength(2)
})
