"use client"

import { getCatalogIllustrationSvg } from "@ewatrade/utils/catalog-illustration-artwork"
import { findCatalogIllustration } from "@ewatrade/utils/catalog-illustrations"

/** Only the shared allowlisted artwork renderer can supply this static SVG. */
export function CatalogIllustrationPreview({
  illustrationId,
  compact = false,
}: { illustrationId: string; compact?: boolean }) {
  const illustration = findCatalogIllustration(illustrationId)
  const svg = getCatalogIllustrationSvg(illustrationId, {
    ink: "var(--foreground)",
    fill: "var(--muted)",
    accent: "var(--primary)",
    highlight: "var(--accent)",
  })
  if (!illustration || !svg) return null
  return (
    <div
      role="img"
      aria-label={illustration.label}
      className={
        compact
          ? "size-full [&>svg]:size-full"
          : "mx-auto aspect-square w-full max-w-60 [&>svg]:size-full"
      }
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Only bundled allowlisted SVG and fixed semantic paint roles, never merchant markup.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
