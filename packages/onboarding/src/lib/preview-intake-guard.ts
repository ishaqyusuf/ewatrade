import { NextResponse } from "next/server"

function isPreviewRuntime() {
  return (
    process.env.VERCEL_ENV === "preview" || process.env.APP_ENV === "preview"
  )
}

/**
 * Preview keeps account and business intake closed unless it is explicitly
 * opened for testing. Preview runs on its own database, so opening it lets
 * early-access requests, approval, verification and signup be tested end to
 * end before a release. Production and development are never affected.
 */
export function isPreviewIntakeBlocked() {
  return isPreviewRuntime() && process.env.PREVIEW_INTAKE_ENABLED !== "true"
}

export function blockMarketingIntakeInPreview() {
  if (!isPreviewIntakeBlocked()) return null

  return NextResponse.json(
    { message: "Marketing intake is unavailable in this preview." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}
