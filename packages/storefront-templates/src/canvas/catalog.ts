import type { SectionDefinition } from "../../../storefront-contracts/src/manifest"
import {
  type CommerceStudioKind,
  commerceStudioManifest,
  commerceStudioSectionKind,
  commerceStudioSections,
} from "../commerce-studio/manifest"
import {
  type MarketHallKind,
  marketHallManifest,
  marketHallSectionKind,
  marketHallSections,
} from "../market-hall/manifest"
import {
  type CanvasKind,
  canvasFamily,
  canvasManifests,
  canvasSectionKind,
  canvasSections,
} from "./manifests"

/**
 * Explicit catalog seam: every canvas-editable exact pin and every section declaration
 * the shared canvas renderer/editor understands. Pinned canvas manifests stay as declared;
 * later templates add their own declarations here instead.
 */
export const canvasEditableManifests = [
  ...canvasManifests,
  marketHallManifest,
  commerceStudioManifest,
]
export const portableSections: readonly SectionDefinition[] = [
  ...canvasSections,
  ...marketHallSections,
  ...commerceStudioSections,
]
export type PortableKind = CanvasKind | MarketHallKind

/** Commerce studio sections map onto the shared library vocabulary for Studio filters. */
const commerceStudioLibraryKind: Partial<
  Record<CommerceStudioKind, PortableKind>
> = {
  hero: "intro",
  categories: "collection",
  featured: "collection",
  catalog: "collection",
  services: "counter",
  story: "story",
  faq: "faq",
  contact: "contact",
}

export function isCanvasManifest(pin: { key: string; version: string }) {
  return canvasEditableManifests.some(
    (entry) => entry.key === pin.key && entry.version === pin.version,
  )
}
export function portableSection(type: string) {
  return portableSections.find((entry) => entry.key === type)
}
export function portableSectionKind(type: string): PortableKind | null {
  const studio = commerceStudioSectionKind(type)
  if (studio) return commerceStudioLibraryKind[studio] ?? null
  return marketHallSectionKind(type) ?? canvasSectionKind(type)
}
export function portableFamily(templateKey: string) {
  return templateKey === marketHallManifest.key
    ? "hall"
    : templateKey === commerceStudioManifest.key
      ? "studio"
      : canvasFamily(templateKey)
}
/** Display name of a section's source template, for editor labels and outlines. */
export function portableTemplateName(templateKey: string | undefined) {
  return (
    canvasEditableManifests.find((entry) => entry.key === templateKey)?.name ??
    templateKey ??
    "Canvas"
  )
}
