import {
  type PlatformCatalogItem,
  platformInitials,
} from "@/lib/platform-catalog"
import { getCatalogIllustrationSvg } from "@ewatrade/utils/catalog-illustration-artwork"
import { PlatformPhoto } from "./photo"

const tones = ["sand", "sage", "clay", "mist", "stone", "plum"]

/** Product tile: an approved photo when one is public, otherwise bundled artwork. */
export function PlatformTile({
  item,
  photoUrl = item.photoUrl,
  className = "",
  tag = true,
}: {
  item: Pick<
    PlatformCatalogItem,
    "id" | "name" | "illustrationId" | "photoUrl" | "availability"
  >
  photoUrl?: string
  className?: string
  tag?: boolean
}) {
  const hash = [...item.id].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    7,
  )
  const svg = getCatalogIllustrationSvg(item.illustrationId, {
    ink: "#1d1d1b",
    fill: "var(--t-fill)",
    accent: "var(--t-accent)",
    highlight: "var(--t-bg)",
  })
  const out = item.availability === "OUT_OF_STOCK"
  return (
    <div
      className={`tile${out ? " is-out" : ""} ${className}`}
      data-tone={tones[hash % tones.length]}
    >
      {svg ? (
        <span
          aria-hidden="true"
          className="tile-art"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Only allowlisted bundled SVG and fixed CSS paints; never merchant markup.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <span aria-hidden="true" className="tile-initials">
          {platformInitials(item.name)}
        </span>
      )}
      {photoUrl ? <PlatformPhoto src={photoUrl} alt={item.name} /> : null}
      {tag && out ? (
        <span className="tile-tag" data-kind="OUT_OF_STOCK">
          Sold out
        </span>
      ) : null}
      {tag && item.availability === "MADE_TO_ORDER" ? (
        <span className="tile-tag" data-kind="MADE_TO_ORDER">
          Made to order
        </span>
      ) : null}
    </div>
  )
}
