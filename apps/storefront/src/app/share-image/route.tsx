import { StorefrontShareImage } from "@/components/storefront/storefront-share-image"
import { localQaSharePhotoData } from "@/lib/local-qa-storefront-photos"
import { loadFactoryStorefront } from "@/lib/storefront-factory"
import { prisma } from "@ewatrade/db"
import { getStorefrontDomain } from "@ewatrade/utils"
import { ImageResponse } from "next/og"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const item = new URL(request.url).searchParams.get("item") ?? undefined
  const { load, storefront: store } = await loadFactoryStorefront(
    prisma,
    request.headers.get("host") ?? "",
    { item },
  )
  if (load.status !== "ready" || !store || (item && !store.highlightedItem))
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    })
  const domain = `${store.slug}.${getStorefrontDomain(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com")}`
  const photoData = await localQaSharePhotoData(
    store,
    request.headers.get("host") ?? "",
  )
  return new ImageResponse(
    <StorefrontShareImage
      store={store}
      domain={domain}
      photoData={photoData}
    />,
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "no-store",
        ...(store.isQaPreview ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
      },
    },
  )
}
