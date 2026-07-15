import type { LinkProps } from "expo-router"
import type { ImageSourcePropType } from "react-native"
import {
  DESIGN_01_ID,
  DESIGN_01_LEGACY_REFERENCE_ID,
  DESIGN_01_PRIMARY_REFERENCE,
  DESIGN_01_ROUTES,
} from "../designs/design-01/design-01.data"

export type DesignReferenceId = typeof DESIGN_01_ID

export type DesignReferenceDecision = {
  adoption: string[]
  id: DesignReferenceId
  imageRoute: LinkProps["href"]
  route: LinkProps["href"]
  source: ImageSourcePropType
  sourceLabel: string
  subtitle: string
  title: string
}

export const FIRST_DESIGN_REFERENCE_ID: DesignReferenceId = DESIGN_01_ID

export const DESIGN_REFERENCE_DECISIONS: DesignReferenceDecision[] = [
  {
    adoption: DESIGN_01_PRIMARY_REFERENCE.adoption,
    id: DESIGN_01_ID,
    imageRoute: DESIGN_01_ROUTES.image,
    route: DESIGN_01_ROUTES.home,
    source: DESIGN_01_PRIMARY_REFERENCE.source,
    sourceLabel: DESIGN_01_PRIMARY_REFERENCE.sourceLabel,
    subtitle:
      "Functional design app for the first approved reference, with its own screen group.",
    title: "Design 01",
  },
]

export function getDesignReferenceDecision(referenceId?: string | string[]) {
  const normalizedId = Array.isArray(referenceId) ? referenceId[0] : referenceId
  const fallbackReference =
    DESIGN_REFERENCE_DECISIONS.find(
      (reference) => reference.id === FIRST_DESIGN_REFERENCE_ID,
    ) ?? DESIGN_REFERENCE_DECISIONS[0]

  if (!fallbackReference) {
    throw new Error("No design reference decisions are configured.")
  }

  return (
    (normalizedId === DESIGN_01_LEGACY_REFERENCE_ID
      ? fallbackReference
      : undefined) ??
    DESIGN_REFERENCE_DECISIONS.find(
      (reference) => reference.id === normalizedId,
    ) ??
    fallbackReference
  )
}
