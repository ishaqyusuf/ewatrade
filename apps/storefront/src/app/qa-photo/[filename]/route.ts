import { readLocalQaStorefrontPhoto } from "@/lib/local-qa-storefront-photos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params
  const bytes = await readLocalQaStorefrontPhoto(
    request.headers.get("host") ?? "",
    filename,
  )
  const headers = {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
  }
  return bytes
    ? new Response(bytes, {
        headers: { ...headers, "Content-Type": "image/webp" },
      })
    : new Response(null, { status: 404, headers })
}
