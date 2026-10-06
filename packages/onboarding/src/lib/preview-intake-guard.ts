import { NextResponse } from "next/server"

export function blockMarketingIntakeInPreview() {
  if (
    process.env.VERCEL_ENV !== "preview" &&
    process.env.APP_ENV !== "preview"
  ) {
    return null
  }

  return NextResponse.json(
    { message: "Marketing intake is unavailable in this preview." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}
