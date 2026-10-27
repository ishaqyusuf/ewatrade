/** Only sellable Products are shareable; the read decides public availability. */
export function canShareCatalogProduct(item: {
  kind: string
  product?: { usage?: string | null } | null
}) {
  return (
    item.kind === "product" &&
    Boolean(item.product) &&
    item.product?.usage !== "INTERNAL_USE"
  )
}

export type CatalogProductShareRead =
  | {
      status: "available"
      url: string
      title: string
      tenantId: string
      storeId: string
    }
  | { status: "unavailable"; reason: string }

/** A late or foreign read never shows or shares another business's URL. */
export function currentCatalogProductShare(
  read: CatalogProductShareRead | undefined,
  scope: { storeId?: string; generation: number; currentGeneration: number },
) {
  if (!read || scope.generation !== scope.currentGeneration) return undefined
  if (
    read.status === "available" &&
    scope.storeId !== undefined &&
    read.storeId !== scope.storeId
  )
    return undefined
  return read
}

export const catalogProductShareMessages = {
  shared: "Shared.",
  copied: "Link copied.",
  cancelled: null,
  unavailable: "Couldn't copy the link. Select it below and copy it.",
} as const

/** A rejected share can resume later: recheck scope before its clipboard fallback. */
export function catalogProductShareAdapter(
  adapter: {
    share?: (request: { title: string; url: string }) => Promise<void>
    copy: (url: string) => Promise<void>
  },
  isCurrent: () => boolean,
) {
  return {
    share: adapter.share
      ? async (request: { title: string; url: string }) => {
          if (!isCurrent()) throw new Error("Share scope changed")
          await adapter.share?.(request)
        }
      : undefined,
    copy: async (url: string) => {
      if (!isCurrent()) throw new Error("Share scope changed")
      await adapter.copy(url)
    },
  }
}
