import artworkFile from "./catalog-illustration-artwork.json"
import { findCatalogIllustration } from "./catalog-illustrations"

export type CatalogIllustrationPalette = Readonly<{
  ink: string
  fill: string
  accent: string
  highlight: string
}>

const templates: Readonly<Record<string, string>> = Object.freeze(
  artworkFile.templates,
)

function escapePaint(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

// Only bundled, allowlisted geometry is rendered. Callers supply semantic colors.
export function getCatalogIllustrationSvg(
  id: string | null | undefined,
  palette: CatalogIllustrationPalette,
): string | undefined {
  const illustration = findCatalogIllustration(id)
  if (!illustration) return undefined
  const template = templates[illustration.id]
  if (!template) return undefined
  const paints: Readonly<Record<string, string>> = {
    ink: escapePaint(palette.ink),
    fill: escapePaint(palette.fill),
    accent: escapePaint(palette.accent),
    highlight: escapePaint(palette.highlight),
  }
  return template.replace(
    /\{\{(ink|fill|accent|highlight)\}\}/g,
    (_placeholder, role: string) => paints[role] ?? "none",
  )
}
