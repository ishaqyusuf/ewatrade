import { NextResponse } from "next/server"

// Saved-Product links from WhatsApp and the assistant. The installed app claims
// this path; in a browser it opens the same record. The detail recheck still
// applies the signed-in business and Store.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params
  const target = new URL("/sales", request.url)
  if (itemId && itemId.length <= 128)
    target.searchParams.set("catalogDetail", itemId)
  return NextResponse.redirect(target, 307)
}
