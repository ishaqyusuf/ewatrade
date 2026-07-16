import {
  type FeatureFlagMode,
  shouldUseFeatureFallback,
} from "@/lib/feature-flags"
import type { ReactNode } from "react"

type FeatureFlagProps = {
  children: ReactNode
  fallbackModes?: FeatureFlagMode[]
  Fallback?: ReactNode
}

export function FeatureFlag({
  children,
  fallbackModes = ["dev"],
  Fallback = null,
}: FeatureFlagProps) {
  return <>{shouldUseFeatureFallback(fallbackModes) ? Fallback : children}</>
}
