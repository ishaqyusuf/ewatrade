import { catalogQuerySchema } from "@ewatrade/storefront-contracts/resources"

/** The signed preview stays on its own page; only catalog state can navigate. */
export function storefrontPreviewQuery(target: string, origin: string) {
  const url = new URL(target, origin)
  if (url.origin !== origin || url.pathname !== "/") return null
  if (
    [...url.searchParams.keys()].some(
      (key) => url.searchParams.getAll(key).length !== 1,
    )
  )
    return null
  const parsed = catalogQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  )
  return parsed.success ? parsed.data : null
}

export function storefrontPreviewFormQuery(
  action: string,
  method: string,
  data: FormData,
  origin: string,
) {
  if (method.toLowerCase() !== "get") return null
  const url = new URL(action, origin)
  url.search = ""
  for (const [key, value] of data) {
    if (typeof value !== "string") return null
    url.searchParams.append(key, value)
  }
  return storefrontPreviewQuery(url.href, origin)
}
