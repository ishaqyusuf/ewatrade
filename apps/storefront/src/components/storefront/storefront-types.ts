import type { getPublicStorefront } from "@ewatrade/db/queries"
type StorefrontProjection = NonNullable<
  Awaited<ReturnType<typeof getPublicStorefront>>
>
export type PublicStorefrontItem = StorefrontProjection["items"][number] & {
  photoUrl?: string
}
export type PublicStorefront = Omit<
  StorefrontProjection,
  "items" | "highlightedItem"
> & {
  items: PublicStorefrontItem[]
  highlightedItem: PublicStorefrontItem | null
}
