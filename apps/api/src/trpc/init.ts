import { type Session, auth, parseCookieHeader } from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import type { TenantContext } from "@ewatrade/db/queries"
import { getActiveTenantForUser } from "@ewatrade/db/queries"
import { TRPCError, initTRPC } from "@trpc/server"
import type { Context } from "hono"
import superjson from "superjson"
import { getRequestTrace } from "../utils/request-trace"
import { safeCompare } from "../utils/safe-compare"

type AuthenticatedSession = Session

export type TRPCContext = {
  db: typeof prisma
  session: AuthenticatedSession | null
  tenantSlug: string | null
  tenantContext: TenantContext | null
  tenantId: string | null
  requestId: string
  cfRay: string | null
  isInternalRequest: boolean
  forcePrimary: boolean
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

  if (!session?.user) {
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
): Promise<TRPCContext> => {
  const { requestId, cfRay } = getRequestTrace(c.req)
  const bearerToken = getBearerToken(
    c.req.header("authorization") ?? c.req.header("x-app-authorization"),
  )
  const cookieSession = await auth.api.getSession({
    headers: c.req.raw.headers,
  })
  const session = cookieSession ?? (await getSessionFromBearer(bearerToken))
  const internalKey = c.req.header("x-internal-key")
  const expectedInternalKey = process.env.INTERNAL_API_KEY
  const requestCookies = parseCookieHeader(c.req.header("cookie"))
  const tenantSlug =
    c.req.header("x-tenant-slug") ??
    requestCookies.get("ewatrade.active_tenant_slug") ??
    null

  return {
    db: prisma,
    session,
    tenantSlug,
    tenantContext: null,
    tenantId: null,
    requestId,
    cfRay,
    isInternalRequest: safeCompare(internalKey, expectedInternalKey),
    forcePrimary: c.req.header("x-force-primary") === "true",
  }
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
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

const withTenantPermissionMiddleware = t.middleware(async (opts) => {
  const { session } = opts.ctx

  if (!session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to continue.",
    })
  }

  const tenantContext =
    opts.ctx.tenantContext ??
    (await getActiveTenantForUser(opts.ctx.db, {
      userId: session.user.id,
      tenantSlug: opts.ctx.tenantSlug,
    }))

  if (!tenantContext) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Tenant not found",
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

export const authenticatedProcedure = publicProcedure.use(requireAuthMiddleware)

export const protectedProcedure = authenticatedProcedure.use(
  withTenantPermissionMiddleware,
)

export const internalProcedure = publicProcedure.use(requireInternalMiddleware)

export const protectedOrInternalProcedure = publicProcedure.use(
  async (opts) => {
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

    const tenantContext =
      opts.ctx.tenantContext ??
      (await getActiveTenantForUser(opts.ctx.db, {
        userId: session.user.id,
        tenantSlug: opts.ctx.tenantSlug,
      }))

    if (!tenantContext) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Tenant not found",
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
  },
)
