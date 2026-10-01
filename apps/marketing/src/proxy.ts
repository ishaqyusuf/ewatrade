import { type NextRequest, NextResponse } from "next/server"

export const config = { matcher: "/:path*" }

export function proxy(request: NextRequest) {
  if (
    process.env.VERCEL_ENV !== "preview" &&
    process.env.APP_ENV !== "preview"
  ) {
    return NextResponse.next()
  }

  const pathname = request.nextUrl.pathname
  const isLegalPublicationRead =
    pathname === "/api/legal-publication" && request.method === "GET"
  const isApiRequest = pathname.startsWith("/api/")
  const isReadRequest = request.method === "GET" || request.method === "HEAD"

  if (!isLegalPublicationRead && (isApiRequest || !isReadRequest)) {
    return NextResponse.json(
      { message: "This preview does not process account or business data." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  return NextResponse.next()
}
