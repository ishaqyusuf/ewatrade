import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import type { PrismaClient } from "../../generated/prisma/client"
import { startStoreConversationServiceRequest } from "./store-conversation-service-start"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

type Row = Record<string, unknown>
type Query = { where?: Row; select?: Row; data?: Row }

function record(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value))
}

/** Only the predicates used by these real repository calls; unsupported ones fail closed. */
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "AND")
      return (
        Array.isArray(expected) &&
        expected.every((part) => matches(row, record(part)))
      )
    if (key === "OR")
      return (
        Array.isArray(expected) &&
        expected.some((part) => matches(row, record(part)))
      )
    const actual = row[key]
    if (expected === null || typeof expected !== "object")
      return actual === expected
    const conditions = record(expected)
    if ("isNot" in conditions)
      return conditions.isNot === null
        ? actual !== null && actual !== undefined
        : !matches(record(actual), record(conditions.isNot))
    if ("in" in conditions)
      return Array.isArray(conditions.in) && conditions.in.includes(actual)
    if ("gt" in conditions || "lte" in conditions) {
      if (!(actual instanceof Date)) return false
      return Object.entries(conditions).every(([operator, boundary]) => {
        if (!(boundary instanceof Date)) return false
        return operator === "gt"
          ? actual > boundary
          : operator === "lte" && actual <= boundary
      })
    }
    if ("some" in conditions)
      return (
        Array.isArray(actual) &&
        actual.some((part) => matches(record(part), record(conditions.some)))
      )
    return matches(record(actual), conditions)
  })
}

const input = {
  clientOperationId: "structured-start-transaction-1",
  conversationId: "conversation-1",
  credentialToken: "synthetic-guest-device-token",
  publicToken: "synthetic-public-entry-token-at-least-32-characters",
  customerName: "QA Customer",
  customerEmail: "customer@ishaq.qa.test",
  details: "Two shirts for washing",
  lines: [{ offeringId: "offering-1", quantity: "2" }],
}
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/**
 * All production helpers execute. Only Prisma persistence is replaced. Each
 * transaction uses a private snapshot and commits only on success; external
 * revocation facts intentionally survive a rollback. This is no PostgreSQL
 * concurrency/constraint acceptance claim, and no module/global mocks are used.
 */
function fixture() {
  const publication = currentEffectiveLegalPublication()
  if (!publication)
    throw new Error("A current legal publication is required by this fixture")
  const authority = {
    entryRevision: 1,
    paused: false,
    formOfferingPresent: true,
    offeringAvailable: true,
    accountAccess: true,
    accountTerms: true,
    accountAgeBand: "ADULT",
  }
  let persisted = {
    requests: [] as Row[],
    lines: [] as Row[],
    messages: [] as Row[],
    links: [] as Row[],
    audits: [] as Row[],
    policyAudits: [] as Row[],
    conversation: {
      id: input.conversationId,
      tenantId: "tenant-1",
      storeId: "store-1",
      guestIdentityId: "guest-1",
      guestAccesses: [],
      customerBlockedAt: null,
      moderationState: "CLEAR",
      lastMessageSequence: 0,
      lifecycle: "ACTIVE",
      store: { name: "QA Laundry" },
    } as Row,
  }
  let pendingLock: {
    entered: ReturnType<typeof deferred>
    released: ReturnType<typeof deferred>
  } | null = null
  let attemptedRequests = 0
  const reads: string[] = []

  function createTransaction(state: typeof persisted) {
    const form = () => ({
      id: "form-1",
      tenantId: "tenant-1",
      storeId: "store-1",
      status: "ACTIVE",
      activeFrom: null,
      expiresAt: null,
      label: "Laundry request",
      store: { name: "QA Laundry", currencyCode: "NGN" },
      // A FormOffering row ID is deliberately different from its Offering ID.
      offerings: authority.formOfferingPresent
        ? [
            {
              id: "join-row-1",
              requestFormId: "form-1",
              offeringId: "offering-1",
              offering: {
                id: "offering-1",
                tenantId: "tenant-1",
                name: "Shirt",
                status: "ACTIVE",
                archivedAt: null,
                fixedPriceMinor: 20000,
                pricingPolicy: "FIXED",
                currencyCode: "NGN",
                catalogItem: {
                  name: "Laundry",
                  status: "ACTIVE",
                  archivedAt: null,
                },
                variant: {
                  name: "Shirt",
                  status: "ACTIVE",
                  archivedAt: null,
                  selections: [],
                },
                storeAvailability: [
                  {
                    storeId: "store-1",
                    isAvailable: authority.offeringAvailable,
                  },
                ],
                serviceOffering: { quantityScale: 0, guidance: null },
              },
            },
          ]
        : [],
    })
    const tx = {
      user: {
        findUnique: async () => ({
          id: "account-1",
          ageBand: authority.accountAgeBand,
        }),
      },
      legalAcceptance: {
        findUnique: async () =>
          authority.accountTerms
            ? { documentHash: publication.documentHash }
            : null,
      },
      storeConversationAccountAccess: {
        findFirst: async ({ where }: Query) => {
          const access = {
            id: "account-access-1",
            accountUserId: "account-1",
            conversationId: input.conversationId,
            tenantId: "tenant-1",
            storeId: "store-1",
            status: "ACTIVE",
            conversation: state.conversation,
          }
          return authority.accountAccess && matches(access, where)
            ? access
            : null
        },
      },
      $queryRaw: async (query: { values?: unknown[] }) => {
        expect(query.values).toEqual([
          input.conversationId,
          "tenant-1",
          "store-1",
        ])
        reads.push("lock:waiting")
        const lock = pendingLock
        if (lock) {
          pendingLock = null
          lock.entered.resolve()
          await lock.released.promise
        }
        reads.push("lock:acquired")
        return [{ id: input.conversationId }]
      },
      storeConversationGuestCredential: {
        findFirst: async ({ where }: Query) => {
          const credential = {
            id: "credential-1",
            guestIdentityId: "guest-1",
            tokenDigest: digest(input.credentialToken),
            status: "ACTIVE",
            purpose: "WEB_DEVICE",
            expiresAt: new Date("2035-01-01"),
            guestIdentity: { id: "guest-1", status: "ACTIVE" },
          }
          return matches(credential, where) ? credential : null
        },
      },
      storeConversationGuestLegalAcceptance: {
        findUnique: async ({ where }: Query) =>
          matches(
            {
              guestIdentityId_version: {
                guestIdentityId: "guest-1",
                version: publication.version,
              },
            },
            where,
          )
            ? { documentHash: publication.documentHash }
            : null,
      },
      storeConversationGuestIdentity: {
        findUnique: async () => ({ ageBand: "ADULT" }),
      },
      customerEntryPoint: {
        findFirst: async ({ where }: Query) => {
          reads.push(`entry:revision:${authority.entryRevision}`)
          const entry = {
            id: "entry-1",
            revision: authority.entryRevision,
            status: "PUBLISHED",
            tenantId: "tenant-1",
            storeId: "store-1",
            store: { name: "QA Laundry" },
            publicTokenDigest: digest(input.publicToken),
          }
          return matches(entry, where) ? entry : null
        },
      },
      store: {
        findFirst: async ({ where }: Query) => {
          const store = {
            id: "store-1",
            tenantId: "tenant-1",
            status: "ACTIVE",
            countryCode: "NG",
            prescriptionChannel: null,
            prescriptionRoles: [],
            prescriptionSettings: null,
            serviceCommercePolicyDecisions:
              allowedServiceCommercePolicyDecisionRows(),
            serviceCommerceProfile: {
              status: "ACTIVE",
              intakeEnabled: true,
              webEnabled: true,
              whatsappEnabled: false,
            },
            serviceCommerceStoreTeamAssignments: [{ id: "attendant-1" }],
            serviceRequestForms: [{ id: "form-1" }],
            storeConversationAvailabilityConfiguration: {
              customerWording: "TEMPORARILY_UNAVAILABLE",
              manualPaused: authority.paused,
              pausedAt: null,
              revision: 1,
              timezone: "Africa/Lagos",
              unreadNotificationGraceSeconds: 30,
              weeklyHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                dayOfWeek,
                startMinute: 0,
                endMinute: 1440,
              })),
            },
            storeConversationChannelConfiguration: {
              desiredMode: "EWATRADE_CHAT",
              revision: 1,
            },
            tenant: { timezone: "Africa/Lagos" },
            whatsappStoreBindings: [],
          }
          return matches(store, where) ? store : null
        },
      },
      serviceCommercePolicyDecision: {
        findMany: async () => allowedServiceCommercePolicyDecisionRows(),
      },
      serviceCommercePolicyAuditEvent: {
        createMany: async ({ data }: { data: Row[] }) => {
          state.policyAudits.push(...data)
          return { count: data.length }
        },
      },
      serviceRequestForm: {
        findFirst: async ({ where, select }: Query) => {
          const current = form()
          if (!matches(current, where)) return null
          if (!select) return current
          const query = record(select.offerings)
          return {
            offerings: current.offerings.filter((row) =>
              matches(row, record(query.where)),
            ),
          }
        },
      },
      serviceRequest: {
        findFirst: async ({ where }: Query) =>
          state.requests.find((row) => matches(row, where)) ?? null,
        create: async ({ data }: { data: Row }) => {
          attemptedRequests++
          const request = {
            ...data,
            id: `request-${state.requests.length + 1}`,
            revision: 1,
          }
          state.requests.push(request)
          return request
        },
      },
      serviceRequestLine: {
        create: async ({ data }: { data: Row }) => {
          state.lines.push(data)
          return data
        },
      },
      storeConversation: {
        findFirst: async ({ where }: Query) =>
          matches(state.conversation, where) ? state.conversation : null,
        findUniqueOrThrow: async () => state.conversation,
        update: async ({ data }: { data: Row }) => {
          Object.assign(state.conversation, data)
          return state.conversation
        },
      },
      storeConversationMessage: {
        create: async ({ data }: { data: Row }) => {
          const message = {
            ...data,
            id: `message-${state.messages.length + 1}`,
          }
          state.messages.push(message)
          return message
        },
      },
      storeConversationRequestLink: {
        findFirst: async ({ where }: Query) =>
          state.links.find((row) => matches(row, where)) ?? null,
        create: async ({ data }: { data: Row }) => {
          state.links.push(data)
          return data
        },
      },
      storeConversationAuditEvent: {
        create: async ({ data }: { data: Row }) => {
          state.audits.push(data)
          return data
        },
      },
    }
    return tx
  }

  const client = {
    $transaction: async <T>(
      run: (tx: ReturnType<typeof createTransaction>) => Promise<T>,
    ) => {
      const state = structuredClone(persisted)
      const result = await run(createTransaction(state))
      persisted = state
      return result
    },
  }
  return {
    db: client as unknown as PrismaClient,
    authority,
    reads,
    state: () => structuredClone(persisted),
    attemptedRequests: () => attemptedRequests,
    holdNextConversationLock() {
      const lock = { entered: deferred(), released: deferred() }
      pendingLock = lock
      return { entered: lock.entered.promise, release: lock.released.resolve }
    },
  }
}

describe("structured Service Request transaction", () => {
  const { credentialToken: _credential, ...customerInput } = input
  const accountInput = { ...customerInput, accountUserId: "account-1" }

  test("account authority creates and replays the same canonical request", async () => {
    const f = fixture()
    expect(
      await startStoreConversationServiceRequest(f.db, accountInput),
    ).toMatchObject({ created: true })
    expect(
      await startStoreConversationServiceRequest(f.db, accountInput),
    ).toMatchObject({ created: false })
    expect(f.state().requests).toHaveLength(1)
    expect(f.state().messages).toHaveLength(1)
    expect(f.state().links).toHaveLength(1)
    await expect(
      startStoreConversationServiceRequest(f.db, {
        ...accountInput,
        accountUserId: "foreign-account",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  test.each(["access", "terms", "age"])(
    "account %s revoked during lock wait rolls back intake",
    async (revoked) => {
      const f = fixture()
      const lock = f.holdNextConversationLock()
      const outcome = startStoreConversationServiceRequest(
        f.db,
        accountInput,
      ).then(
        () => null,
        (error) => error,
      )
      await lock.entered
      if (revoked === "access") f.authority.accountAccess = false
      if (revoked === "terms") f.authority.accountTerms = false
      if (revoked === "age") f.authority.accountAgeBand = "UNDECLARED"
      lock.release()
      expect(await outcome).toMatchObject({
        code: revoked === "access" ? "NOT_FOUND" : "NOT_READY",
      })
      for (const rows of [
        f.state().requests,
        f.state().lines,
        f.state().messages,
        f.state().links,
        f.state().audits,
      ])
        expect(rows).toHaveLength(0)
      expect(f.state().conversation.lastMessageSequence).toBe(0)
    },
  )
  test("commits canonical request, line, one system event and linked conversation activity together", async () => {
    const f = fixture()
    const result = await startStoreConversationServiceRequest(f.db, input)
    expect(result).toMatchObject({ created: true, id: "request-1" })
    const state = f.state()
    expect(state.requests).toHaveLength(1)
    expect(state.lines).toMatchObject([
      {
        requestId: "request-1",
        offeringId: "offering-1",
        requestedQuantity: "2",
      },
    ])
    expect(state.messages).toMatchObject([
      {
        authorKind: "SYSTEM",
        kind: "SYSTEM_EVENT",
        channel: "WEB",
        sequence: 1,
      },
    ])
    expect(state.messages).toHaveLength(1)
    expect(state.links).toMatchObject([
      {
        sourceId: "request-1",
        messageId: "message-1",
        kind: "SERVICE_REQUEST",
      },
    ])
    expect(state.audits).toHaveLength(1)
    expect(state.conversation.lastMessageSequence).toBe(1)
    expect(state.conversation.responseDueAt).toBeInstanceOf(Date)
  })

  test("an identical replay returns the original request without another event/link/sequence", async () => {
    const f = fixture()
    await startStoreConversationServiceRequest(f.db, input)
    const result = await startStoreConversationServiceRequest(f.db, input)
    expect(result).toMatchObject({ created: false, id: "request-1" })
    expect(f.attemptedRequests()).toBe(1)
    for (const rows of [
      f.state().requests,
      f.state().lines,
      f.state().messages,
      f.state().links,
      f.state().audits,
    ])
      expect(rows).toHaveLength(1)
    expect(f.state().conversation.lastMessageSequence).toBe(1)
  })

  test("a changed payload cannot reuse the prior operation ID", async () => {
    const f = fixture()
    await startStoreConversationServiceRequest(f.db, input)
    const { policyAudits: beforeReadAudits, ...before } = f.state()
    await expect(
      startStoreConversationServiceRequest(f.db, {
        ...input,
        lines: [{ offeringId: "offering-1", quantity: "3" }],
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
    expect(f.attemptedRequests()).toBe(1)
    const { policyAudits: afterReadAudits, ...after } = f.state()
    // Authorized preflight reads can append READ audits; no business write may change.
    expect(after).toEqual(before)
    expect(afterReadAudits.length).toBeGreaterThanOrEqual(
      beforeReadAudits.length,
    )
  })

  test.each([
    "channel pause",
    "entry revision",
    "form offering",
    "offering availability",
  ])(
    "%s revoked while waiting for the lock rolls back the staged request and line",
    async (revocation) => {
      const f = fixture()
      const lock = f.holdNextConversationLock()
      // Attach rejection handling immediately, before releasing the simulated lock.
      const outcome = startStoreConversationServiceRequest(f.db, input).then(
        () => null,
        (error) => error,
      )
      await lock.entered
      expect(f.attemptedRequests()).toBe(1)
      expect(f.state().requests).toHaveLength(0)
      if (revocation === "channel pause") f.authority.paused = true
      if (revocation === "entry revision") f.authority.entryRevision++
      if (revocation === "form offering")
        f.authority.formOfferingPresent = false
      if (revocation === "offering availability")
        f.authority.offeringAvailable = false
      lock.release()
      expect(await outcome).toMatchObject({
        code:
          revocation === "channel pause"
            ? "STORE_UNAVAILABLE"
            : revocation === "entry revision"
              ? "CONFLICT"
              : "NOT_READY",
      })
      const state = f.state()
      for (const rows of [
        state.requests,
        state.lines,
        state.messages,
        state.links,
        state.audits,
      ])
        expect(rows).toHaveLength(0)
      expect(state.conversation.lastMessageSequence).toBe(0)
      expect(f.reads.slice(f.reads.indexOf("lock:acquired") + 1)).toContain(
        `entry:revision:${f.authority.entryRevision}`,
      )
    },
  )
})
