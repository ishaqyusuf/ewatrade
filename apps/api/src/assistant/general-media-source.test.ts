import { afterAll, expect, spyOn, test } from "bun:test"
import type { Session } from "@ewatrade/auth"
import { getActiveTenantForUser } from "@ewatrade/db/tenant-context"
import type { Prisma } from "@ewatrade/db/types"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import { assistantGeneralMediaSourceFixture } from "../../../../packages/db/src/queries/test-helpers/assistant-general-media-source"
import { fixture as decisionFixture } from "../../../../packages/db/src/queries/test-helpers/commerce-quote-decision"
import type { GeneralContext } from "./general-context"
import { readGeneralMediaSource } from "./general-media-source"

const network = spyOn(globalThis, "fetch").mockRejectedValue(
  Error("No network/provider in inert source fixture"),
)
afterAll(() => network.mockRestore())

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object"
    ? Reflect.get(value, key)
    : undefined
}
async function environment(run: () => Promise<void>) {
  const saved = {
    APP_ENV: process.env.APP_ENV,
    ASSISTANT_APPROVAL_SIGNING_KEY: process.env.ASSISTANT_APPROVAL_SIGNING_KEY,
  }
  process.env.APP_ENV = "production"
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY =
    "INERT_TEST_ONLY_SIGNING_KEY_NOT_A_CREDENTIAL_1234"
  try {
    await run()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
}
/** Actual fresh GENERAL wrapper + canonical tenant/age/privacy/legal reads +
 * actual media resolver, with predicate/projection-aware persistence stand-ins.
 * This is NOT HTTP middleware, a genuine Session issuer, actual membership or
 * SQL authority/concurrency proof. No canonical function/module is mocked.
 */
async function fixture() {
  const f = assistantGeneralMediaSourceFixture()
  const publication = currentEffectiveLegalPublication()
  if (!publication)
    throw Error(
      "Expected existing approved legal publication for gate regression",
    )
  const store = Object.assign(f.store, {
    name: "Inert Store",
    slug: "inert-store",
    currencyCode: "NGN",
    metadata: null,
  })
  const tenant = Object.assign(f.tenant, {
    slug: "inert-tenant",
    name: "Inert Tenant",
    type: "MERCHANT",
    enabledModes: ["MERCHANT"],
    currencyCode: "NGN",
    timezone: "UTC",
    dataClassification: "QA",
    metadata: null,
    subscription: null,
    stores: [store],
  })
  const user = Object.assign(f.user, {
    ageBand: "ADULT",
    createdAt: new Date("2098-01-01T00:00:00Z"),
  })
  const session: Session = {
    user: {
      id: f.scope.userId,
      name: "Inert actor",
      email: "inert@example.invalid",
      emailVerified: true,
      isPlatformAdmin: false,
      createdAt: user.createdAt,
      updatedAt: user.createdAt,
    },
    session: {
      id: "session-1",
      userId: f.scope.userId,
      token: "INERT_SESSION_NOT_A_REAL_CREDENTIAL",
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      createdAt: user.createdAt,
      updatedAt: user.createdAt,
    },
  }
  const state: {
    sessionAvailable: boolean
    acceptedLegalHash: string
    failure: Error | null
  } = {
    sessionAvailable: true,
    acceptedLegalHash: publication.documentHash,
    failure: null,
  }
  const reads: Array<{ table: string; method: string; args: unknown }> = []
  const locks: string[] = []
  let transactions = 0
  let depth = 0
  let initializing = true
  const tx = new Proxy(f.tx, {
    get(target, table: string) {
      if (!initializing && depth !== 1)
        throw Error("Read escaped the owning transaction")
      if (table === "$queryRaw")
        return async (strings: TemplateStringsArray, ...values: unknown[]) => {
          if (depth !== 1) throw Error("Lock outside the owning transaction")
          const sql = strings.join("?")
          if (
            sql.includes('FROM "Membership"') &&
            values.join("|") ===
              [f.member.id, f.scope.tenantId, f.scope.userId].join("|")
          ) {
            locks.push("Membership")
            return [{ id: f.member.id }]
          }
          if (
            sql.includes('FROM "Store"') &&
            values.join("|") === [f.scope.storeId, f.scope.tenantId].join("|")
          ) {
            locks.push("Store")
            return [{ id: f.store.id }]
          }
          throw Error("Unexpected raw query")
        }
      if (table === "user")
        return new Proxy(target.user, {
          get(delegate, method: string) {
            if (method === "findUnique")
              return async (args: unknown) => {
                reads.push({ table, method, args })
                return Reflect.apply(delegate.findFirst, delegate, [args])
              }
            return Reflect.get(delegate, method)
          },
        })
      if (
        ["session", "accountPrivacyRequest", "legalAcceptance"].includes(table)
      )
        return new Proxy(
          {},
          {
            get(_delegate, method: string) {
              return async (args: unknown) => {
                if (
                  method !== (table === "session" ? "findFirst" : "findUnique")
                )
                  throw Error(`Forbidden ${table}.${method}`)
                reads.push({ table, method, args })
                const where = field(args, "where")
                if (table === "session") {
                  const minimum = field(field(where, "expiresAt"), "gt")
                  return state.sessionAvailable &&
                    field(where, "id") === session.session.id &&
                    field(where, "userId") === f.scope.userId &&
                    minimum instanceof Date &&
                    session.session.expiresAt > minimum
                    ? { id: session.session.id }
                    : null
                }
                if (table === "accountPrivacyRequest") {
                  if (
                    field(where, "requestKey") !==
                    `account-deletion:${f.scope.userId}`
                  )
                    throw Error("Wrong privacy subject")
                  return user.accountPrivacyRequests[0] ?? null
                }
                const identity = field(where, "userId_version")
                if (
                  field(identity, "userId") !== f.scope.userId ||
                  field(identity, "version") !== publication.version
                )
                  throw Error("Wrong legal subject/publication")
                return state.acceptedLegalHash
                  ? { documentHash: state.acceptedLegalHash }
                  : null
              }
            },
          },
        )
      if (table === "assistantAttachment" && state.failure) throw state.failure
      return Reflect.get(target, table)
    },
  })
  const db = new Proxy(decisionFixture().root, {
    get(_target, key) {
      if (key !== "$transaction")
        throw Error(`Unexpected root access ${String(key)}`)
      return async (
        run: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options: unknown,
      ) => {
        if (depth) throw Error("Nested transaction")
        expect(options).toEqual({
          isolationLevel: "Serializable",
          maxWait: 10_000,
          timeout: 30_000,
        })
        transactions++
        depth++
        try {
          return await run(tx)
        } finally {
          depth--
        }
      }
    },
  })
  const tenantContext = await getActiveTenantForUser(tx, {
    userId: f.scope.userId,
    tenantSlug: tenant.slug,
    storeId: store.id,
  })
  if (!tenantContext) throw Error("Expected inert current context")
  const ctx: GeneralContext = {
    db,
    session,
    tenantContext,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    activeStoreId: store.id,
    requestHeaders: new Headers(),
    requestId: "inert-media-read",
    cfRay: null,
    isInternalRequest: false,
    forcePrimary: false,
    origin: null,
    clientIp: null,
    privacyClientIp: null,
    userAgent: null,
    qaSessionScope: null,
  }
  f.reads.length = 0
  initializing = false
  return {
    ...f,
    ctx,
    user,
    session,
    state,
    reads,
    sourceReads: f.reads,
    locks,
    tenant,
    counters: () => ({ transactions, depth }),
    input: {
      conversationId: f.conversation.id,
      messageId: f.message.id,
      source: {
        kind: "attachment",
        partIndex: 1,
        attachmentId: f.attachment.id,
      },
    },
  }
}

test("actual fresh GENERAL transaction and DB resolver return exact private original in one owning TX", () =>
  environment(async () => {
    const f = await fixture()
    const result = await readGeneralMediaSource(f.ctx, f.input)
    expect(result.origin).toEqual({
      actorUserId: f.scope.userId,
      tenantId: f.scope.tenantId,
      storeId: f.scope.storeId,
      conversationId: f.conversation.id,
    })
    expect(result.messageId).toBe(f.message.id)
    expect(result.kind).toBe("attachment")
    expect(f.counters()).toEqual({ transactions: 1, depth: 0 })
    expect(f.locks).toEqual(["Membership", "Store"])
    expect(f.reads.map((r) => r.table)).toEqual([
      "session",
      "user",
      "accountPrivacyRequest",
      "user",
      "legalAcceptance",
    ])
    expect(f.reads.find((r) => r.table === "session")?.args).toMatchObject({
      where: {
        id: f.session.session.id,
        userId: f.scope.userId,
        expiresAt: { gt: expect.any(Date) },
      },
    })
    expect(
      f.reads.find((r) => r.table === "accountPrivacyRequest")?.args,
    ).toMatchObject({
      where: { requestKey: `account-deletion:${f.scope.userId}` },
    })
    expect(f.denied).toEqual([])
    expect(
      f.sourceReads.find((r) => r.table === "assistantAttachment")?.args,
    ).toMatchObject({
      where: {
        actorUserId: f.scope.userId,
        tenantId: f.scope.tenantId,
        storeId: f.scope.storeId,
        messageId: f.message.id,
        conversationId: f.conversation.id,
      },
    })
    expect(network).not.toHaveBeenCalled()
    for (const secret of [
      "INERT_SESSION",
      "PRIVATE_PATH",
      "PRIVATE_NAME",
      "approvalToken",
      "storageProvider",
      "acceptedLegalHash",
    ])
      expect(JSON.stringify(result)).not.toContain(secret)
  }))
test("actual GENERAL opaque message identity is preserved without normalization or navigation interpretation", () =>
  environment(async () => {
    const f = await fixture()
    const id = "原始 message /?"
    f.message.id = id
    f.attachment.messageId = id
    const result = await readGeneralMediaSource(f.ctx, {
      ...f.input,
      messageId: id,
    })
    expect(result.messageId).toBe(id)
    expect(result.origin.conversationId).toBe(f.conversation.id)
    expect(network).not.toHaveBeenCalled()
  }))
test("strict identity-only input refuses scope/time/digest/URL and nested extras before transaction", () =>
  environment(async () => {
    const f = await fixture()
    for (const extra of [
      { actorUserId: "foreign" },
      { tenantId: "foreign" },
      { storeId: "foreign" },
      { scope: f.scope },
      { now: new Date() },
      { contentDigest: "a".repeat(64) },
      { storageUrl: "https://private.invalid" },
    ])
      await expect(
        readGeneralMediaSource(f.ctx, { ...f.input, ...extra }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Choose the exact original assistant source.",
      })
    await expect(
      readGeneralMediaSource(f.ctx, {
        ...f.input,
        source: { ...f.input.source, actorUserId: "foreign" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(f.counters().transactions).toBe(0)
    expect(f.reads).toEqual([])
    expect(f.sourceReads.some((r) => r.table.startsWith("assistant"))).toBe(
      false,
    )
  }))
test("expired or revoked persisted Session refuses before any source read", () =>
  environment(async () => {
    for (const change of ["expired", "revoked"]) {
      const f = await fixture()
      if (change === "expired") f.session.session.expiresAt = new Date(0)
      else f.state.sessionAvailable = false
      await expect(
        readGeneralMediaSource(f.ctx, f.input),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
      expect(f.reads.some((r) => r.table === "session")).toBe(true)
      expect(f.reads.some((r) => r.table === "legalAcceptance")).toBe(false)
      expect(f.sourceReads.every((r) => !r.table.startsWith("assistant"))).toBe(
        true,
      )
      expect(f.reads.filter((r) => r.table === "session")).toHaveLength(1)
      expect(f.reads).toHaveLength(1)
      expect(f.sourceReads.some((r) => r.table === "assistantAttachment")).toBe(
        false,
      )
    }
  }))
test("actual age/privacy/legal helpers refuse stale account facts before original source", () =>
  environment(async () => {
    for (const change of ["age", "privacy", "legal"]) {
      const f = await fixture()
      if (change === "age") f.user.ageBand = "UNDECLARED"
      if (change === "privacy")
        f.user.accountPrivacyRequests.push({ status: "PROCESSING" })
      if (change === "legal")
        f.state.acceptedLegalHash = "wrong-publication-hash"
      await expect(
        readGeneralMediaSource(f.ctx, f.input),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      expect(f.sourceReads.some((r) => r.table === "assistantAttachment")).toBe(
        false,
      )
      expect(f.reads.some((r) => r.table === "user")).toBe(true)
      expect(f.sourceReads.some((r) => r.table.startsWith("assistant"))).toBe(
        false,
      )
      expect(f.counters().transactions).toBe(1)
      expect(f.reads.length).toBeGreaterThan(0)
    }
  }))
test("fresh canonical Store/role/grant resolution refuses stale optimistic context", () =>
  environment(async () => {
    for (const change of ["store", "role", "grant"]) {
      const f = await fixture()
      if (change === "store") f.store.status = "INACTIVE"
      if (change === "role") f.member.role = "SUPPORT"
      if (change === "grant") {
        f.member.role = "CASHIER"
        f.member.staffAccessMode = "SCOPED"
        f.member.staffStoreAssignments.length = 0
      }
      await expect(
        readGeneralMediaSource(f.ctx, f.input),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      expect(f.sourceReads.some((r) => r.table.startsWith("assistant"))).toBe(
        false,
      )
      expect(f.reads.some((r) => r.table === "session")).toBe(true)
    }
  }))
test("canonical exact source denial maps generic NOT_FOUND; persisted access denial maps generic FORBIDDEN", () =>
  environment(async () => {
    const missing = await fixture()
    missing.attachment.messageId = "other-sent-message"
    await expect(
      readGeneralMediaSource(missing.ctx, missing.input),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "This original assistant source is unavailable.",
    })
    const revoked = await fixture()
    revoked.member.staffAccessRevision = 0
    await expect(
      readGeneralMediaSource(revoked.ctx, revoked.input),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "This original assistant source is unavailable.",
    })
  }))
test("request snapshot survives caller edit while fresh checks await; reader never retries an unexpected storage error", () =>
  environment(async () => {
    const f = await fixture()
    const request = { ...f.input, source: { ...f.input.source } }
    const pending = readGeneralMediaSource(f.ctx, request)
    request.messageId = "caller-edited"
    request.source.attachmentId = "caller-edited"
    expect((await pending).messageId).toBe(f.message.id)
    const failed = await fixture()
    failed.state.failure = Error("inert delegate failure")
    await expect(
      readGeneralMediaSource(failed.ctx, failed.input),
    ).rejects.toThrow("inert delegate failure")
    expect(failed.counters()).toEqual({ transactions: 1, depth: 0 })
  }))
