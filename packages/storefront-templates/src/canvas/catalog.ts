import type { SectionDefinition } from "../../../storefront-contracts/src/manifest"
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
export const canvasEditableManifests = [...canvasManifests, marketHallManifest]
export const portableSections: readonly SectionDefinition[] = [
  ...canvasSections,
  ...marketHallSections,
]
export type PortableKind = CanvasKind | MarketHallKind

export function isCanvasManifest(pin: { key: string; version: string }) {
  return canvasEditableManifests.some(
    (entry) => entry.key === pin.key && entry.version === pin.version,
  )
}
export function portableSection(type: string) {
  return portableSections.find((entry) => entry.key === type)
}
export function portableSectionKind(type: string): PortableKind | null {
  return marketHallSectionKind(type) ?? canvasSectionKind(type)
}
export function portableFamily(templateKey: string) {
  return templateKey === marketHallManifest.key
    ? "hall"
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
