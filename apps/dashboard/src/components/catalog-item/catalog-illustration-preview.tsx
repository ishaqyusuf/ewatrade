"use client"

import { getCatalogIllustrationSvg } from "@ewatrade/utils/catalog-illustration-artwork"
import { findCatalogIllustration } from "@ewatrade/utils/catalog-illustrations"
import { useLayoutEffect, useRef } from "react"

// Strokes are 3 wide and paint 1.5 beyond the geometry; 2 more keeps air.
const FIT_PADDING = 3.5

/** Only the shared allowlisted artwork renderer can supply this static SVG. */
export function CatalogIllustrationPreview({
  illustrationId,
  compact = false,
  fit = false,
}: {
  illustrationId: string
  compact?: boolean
  /**
   * Crop to the drawing's own square bounds. The artwork sits on a padded
   * 128px canvas, so small previews otherwise show mostly empty margin.
   */
  fit?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const illustration = findCatalogIllustration(illustrationId)
  const svg = getCatalogIllustrationSvg(illustrationId, {
    ink: "var(--foreground)",
    fill: "var(--muted)",
    accent: "var(--primary)",
    highlight: "var(--accent)",
  })
  useLayoutEffect(() => {
    const element = fit && svg ? ref.current?.querySelector("svg") : null
    if (!element) return
    const box = element.getBBox()
    const side = Math.max(box.width, box.height) + FIT_PADDING * 2
    const x = box.x + box.width / 2 - side / 2
    const y = box.y + box.height / 2 - side / 2
    element.setAttribute("viewBox", `${x} ${y} ${side} ${side}`)
  }, [fit, svg])
  if (!illustration || !svg) return null
  return (
    <div
      ref={ref}
      role="img"
      aria-label={illustration.label}
      className={
        compact
          ? "size-full [&>svg]:size-full"
          : "mx-auto aspect-square w-full max-w-60 [&>svg]:size-full"
      }
      // Explicit SVG sizing opts artwork out of Button's default icon sizing.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Only bundled allowlisted SVG and fixed semantic paint roles, never merchant markup.
      dangerouslySetInnerHTML={{
        __html: svg.replace("<svg ", '<svg class="size-full" '),
      }}
    />
  )
}
