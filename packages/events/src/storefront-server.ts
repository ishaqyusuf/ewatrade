import { createHmac } from "node:crypto"
import { attributedBatchSchema } from "./attributed-contract"
import { safeBatch } from "./policy"
import { readBatchBody } from "./read-batch-body"

export const storefrontProject = "ewatrade-storefront"
export const storefrontEvents = new Set([
  "site_visit",
  "page_view",
  "storefront_item_viewed",
  "storefront_whatsapp_clicked",
  "storefront_request_started",
  "storefront_request_submitted",
  "storefront_link_shared",
  "storefront_backlink_clicked",
])

export type StorefrontAnalyticsMerchant = { tenantId: string; name: string }
type Environment = {
  NODE_ENV?: string
  APP_ENV?: string
  VERCEL?: string
  VERCEL_ENV?: string
  NEXT_PUBLIC_LOGLY_STOREFRONT_ENABLED?: string
  LOGLY_STOREFRONT_ENABLED?: string
  LOGLY_STOREFRONT_PROJECT_KEY?: string
  LOGLY_COLLECTOR_URL?: string
  LOGLY_IDENTITY_SECRET?: string
}

/** Local/Preview must never reach the collector, even with inherited credentials. */
export function storefrontCollectionEnabled(env: Environment) {
  return (
    env.NODE_ENV === "production" &&
    env.APP_ENV === "production" &&
    env.VERCEL === "1" &&
    env.VERCEL_ENV === "production" &&
    env.LOGLY_STOREFRONT_ENABLED === "true" &&
    env.NEXT_PUBLIC_LOGLY_STOREFRONT_ENABLED === "true" &&
    Boolean(
      env.LOGLY_STOREFRONT_PROJECT_KEY &&
        env.LOGLY_COLLECTOR_URL &&
        env.LOGLY_IDENTITY_SECRET &&
        env.LOGLY_IDENTITY_SECRET.length >= 32,
    )
  )
}

export function storefrontEventProperties(input: {
  name: string
  properties?: Record<string, unknown>
}) {
  const properties = input.properties ?? {}
  return {
    surface: "storefront",
    ...(properties.category === "PRODUCT" || properties.category === "SERVICE"
      ? { category: properties.category }
      : {}),
    ...(input.name === "storefront_link_shared" &&
    (properties.status === "shared" || properties.status === "copied")
      ? { status: properties.status }
      : {}),
    ...(input.name === "storefront_request_submitted" ? { success: true } : {}),
  }
}

/** resolveMerchant must recheck verified Host, live release/plan and QA session policy. */
export function createStorefrontAnalyticsHandlers(options: {
  resolveMerchant: (
    request: Request,
  ) => Promise<StorefrontAnalyticsMerchant | null>
  environment?: () => Environment
  send?: (url: string, init: RequestInit) => Promise<Response>
}) {
  const environment = options.environment ?? (() => process.env)
  const headers = { "Cache-Control": "private, no-store" }
  const resolve = async (request: Request) => {
    if (!storefrontCollectionEnabled(environment())) return null
    return options.resolveMerchant(request)
  }
  return {
    async GET(request: Request) {
      return Response.json(
        { enabled: Boolean(await resolve(request)) },
        { headers },
      )
    },
    async POST(request: Request) {
      const env = environment()
      if (!storefrontCollectionEnabled(env))
        return new Response(null, { status: 204, headers })
      if (
        request.headers.get("dnt") === "1" ||
        request.headers.get("sec-gpc") === "1"
      )
        return new Response(null, { status: 204, headers })
      const host = request.headers.get("host")
      const origin = request.headers.get("origin")
      if (
        !host ||
        !origin ||
        origin !== `https://${host}` ||
        !URL.canParse(origin) ||
        new URL(origin).host !== host
      )
        return Response.json(
          { error: "Origin not allowed" },
          { status: 403, headers },
        )
      const merchant = await resolve(request)
      if (!merchant) return new Response(null, { status: 204, headers })
      const input = await readBatchBody(request)
      if (!input.ok)
        return Response.json(
          { error: "Invalid batch" },
          { status: input.status, headers },
        )
      const parsed = attributedBatchSchema.safeParse(input.body)
      if (!parsed.success)
        return Response.json(
          { error: "Invalid batch" },
          { status: 400, headers },
        )
      const reference = (kind: string, value: string) =>
        createHmac("sha256", env.LOGLY_IDENTITY_SECRET ?? "")
          .update(
            JSON.stringify([storefrontProject, merchant.tenantId, kind, value]),
          )
          .digest("hex")
      const batch = safeBatch(parsed.data, storefrontProject)
      batch.events = batch.events
        .filter(
          (event) =>
            storefrontEvents.has(event.name) &&
            ["/", "/about", "/service-request"].includes(event.route ?? ""),
        )
        .map((event) => ({
          ...event,
          ...(event.visitorId
            ? { visitorId: `vis_${reference("visitor", event.visitorId)}` }
            : {}),
          groups: {
            business: {
              key: `grp_${reference("business", merchant.tenantId)}`,
              properties: { name: merchant.name.slice(0, 120) },
            },
          },
          properties: {
            ...storefrontEventProperties(event),
            audience: "anonymous",
          },
        }))
      if (!batch.events.length)
        return Response.json({ accepted: 0 }, { status: 202, headers })
      try {
        const response = await (options.send ?? fetch)(
          `${(env.LOGLY_COLLECTOR_URL ?? "").replace(/\/$/, "")}/v1/events`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-logly-project-key": env.LOGLY_STOREFRONT_PROJECT_KEY ?? "",
              "x-logly-origin": origin,
            },
            body: JSON.stringify(batch),
            signal: AbortSignal.timeout(4000),
          },
        )
        return new Response(response.body, {
          status: response.status,
          headers: { ...headers, "content-type": "application/json" },
        })
      } catch {
        return Response.json(
          { error: "Analytics unavailable" },
          { status: 502, headers },
        )
      }
    },
  }
}
