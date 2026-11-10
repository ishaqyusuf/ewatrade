import "server-only"
import { prisma } from "@ewatrade/db"
import { getPlatformBusinessCatalog } from "@ewatrade/db/queries"
import { headers } from "next/headers"
import { cache } from "react"
import { isLocalPlatformCatalogPreview } from "./platform-catalog"

type Search = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined

/** One read per request, shared by metadata and the page. Opt-in/listing is enforced in the query. */
export const loadPlatformCatalog = cache(
  async (
    slug: string,
    q?: string,
    category?: string,
    after?: string,
    item?: string,
  ) =>
    getPlatformBusinessCatalog(prisma, {
      slug,
      query: { q, category, item },
      after,
      localQaPreview: isLocalPlatformCatalogPreview(
        (await headers()).get("host"),
      ),
    }),
)

export function catalogSearch(search: Search) {
  return {
    q: first(search.q)?.slice(0, 120),
    category: first(search.category),
    after: first(search.after),
  }
}
