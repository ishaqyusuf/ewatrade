import { analyticsBatchSchema } from "@ishaqyusuf/logly-core"
import { nativeBatchSchema } from "./native-contract"
import { isProductOrigin, safeBatch, safeRoute } from "./policy"
import { readBatchBody } from "./read-batch-body"
import { type WebSurface, webSurfaces } from "./surfaces"

export function createEventsRoute(
  surface: "web" | "mobile" | WebSurface = "web",
) {
  return async function POST(request: Request) {
    const web =
      surface === "dashboard" || surface === "marketing"
        ? webSurfaces[surface]
        : undefined
    const collector = process.env.LOGLY_COLLECTOR_URL
    const key =
      surface === "mobile"
        ? process.env.LOGLY_MOBILE_PROJECT_KEY
        : surface === "dashboard"
          ? process.env.LOGLY_DASHBOARD_PROJECT_KEY
          : surface === "marketing"
            ? process.env.LOGLY_MARKETING_PROJECT_KEY
            : process.env.LOGLY_PROJECT_KEY
    if (!collector || !key)
      return Response.json(
        { error: "Analytics is not configured" },
        { status: 503 },
      )
    const domain = process.env.PLATFORM_DOMAIN?.trim() || "ewatrade.com"
    const origin = request.headers.get("origin")
    if (
      surface !== "mobile"
        ? !origin ||
          (web
            ? !(web.origins as readonly string[]).includes(origin)
            : !isProductOrigin(
                origin,
                domain,
                process.env.NODE_ENV !== "production",
              ))
        : Boolean(origin)
    )
      return Response.json({ error: "Origin not allowed" }, { status: 403 })
    const input = await readBatchBody(request)
    if (input.ok === false)
      return Response.json(
        { error: input.status === 413 ? "Batch too large" : "Invalid batch" },
        { status: input.status },
      )
    const native =
      surface === "mobile" ? nativeBatchSchema.safeParse(input.body) : undefined
    const parsed = analyticsBatchSchema.safeParse(input.body)
    if (!native?.success && !parsed.success)
      return Response.json({ error: "Invalid batch" }, { status: 400 })
    const project =
      surface === "mobile"
        ? "ewatrade-mobile"
        : (web?.project ??
          process.env.NEXT_PUBLIC_LOGLY_PROJECT ??
          "ewatrade-web")
    const batch = native?.success
      ? {
          sentAt: native.data.sentAt,
          sdk: { name: "@ishaqyusuf/logly-core", version: "0.3.0" },
          events: native.data.events.map((event) => ({
            eventId: event.eventId,
            project,
            name: event.name,
            version: 1,
            source: "mobile",
            platform: "android",
            occurredAt: event.occurredAt,
            visitorId: event.visitorId,
            visitKind: event.visitKind,
            appVersion: event.appVersion,
            appBuild: event.appBuild,
            route: safeRoute(event.route),
            properties: {},
          })),
        }
      : parsed.success
        ? safeBatch(parsed.data, project)
        : undefined
    if (!batch)
      return Response.json({ error: "Invalid batch" }, { status: 400 })
    if (!batch.events.length)
      return Response.json({ accepted: 0 }, { status: 202 })
    const country =
      process.env.VERCEL === "1"
        ? request.headers.get("x-vercel-ip-country")
        : null
    try {
      const response = await fetch(
        `${collector.replace(/\/$/, "")}/v1/events`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-logly-project-key": key,
            "x-logly-origin":
              surface === "mobile"
                ? "https://ewatrade.com"
                : web && origin
                  ? origin
                  : `https://${domain}`,
            ...(country && /^[A-Z]{2}$/.test(country)
              ? { "x-logly-country": country }
              : {}),
          },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(4000),
        },
      )
      return new Response(response.body, {
        status: response.status,
        headers: { "content-type": "application/json" },
      })
    } catch {
      return Response.json({ error: "Analytics unavailable" }, { status: 502 })
    }
  }
}
export const POST = createEventsRoute()
