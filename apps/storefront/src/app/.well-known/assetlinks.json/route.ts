import { createAndroidAssetLinks } from "@/lib/mobile-app-association"

export const dynamic = "force-dynamic"

export function GET() {
  const association = createAndroidAssetLinks(
    process.env.EWATRADE_ANDROID_APP_LINK_CERTIFICATE_SHA256,
    process.env.EWATRADE_ANDROID_APP_LINK_PACKAGE_NAMES,
  )
  if (!association) {
    return Response.json({ error: "Association unavailable" }, { status: 503 })
  }
  return Response.json(association, {
    headers: { "Cache-Control": "public, max-age=300" },
  })
}
