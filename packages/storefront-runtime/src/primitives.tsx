import { Badge } from "@ewatrade/ui/badge"
import { getCatalogIllustrationSvg } from "@ewatrade/utils/catalog-illustration-artwork"
import type { PublicCatalogItem } from "../../storefront-contracts/src/resources"

import { StorefrontPhoto } from "./photo"
import { formatStorefrontPrice, storefrontInitials } from "./presentation"

export { StorefrontPhoto } from "./photo"

export function StorefrontAttribution() {
  return (
    <a
      href="https://ewatrade.com/"
      data-storefront-event="storefront_backlink_clicked"
    >
      Powered by <strong>ẸwáTrade</strong>
    </a>
  )
}
export {
  formatStorefrontPrice,
  storefrontInitials,
} from "./presentation"

export function availabilityLabel(
  value: PublicCatalogItem["availability"] | undefined,
) {
  return value === "OUT_OF_STOCK"
    ? "Out of stock"
    : value === "MADE_TO_ORDER"
      ? "Made to order"
      : null
}
export function StorefrontArtwork({
  item,
}: {
  item: Pick<PublicCatalogItem, "id" | "name" | "illustrationId"> &
    Partial<Pick<PublicCatalogItem, "availability" | "kind">> &
    Pick<PublicCatalogItem, "photoUrl">
}) {
  const tones = ["sand", "sage", "clay", "mist", "stone", "plum"]
  const hash = [...item.id].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    7,
  )
  const svg = getCatalogIllustrationSvg(item.illustrationId, {
    ink: "#1d1d1b",
    fill: "var(--tile-fill)",
    accent: "var(--tile-accent)",
    highlight: "var(--tile-background)",
  })
  const label =
    availabilityLabel(item.availability) ??
    (item.kind === "SERVICE" ? "Service" : null)
  const artwork = svg ? (
    <span
      aria-hidden="true"
      className="sf-tile-art"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Only allowlisted bundled SVG and fixed CSS paints; never merchant markup.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  ) : (
    <span aria-hidden="true" className="sf-tile-initials">
      {storefrontInitials(item.name)}
    </span>
  )
  return (
    <div
      className="sf-tile"
      data-tone={tones[hash % tones.length]}
      data-out={item.availability === "OUT_OF_STOCK"}
    >
      {item.photoUrl ? (
        <StorefrontPhoto
          src={item.photoUrl}
          alt={item.name}
          className="sf-product-photo"
          loading="lazy"
          fallback={artwork}
        />
      ) : (
        artwork
      )}
      {label ? (
        <Badge
          variant="secondary"
          className="sf-tile-badge"
          data-availability={item.availability}
        >
          {label}
        </Badge>
      ) : null}
    </div>
  )
}
export function StorefrontPrice({
  item,
  chatAvailable,
}: { item: PublicCatalogItem; chatAvailable: boolean }) {
  return (
    <div
      className="sf-price-block"
      data-out={item.availability === "OUT_OF_STOCK"}
    >
      <span
        className={
          item.priceMinor === null ? "sf-price sf-price-unknown" : "sf-price"
        }
      >
        {item.priceMinor === null
          ? chatAvailable
            ? "Ask for price"
            : "Price not listed"
          : `${item.isFromPrice ? "From " : ""}${formatStorefrontPrice(item.priceMinor, item.currencyCode)}`}
      </span>
      {item.options.length > 1 ? (
        <span className="sf-price-meta">{item.options.length} options</span>
      ) : null}
    </div>
  )
}
