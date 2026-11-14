import { NextResponse } from "next/server"

// Receipt approval links from WhatsApp and Telegram. The installed app claims
// this path; in a browser it opens the approval page, which checks sign-in,
// role and Store as usual.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const target =
    id && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? `/receipt-approval/${id}` : "/"
  return NextResponse.redirect(new URL(target, request.url), 307)
}
