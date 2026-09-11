import { analyticsBatchSchema } from "@ishaqyusuf/logly-core"
import { isProductOrigin, safeBatch } from "./policy"
import { readBatchBody } from "./read-batch-body"

export function createEventsRoute(surface: "web" | "mobile" = "web") {
  return async function POST(request: Request) {
    const collector = process.env.LOGLY_COLLECTOR_URL
    const key =
      surface === "mobile"
        ? process.env.LOGLY_MOBILE_PROJECT_KEY
        : process.env.LOGLY_PROJECT_KEY
    if (!collector || !key)
      return Response.json(
        { error: "Analytics is not configured" },
        { status: 503 },
      )
    const domain = process.env.PLATFORM_DOMAIN?.trim() || "ewatrade.com"
    const origin = request.headers.get("origin")
    if (
      surface === "web"
        ? !origin ||
          !isProductOrigin(
            origin,
            domain,
            process.env.NODE_ENV !== "production",
          )
        : Boolean(origin)
    )
      return Response.json({ error: "Origin not allowed" }, { status: 403 })
    const input = await readBatchBody(request)
    if (input.ok === false)
      return Response.json(
        { error: input.status === 413 ? "Batch too large" : "Invalid batch" },
        { status: input.status },
      )
    const parsed = analyticsBatchSchema.safeParse(input.body)
    if (!parsed.success)
      return Response.json({ error: "Invalid batch" }, { status: 400 })
    const batch = safeBatch(
      parsed.data,
      surface === "mobile"
        ? (process.env.LOGLY_MOBILE_PROJECT ?? "ewatrade-mobile")
        : (process.env.NEXT_PUBLIC_LOGLY_PROJECT ?? "ewatrade-web"),
    )
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
            "x-logly-origin": `https://${domain}`,
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
