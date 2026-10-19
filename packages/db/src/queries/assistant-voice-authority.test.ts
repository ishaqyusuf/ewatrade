import { expect, mock, test } from "bun:test"
import { assertVoiceAttemptActive, reserveVoiceAudio } from "./assistant-voice"

type Role = "OWNER" | "ADMIN" | "MANAGER" | "CASHIER" | "OPERATOR" | "SUPPORT"
function harness(role: Role = "CASHIER", purpose = "GENERAL") {
  const row = {
    id: "audio",
    kind: "AUDIO",
    tenantId: "tenant",
    storeId: "store",
    actorUserId: "actor",
    retentionUntil: new Date(Date.now() + 60_000),
    leaseUntil: new Date(Date.now() + 60_000),
    conversation: {
      ownerUserId: "actor",
      tenantId: "tenant",
      storeId: "store",
      purpose,
      tenant: { slug: "business" },
    },
  }
  const membership = {
    id: "membership",
    role,
    tenantId: "tenant",
    staffAccessMode: "SCOPED",
    catalogEditor: false,
    staffStoreAssignments: [
      {
        storeId: "store",
        role: role === "OWNER" || role === "ADMIN" ? "CASHIER" : role,
        status: "ACTIVE",
      },
    ],
    retailOpsStaffProfile: { defaultStoreId: "store" },
    tenant: {
      id: "tenant",
      slug: "business",
      name: "Business",
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      dataClassification: "LIVE",
      currencyCode: "NGN",
      timezone: "Africa/Lagos",
      qaPurgeStartedAt: null,
      metadata: null,
      subscription: null,
      stores: [
        {
          id: "store",
          slug: "main",
          name: "Main",
          status: "ACTIVE",
          currencyCode: "NGN",
          metadata: null,
        },
      ],
    },
  }
  const findFirst = mock(
    async (input: {
      where: { retentionUntil: { gt: Date }; leaseUntil: { gt: Date } }
    }) =>
      row.retentionUntil > input.where.retentionUntil.gt &&
      row.leaseUntil > input.where.leaseUntil.gt
        ? row
        : null,
  )
  const membershipRead = mock(async () => membership)
  const db = {
    assistantAttachment: { findFirst },
    membership: { findFirst: membershipRead },
  }
  return { db, row, membership, findFirst, membershipRead }
}

test("General voice uses fresh canonical scoped Store access for all already-admitted merchant roles", async () => {
  for (const role of [
    "OWNER",
    "ADMIN",
    "MANAGER",
    "CASHIER",
    "OPERATOR",
  ] as const) {
    const h = harness(role)
    await expect(
      assertVoiceAttemptActive(h.db as never, "audio", 2),
    ).resolves.toBeUndefined()
    expect(h.membershipRead).toHaveBeenCalledTimes(1)
    expect<unknown>(h.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      id: "audio",
      status: "PROCESSING",
      processingAttempts: 2,
      retentionUntil: { gt: expect.any(Date) },
      conversation: {
        status: "ACTIVE",
        owner: {
          accountPrivacyRequests: {
            none: { status: { in: ["PROCESSING", "COMPLETED"] } },
          },
        },
      },
    })
  }
})

test("post-claim Store loss, foreign ownership, expiry and unrelated purpose refuse before the next provider attempt", async () => {
  const scoped = harness()
  await assertVoiceAttemptActive(scoped.db as never, "audio", 1)
  scoped.membership.staffStoreAssignments = []
  await expect(
    assertVoiceAttemptActive(scoped.db as never, "audio", 1),
  ).rejects.toThrow("VOICE_ACCESS_REVOKED")
  const roleLost = harness("MANAGER")
  await assertVoiceAttemptActive(roleLost.db as never, "audio", 1)
  roleLost.membership.role = "SUPPORT"
  await expect(
    assertVoiceAttemptActive(roleLost.db as never, "audio", 1),
  ).rejects.toThrow("VOICE_ACCESS_REVOKED")
  const foreign = harness()
  foreign.row.conversation.ownerUserId = "another-user"
  await expect(
    assertVoiceAttemptActive(foreign.db as never, "audio", 1),
  ).rejects.toThrow("VOICE_ACCESS_REVOKED")
  expect(foreign.membershipRead).not.toHaveBeenCalled()
  const expired = harness()
  expired.row.retentionUntil = new Date(0)
  await expect(
    assertVoiceAttemptActive(expired.db as never, "audio", 1),
  ).rejects.toThrow("VOICE_CANCELLED")
  expect(expired.membershipRead).not.toHaveBeenCalled()
  const unrelated = harness("OWNER", "UNSUPPORTED_WORKFLOW")
  await expect(
    assertVoiceAttemptActive(unrelated.db as never, "audio", 1),
  ).rejects.toThrow("VOICE_ACCESS_REVOKED")
})

test("Setup and Product voice retain Owner/Admin purpose restrictions", async () => {
  for (const purpose of ["SETUP", "PRODUCT_CREATE"]) {
    for (const role of ["OWNER", "ADMIN"] as const) {
      const h = harness(role, purpose)
      await expect(
        assertVoiceAttemptActive(h.db as never, "audio", 1),
      ).resolves.toBeUndefined()
    }
    const restricted = harness("CASHIER", purpose)
    await expect(
      assertVoiceAttemptActive(restricted.db as never, "audio", 1),
    ).rejects.toThrow("VOICE_ACCESS_REVOKED")
  }
})

test("already queued files retain canonical purpose restrictions before any processing", async () => {
  for (const kind of ["SPREADSHEET", "TEXT"]) {
    const general = harness()
    general.row.kind = kind
    await expect(
      assertVoiceAttemptActive(general.db as never, "audio", 1),
    ).rejects.toThrow("VOICE_ACCESS_REVOKED")
    expect(general.membershipRead).not.toHaveBeenCalled()
    const setup = harness("OWNER", "SETUP")
    setup.row.kind = kind
    await expect(
      assertVoiceAttemptActive(setup.db as never, "audio", 1),
    ).resolves.toBeUndefined()
  }
})

test("voice allowance reservation locks only a still-retained live processing lease", async () => {
  let active = true
  const query = mock(async (_input: unknown) =>
    active ? [{ tenantId: "tenant", audioBudgetReserved: true }] : [],
  )
  const db = {
    $transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({ $queryRaw: query }),
  }
  expect(await reserveVoiceAudio(db as never, "audio", 10, 2)).toBe(true)
  const statement = query.mock.calls[0]?.[0] as unknown as {
    strings: string[]
    values: unknown[]
  }
  expect(statement.strings.join(" ")).toContain('"retentionUntil" >')
  expect(statement.strings.join(" ")).toContain('"leaseUntil" >')
  expect(statement.strings.join(" ")).toContain("FOR UPDATE")
  expect(
    statement.values.filter((value) => value instanceof Date),
  ).toHaveLength(2)
  active = false
  expect(await reserveVoiceAudio(db as never, "audio", 10, 2)).toBe(false)
})
