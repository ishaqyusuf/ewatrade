import assert from "node:assert/strict"
import type { Session } from "@ewatrade/auth"
import { getActiveTenantForUser } from "@ewatrade/db/tenant-context"
import type { Prisma } from "@ewatrade/db/types"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import {
  field,
  matches,
} from "../../../../../packages/db/src/queries/test-helpers/booking-availability"
import { fixture as decisionFixture } from "../../../../../packages/db/src/queries/test-helpers/commerce-quote-decision"
import { generalBookingDraftFixture } from "../../../../../packages/db/src/queries/test-helpers/general-booking-draft"
import type { GeneralContext } from "../general-context"

export const GENERAL_BOOKING_FRESH_TEST_SIGNING_KEY =
  "INERT_BOOKING_FRESH_SIGNING_KEY_NOT_A_CREDENTIAL_1234"
function project(row: unknown, args: unknown): unknown {
  if (row === null) return null
  const select = field(args, "select")
  if (!select || typeof select !== "object") return structuredClone(row)
  return Object.fromEntries(
    Object.entries(select).map(([name, choice]) => [
      name,
      choice === true
        ? structuredClone(field(row, name))
        : project(field(row, name), choice),
    ]),
  )
}

/** Actual fresh GENERAL guards over inert persistence, not a Session issuer,
 * linked-private-brand/HTTP/SQL/concurrency proof. No canonical module is mocked.
 * Native and fresh selection share the SAME mutable member/Store/Tenant records.
 * The default staging fixture permits only proposal writes; a supplied actual
 * confirmation fixture also permits its canonical writes inside the fresh TX.
 * Separate canonical seed setup is never wrapper-execution evidence.
 * Caller test owns explicit test environment and clock; this fixture changes none.
 */
type FreshBookingBase = Pick<
  ReturnType<typeof generalBookingDraftFixture>,
  "canonical" | "tx"
> & {
  scope: { actorUserId: string; tenantId: string; storeId: string }
}
export async function generalBookingFreshFixture() {
  return generalBookingFreshFixtureFrom(generalBookingDraftFixture())
}
/** Supplied canonical fixture controls whether native commands may write. The
 * default staging fixture remains domain-read-only; confirmation supplies its
 * actual mutable native delegates. All operations remain confined to fresh TX.
 */
export async function generalBookingFreshFixtureFrom<
  T extends FreshBookingBase,
>(f: T) {
  const publication = currentEffectiveLegalPublication()
  if (!publication) throw Error("Expected existing approved legal publication")
  const store = Object.assign(f.canonical.state.store, {
    name: "Inert booking Store",
    slug: "inert-booking-store",
    currencyCode: "NGN",
    metadata: null,
  })
  const tenant = Object.assign(f.canonical.state.tenant, {
    slug: "inert-booking-tenant",
    name: "Inert booking Tenant",
    type: "MERCHANT",
    enabledModes: ["MERCHANT"],
    currencyCode: "NGN",
    timezone: "UTC",
    dataClassification: "QA",
    qaPurgeStartedAt: null,
    metadata: null,
    subscription: null,
    stores: [store],
  })
  const member = f.canonical.state.member
  const user: {
    id: string
    ageBand: string
    createdAt: Date
    accountPrivacyRequests: Array<{ status: string }>
  } = {
    id: f.scope.actorUserId,
    ageBand: "ADULT",
    createdAt: new Date("2098-01-01T00:00:00Z"),
    accountPrivacyRequests: [],
  }
  const session: Session = {
    user: {
      id: user.id,
      name: "Inert booking actor",
      email: "inert-booking@example.invalid",
      emailVerified: true,
      isPlatformAdmin: false,
      createdAt: user.createdAt,
      updatedAt: user.createdAt,
    },
    session: {
      id: "inert-booking-session",
      userId: user.id,
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
    beforeTransaction: (index: number) => Promise<void>
  } = {
    sessionAvailable: true,
    acceptedLegalHash: publication.documentHash,
    failure: null,
    beforeTransaction: async (_index: number) => {},
  }
  const freshReads: Array<{ table: string; method: string; args: unknown }> = []
  const locks: string[] = []
  const transactionOptions: unknown[] = []
  let transactions = 0
  let depth = 0
  let initializing = true
  const requireInside = () => {
    if (!initializing && depth !== 1)
      throw Error("Delegate escaped owning GENERAL transaction")
  }
  const accountDelegates = {
    user: {
      findUnique: async (args: unknown) =>
        project(matches(user, field(args, "where") ?? {}) ? user : null, args),
    },
    session: {
      findFirst: async (args: unknown) =>
        project(
          state.sessionAvailable &&
            matches(session.session, field(args, "where") ?? {})
            ? session.session
            : null,
          args,
        ),
    },
    accountPrivacyRequest: {
      findUnique: async (args: unknown) => {
        if (
          field(field(args, "where"), "requestKey") !==
          `account-deletion:${user.id}`
        )
          throw Error("Wrong privacy subject")
        return project(user.accountPrivacyRequests[0] ?? null, args)
      },
    },
    legalAcceptance: {
      findUnique: async (args: unknown) => {
        const identity = field(field(args, "where"), "userId_version")
        if (
          field(identity, "userId") !== user.id ||
          field(identity, "version") !== publication.version
        )
          throw Error("Wrong legal subject/publication")
        return project(
          state.acceptedLegalHash
            ? { documentHash: state.acceptedLegalHash }
            : null,
          args,
        )
      },
    },
  }
  const tx = new Proxy(f.tx, {
    get(target, table: string) {
      requireInside()
      if (table === "$queryRaw")
        return async (raw: unknown, ...values: unknown[]) => {
          requireInside()
          // Fresh GENERAL uses tagged templates; canonical native locks use
          // Prisma.Sql. Inspect only those string/bind arrays for our own two
          // guards, and preserve the original call for native delegation.
          const strings = Array.isArray(raw) ? raw : field(raw, "strings")
          const parameters = Array.isArray(raw) ? values : field(raw, "values")
          const recognized =
            Array.isArray(strings) &&
            strings.every((part) => typeof part === "string") &&
            Array.isArray(parameters) &&
            strings.length === parameters.length + 1
          const sql = recognized ? strings.join("?") : ""
          const exactParameters = (expected: string[]) =>
            recognized &&
            parameters.length === expected.length &&
            parameters.every((value, index) => value === expected[index])
          if (
            sql.includes('FROM "Membership"') &&
            exactParameters([member.id, f.scope.tenantId, f.scope.actorUserId])
          ) {
            locks.push("Membership")
            return [{ id: member.id }]
          }
          if (
            sql.includes('FROM "Store"') &&
            exactParameters([f.scope.storeId, f.scope.tenantId])
          ) {
            locks.push("Store")
            return [{ id: store.id }]
          }
          const nativeTable = [
            "FinanceBook",
            "CustomerLedgerAccount",
            "CommercialOrder",
            "ServiceBookingResource",
            "ServiceBooking",
            "ServiceJob",
          ].find((name) => sql.includes(`FROM "${name}"`))
          // Forward unchanged to supplied actual native stand-in; the default
          // read-only draft fixture itself refuses any native raw lock.
          const native = Reflect.get(target, "$queryRaw")
          if (typeof native !== "function")
            throw Error("Native lock unavailable")
          const result = await Reflect.apply(native, target, [raw, ...values])
          locks.push(nativeTable ?? "Native")
          return result
        }
      if (table.startsWith("$"))
        throw Error(`Forbidden nested/root delegate ${table}`)
      const delegate =
        Reflect.get(accountDelegates, table) ?? Reflect.get(target, table)
      return new Proxy(delegate, {
        get(_target, method: string) {
          requireInside()
          const callable = Reflect.get(delegate, method)
          if (typeof callable !== "function")
            throw Error(`Unexpected delegate ${table}.${method}`)
          return (...args: unknown[]) => {
            requireInside()
            if (table === "assistantActionProposal" && state.failure)
              throw state.failure
            freshReads.push({ table, method, args: args[0] })
            return Reflect.apply(callable, delegate, args)
          }
        },
      })
    },
  })
  const db = new Proxy(decisionFixture().root, {
    get(_target, name) {
      if (name !== "$transaction")
        throw Error(`Unexpected root access ${String(name)}`)
      return async (
        run: (current: Prisma.TransactionClient) => Promise<unknown>,
        options: unknown,
      ) => {
        if (depth) throw Error("Nested GENERAL transaction")
        assert.deepStrictEqual(options, {
          isolationLevel: "Serializable",
          maxWait: 10_000,
          timeout: 30_000,
        })
        transactionOptions.push(structuredClone(options))
        await state.beforeTransaction(transactions + 1)
        if (depth) throw Error("Nested GENERAL transaction after test control")
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
    userId: user.id,
    tenantSlug: tenant.slug,
    storeId: store.id,
  })
  if (!tenantContext)
    throw Error("Expected actual inert tenant selector result")
  const ctx: GeneralContext = {
    db,
    session,
    tenantContext,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    activeStoreId: store.id,
    requestHeaders: new Headers(),
    requestId: "inert-booking-fresh",
    cfRay: null,
    isInternalRequest: false,
    forcePrimary: false,
    origin: null,
    clientIp: null,
    privacyClientIp: null,
    userAgent: null,
    qaSessionScope: null,
  }
  freshReads.length = 0
  initializing = false
  return {
    ...f,
    tx,
    ctx,
    session,
    user,
    member,
    store,
    tenant,
    state,
    publication,
    freshReads,
    locks,
    transactionOptions,
    counters: () => ({ transactions, depth }),
  }
}
