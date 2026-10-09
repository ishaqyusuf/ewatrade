import { type Session, auth, parseCookieHeader } from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import { isAccountPrivacyAccessBlocked } from "@ewatrade/db/account-privacy-access"
import { isLegalSignupSessionBlocked } from "@ewatrade/db/legal-session-access"
import {
  tracePhase,
  traceSynchronousPhase,
} from "@ewatrade/db/performance-tracing"
import type { TenantContext } from "@ewatrade/db/queries"
import {
  RetailOpsSubscriptionError,
  getActiveTenantForUser,
  getCustomerAccountAgeStatus,
  validateQaDerivedSession,
} from "@ewatrade/db/queries"
import { toPublicError } from "@ewatrade/errors"
import { dashboardProcedure } from "@ewatrade/events/dashboard-workflows"
import { dashboardCommandId } from "@ewatrade/events/server-dashboard"
import { recordDashboardOutcome } from "@ewatrade/jobs/product-analytics"
import {
  getTrustedPrivacyNetworkSource,
  getTrustedQaNetworkSource,
} from "@ewatrade/utils/qa-network-source"
import { evaluateQaProviderPolicy } from "@ewatrade/utils/qa-provider-policy"
import { TRPCError, initTRPC } from "@trpc/server"
import type { Context } from "hono"
import superjson from "superjson"
import { qaLiveEffectForProcedure } from "../utils/qa-provider-operation"
import { isQaDerivedSessionAllowed } from "../utils/qa-session-access"
import { getRequestTrace } from "../utils/request-trace"
import { safeCompare } from "../utils/safe-compare"
import { scopeStaffRequest } from "../utils/staff-request-access"
import { withStaffWriteTransaction } from "../utils/staff-write-transaction"

type AuthenticatedSession = Session

export type TRPCContext = {
  requestHeaders: Headers
  db: typeof prisma
  session: AuthenticatedSession | null
  tenantSlug: string | null
  tenantContext: TenantContext | null
  tenantId: string | null
  requestId: string
  cfRay: string | null
  isInternalRequest: boolean
  forcePrimary: boolean
  customerConversationCredential?: string | null
  customerConversationInstallation?: string | null
  origin: string | null
  clientIp: string | null
  privacyClientIp: string | null
  userAgent: string | null
  activeStoreId: string | null
  qaSessionScope: {
    membershipId: string
    storeId: string
    tenantId: string
  } | null
}

function getBearerToken(authorization: string | null | undefined) {
  const [scheme, token] = authorization?.split(/\s+/, 2) ?? []

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null
  }

  return token
}

async function getSessionFromBearer(
  bearerToken: string | null,
): Promise<AuthenticatedSession | null> {
  if (!bearerToken) {
    return null
  }

  const session = await prisma.session.findFirst({
    where: {
      expiresAt: { gt: new Date() },
      OR: [{ id: bearerToken }, { token: bearerToken }],
    },
    select: {
      id: true,
      token: true,
      userId: true,
      expiresAt: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatarUrl: true,
          isPlatformAdmin: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  })

  if (
    !session?.user ||
    (await isAccountPrivacyAccessBlocked(prisma, session.userId))
  ) {
    return null
  }

  return {
    session: {
      id: session.id,
      token: session.token,
      userId: session.userId,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
    user: session.user,
  } as AuthenticatedSession
}

export const createTRPCContext = async (
  _: unknown,
  c: Context,
): Promise<TRPCContext> =>
  tracePhase("context", async () => {
    const { requestId, cfRay } = getRequestTrace(c.req)
    const bearerToken = getBearerToken(
      c.req.header("authorization") ?? c.req.header("x-app-authorization"),
    )
    const cookieSession = await tracePhase("auth", () =>
      auth.api.getSession({
        headers: c.req.raw.headers,
      }),
    )
    const candidateSession =
      cookieSession ??
      (await tracePhase("auth", () => getSessionFromBearer(bearerToken)))
    const qaSessionValidation = candidateSession
      ? candidateSession.session.token.startsWith("qas_")
        ? await validateQaDerivedSession(prisma, candidateSession.session.id)
        : { active: true, scope: null }
      : { active: false, scope: null }
    const legalSessionAllowed = candidateSession
      ? !(await isLegalSignupSessionBlocked(prisma, candidateSession.user.id))
      : false
    const session =
      qaSessionValidation.active && legalSessionAllowed
        ? candidateSession
        : null
    const internalKey = c.req.header("x-internal-key")
    const expectedInternalKey = process.env.INTERNAL_API_KEY
    const requestCookies = parseCookieHeader(c.req.header("cookie"))
    const tenantSlug =
      c.req.header("x-tenant-slug") ??
      requestCookies.get("ewatrade.active_tenant_slug") ??
      null

    return {
      requestHeaders: c.req.raw.headers,
      db: prisma,
      session,
      tenantSlug,
      tenantContext: null,
      tenantId: null,
      requestId,
      cfRay,
      isInternalRequest: safeCompare(internalKey, expectedInternalKey),
      forcePrimary: c.req.header("x-force-primary") === "true",
      customerConversationCredential:
        c.req.header("x-store-conversation-credential") ?? null,
      customerConversationInstallation:
        c.req.header("x-store-conversation-installation") ?? null,
      origin: c.req.header("origin") ?? null,
      clientIp: getTrustedQaNetworkSource({
        env: process.env,
        getHeader: (name) => c.req.header(name),
      }),
      privacyClientIp: getTrustedPrivacyNetworkSource({
        env: process.env,
        getHeader: (name) => c.req.header(name),
      }),
      userAgent: c.req.header("user-agent") ?? null,
      activeStoreId:
        c.req.header("x-store-id") ??
        requestCookies.get("ewatrade.active_store_id") ??
        null,
      qaSessionScope: qaSessionValidation.scope,
    }
  })

const t = initTRPC.context<TRPCContext>().create({
  transformer: {
    serialize: (value) =>
      traceSynchronousPhase("serialization", () => superjson.serialize(value)),
    deserialize: (value) => superjson.deserialize(value),
  },
  errorFormatter({ shape, error, ctx }) {
    const appError = {
      ...toPublicError(error),
      requestId: ctx?.requestId,
    }
    return {
      ...shape,
      message: appError.message,
      data: {
        ...shape.data,
        appError,
        stack: undefined,
      },
    }
  },
})

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const mergeRouters = t.mergeRouters

const withTimingMiddleware = t.middleware(async (opts) => {
  const startedAt = performance.now()
  const result = await opts.next()

  if (process.env.DEBUG_PERF === "true") {
    console.info("[perf:trpc]", {
      path: opts.path,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    })
  }

  return result
})

const withPrimaryDbMiddleware = t.middleware(async (opts) => opts.next())

const requireAuthMiddleware = t.middleware(async (opts) => {
  const { session } = opts.ctx

  if (!session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to continue.",
    })
  }

  return opts.next({
    ctx: {
      ...opts.ctx,
      session,
    },
  })
})

const requireGlobalAuthMiddleware = t.middleware(async (opts) => {
  const { session } = opts.ctx
  if (!session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to continue.",
    })
  }
  if (
    !isQaDerivedSessionAllowed(
      "authenticated_global",
      Boolean(opts.ctx.qaSessionScope),
    )
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This QA session is limited to its selected business and Store.",
    })
  }
  return opts.next({ ctx: { ...opts.ctx, session } })
})

async function requireEligibleAccountAge(
  db: TRPCContext["db"],
  userId: string,
) {
  const age = await getCustomerAccountAgeStatus(db, userId)
  if (!age.eligible) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Choose an eligible age range before opening your workspace.",
    })
  }
}

/** Shared by protected tRPC and authenticated byte transports. */
export async function resolveProtectedTenantContext(
  ctx: TRPCContext,
  recoverStoreSelection = false,
) {
  const { session } = ctx

  if (!session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to continue.",
    })
  }

  if (!ctx.tenantContext) {
    await requireEligibleAccountAge(ctx.db, session.user.id)
  }
  const tenantContext =
    ctx.tenantContext ??
    (await getActiveTenantForUser(ctx.db, {
      storeId:
        ctx.qaSessionScope?.storeId ??
        (recoverStoreSelection ? null : ctx.activeStoreId),
      userId: session.user.id,
      tenantSlug: ctx.tenantSlug,
    }))

  if (!tenantContext) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Tenant not found",
    })
  }

  if (
    ctx.qaSessionScope &&
    (tenantContext.tenant.id !== ctx.qaSessionScope.tenantId ||
      tenantContext.membership.id !== ctx.qaSessionScope.membershipId ||
      tenantContext.activeStore?.id !== ctx.qaSessionScope.storeId)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This QA session is scoped to another business or Store.",
    })
  }

  if (tenantContext.tenant.qaPurgeStartedAt) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This QA tenant is being permanently purged.",
    })
  }

  return { ...ctx, session, tenantContext, tenantId: tenantContext.tenant.id }
}

const withTenantPermissionMiddleware = t.middleware(async (opts) => {
  // Directory/context reads repair a revoked Store preference. Operational
  // requests keep the explicit Store and fail instead of switching silently.
  const recover =
    opts.type === "query" &&
    ["tenant.current", "tenant.stores", "tenant.storeContext"].includes(
      opts.path,
    )
  return opts.next({
    ctx: await resolveProtectedTenantContext(opts.ctx, recover),
  })
})

// Outside the staff transaction: next() resolves only after commit has succeeded.
const captureDashboardOutcome = t.middleware(async (opts) => {
  const result = await opts.next()
  if (
    process.env.NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED !== "true" ||
    opts.ctx.requestHeaders.get("x-ewatrade-analytics") !== "allowed" ||
    opts.type !== "mutation" ||
    !result.ok ||
    !opts.ctx.session ||
    opts.ctx.isInternalRequest ||
    !dashboardProcedure(opts.path)
  )
    return result
  try {
    const tenant = opts.ctx.tenantContext?.tenant
    await recordDashboardOutcome({
      headers: opts.ctx.requestHeaders,
      principal: {
        userId: opts.ctx.session.user.id,
        email: opts.ctx.session.user.email,
        internal: opts.ctx.session.user.isPlatformAdmin,
        tenantId: tenant?.id,
        tenantName: tenant?.name,
        dataClassification: tenant?.dataClassification,
        role: opts.ctx.tenantContext?.membership.role,
        qaSession: Boolean(opts.ctx.qaSessionScope),
      },
      path: opts.path,
      output: result.data,
      requestId: opts.ctx.requestId,
      commandId: dashboardCommandId(await opts.getRawInput()),
    })
  } catch {
    /* Optional capture cannot fail a committed business operation. */
  }
  return result
})

const enforceStaffWriteTransaction = t.middleware(async (opts) => {
  if (
    opts.type !== "mutation" ||
    opts.ctx.tenantContext?.staffAccess?.mode !== "SCOPED" ||
    ["OWNER", "ADMIN"].includes(opts.ctx.tenantContext.staffAccess.businessRole)
  )
    return opts.next()
  return withStaffWriteTransaction(opts.ctx, async (ctx) => {
    if (!ctx.tenantContext)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Staff context unavailable.",
      })
    const result = await opts.next({
      ctx: { db: ctx.db, tenantContext: ctx.tenantContext },
    })
    if (!result.ok) throw result.error
    return result
  })
})

const enforceStaffStoreAccess = t.middleware(async (opts) => {
  const raw = await opts.getRawInput()
  const scoped = await scopeStaffRequest(opts.ctx, opts.path, opts.type, raw)
  return opts.next({ getRawInput: async () => scoped })
})

const enforceQaProviderBoundary = t.middleware(async (opts) => {
  const tenant = opts.ctx.tenantContext?.tenant
  const operation = qaLiveEffectForProcedure(opts.path)
  if (!tenant || tenant.dataClassification !== "QA" || !operation) {
    return opts.next()
  }

  const decision = evaluateQaProviderPolicy({
    adapter: "live",
    operation,
    tenantDataClassification: "QA",
  })
  if (decision.allowed) return opts.next()

  const qaSession = opts.ctx.session
    ? await opts.ctx.db.session.findUnique({
        select: { qaAuthorizationId: true },
        where: { id: opts.ctx.session.session.id },
      })
    : null
  await opts.ctx.db.qaAccessAuditEvent.create({
    data: {
      authorizationId: qaSession?.qaAuthorizationId,
      eventType: "provider_operation_blocked",
      metadata: { operation, procedure: opts.path },
      outcome: decision.code,
    },
  })
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: decision.message,
  })
})

// Plan limits and Free-plan feature gates surface as 403s carrying the
// server-authored upgrade text (see @ewatrade/errors PLAN_* codes).
const mapRetailOpsPlanErrors = t.middleware(async (opts) => {
  const result = await opts.next()
  if (!result.ok && result.error.cause instanceof RetailOpsSubscriptionError) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: result.error.cause.message,
      cause: result.error.cause,
    })
  }
  return result
})

const requireInternalMiddleware = t.middleware(async (opts) => {
  if (!opts.ctx.isInternalRequest) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Internal API key is required.",
    })
  }

  return opts.next()
})

export const publicProcedure = t.procedure
  .use(withTimingMiddleware)
  .use(withPrimaryDbMiddleware)

export const authenticatedProcedure = publicProcedure
  .use(requireGlobalAuthMiddleware)
  .use(captureDashboardOutcome)

// Mobile entry may authenticate a derived QA session, but its only consumer
// must read the server-validated scope instead of enumerating global access.
export const mobileEntryProcedure = publicProcedure.use(requireAuthMiddleware)

// Startup must read or declare this session's own age before Tenant access.
// QA-derived sessions use this only for the two Account age endpoints;
// global Account and platform procedures retain their separate restriction.
export const accountAgeProcedure = publicProcedure.use(requireAuthMiddleware)

export const eligibleAccountProcedure = authenticatedProcedure.use(
  async (opts) => {
    await requireEligibleAccountAge(opts.ctx.db, opts.ctx.session.user.id)
    return opts.next()
  },
)

export const platformAdminProcedure = authenticatedProcedure.use(
  async (opts) => {
    if (!opts.ctx.session?.user.isPlatformAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Platform administrator access is required.",
      })
    }

    return opts.next({ ctx: { ...opts.ctx, session: opts.ctx.session } })
  },
)

export const protectedProcedure = publicProcedure
  .use(requireAuthMiddleware)
  .use(withTenantPermissionMiddleware)
  .use(captureDashboardOutcome)
  .use(enforceStaffWriteTransaction)
  .use(enforceStaffStoreAccess)
  .use(enforceQaProviderBoundary)
  .use(mapRetailOpsPlanErrors)

export const internalProcedure = publicProcedure.use(requireInternalMiddleware)

export const protectedOrInternalProcedure = publicProcedure
  .use(async (opts) => {
    if (opts.ctx.isInternalRequest) {
      return opts.next()
    }

    const { session } = opts.ctx

    if (!session) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "You must be signed in to continue.",
      })
    }

    if (!opts.ctx.tenantContext) {
      await requireEligibleAccountAge(opts.ctx.db, session.user.id)
    }

    const tenantContext =
      opts.ctx.tenantContext ??
      (await getActiveTenantForUser(opts.ctx.db, {
        storeId: opts.ctx.qaSessionScope?.storeId ?? opts.ctx.activeStoreId,
        userId: session.user.id,
        tenantSlug: opts.ctx.tenantSlug,
      }))

    if (!tenantContext) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Tenant not found",
      })
    }

    if (
      opts.ctx.qaSessionScope &&
      (tenantContext.tenant.id !== opts.ctx.qaSessionScope.tenantId ||
        tenantContext.membership.id !== opts.ctx.qaSessionScope.membershipId ||
        tenantContext.activeStore?.id !== opts.ctx.qaSessionScope.storeId)
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This QA session is scoped to another business or Store.",
      })
    }

    return opts.next({
      ctx: {
        ...opts.ctx,
        session,
        tenantContext,
        tenantId: tenantContext.tenant.id,
      },
    })
  })
  .use(captureDashboardOutcome)
  .use(enforceStaffWriteTransaction)
  .use(enforceStaffStoreAccess)
  .use(enforceQaProviderBoundary)
  .use(mapRetailOpsPlanErrors)
