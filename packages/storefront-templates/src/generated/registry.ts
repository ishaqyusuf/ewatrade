import { componentManifestSchema } from "@ewatrade/storefront-components/contracts"
import type { VersionAvailability } from "@ewatrade/storefront-contracts/availability"
import manifest from "./public-intro/manifest.json"
import review from "./public-intro/review.json"

/** Exact reviewed source only. Artifact bundles are never loaded by the application. */
export const reviewedComponentRegistry = [
  {
    manifest: componentManifestSchema.parse(manifest),
    review,
    availability: { state: "active" } as VersionAvailability,
    source:
      "packages/storefront-templates/src/generated/public-intro/component.tsx",
  },
] as const

export const publicIntroManifest = reviewedComponentRegistry[0].manifest
export const publicIntroRegistration = reviewedComponentRegistry[0]
