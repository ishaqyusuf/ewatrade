import { createAppleAppSiteAssociation } from "@/lib/mobile-app-association"

export const dynamic = "force-dynamic"

export function GET() {
  const association = createAppleAppSiteAssociation(
    process.env.EWATRADE_APPLE_APP_SITE_ASSOCIATION_APP_IDS,
  )
  if (!association) {
    return Response.json({ error: "Association unavailable" }, { status: 503 })
  }
  return Response.json(association, {
    headers: { "Cache-Control": "public, max-age=300" },
  })
}
