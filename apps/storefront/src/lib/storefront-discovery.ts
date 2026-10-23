import { prisma } from "@ewatrade/db"
import {
  collectStorefrontSitemap,
  storefrontIndexingEnabled,
} from "@ewatrade/storefront-runtime/seo"
import { loadFactoryStorefront } from "./storefront-factory"

export async function loadStorefrontSitemap(host: string) {
  if (!storefrontIndexingEnabled(process.env)) return []
  return collectStorefrontSitemap(
    process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
    async (after) => {
      const { load, storefront } = await loadFactoryStorefront(prisma, host, {
        after,
      })
      if (load.status !== "ready" || !storefront) return null
      return {
        store: storefront,
        mode: load.scope.mode,
        releaseId: load.scope.releaseId,
        about: load.snapshot.composition.pages.some(
          (page) => page.key === "about",
        ),
      }
    },
  )
}
