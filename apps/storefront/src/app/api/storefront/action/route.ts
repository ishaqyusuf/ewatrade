import { handleFactoryStorefrontAction } from "@/lib/storefront-factory"
import { prisma } from "@ewatrade/db"
import { storefrontActionSchema } from "@ewatrade/storefront-contracts/actions"

export const dynamic = "force-dynamic"
const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
}

/** Navigation only; Host/release and current capabilities are resolved again. */
export async function POST(request: Request) {
  const body = await request.text()
  if (body.length > 4096)
    return Response.json(
      { status: "unavailable" },
      { status: 413, headers: responseHeaders },
    )
  let input: unknown
  try {
    input = JSON.parse(body)
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 400, headers: responseHeaders },
    )
  }
  const action = storefrontActionSchema.safeParse(input)
  if (!action.success)
    return Response.json(
      { status: "unavailable" },
      { status: 400, headers: responseHeaders },
    )
  const result = await handleFactoryStorefrontAction(
    prisma,
    request.headers.get("host") ?? "",
    action.data,
  )
  return Response.json(result, { headers: responseHeaders })
}
