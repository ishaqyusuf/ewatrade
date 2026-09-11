import { StaffOnboardingMarketNameplate } from "@/components/mobile"
import { shouldShowInternalDesignSystemEntry } from "@/lib/app-variant"
import { Redirect, useLocalSearchParams } from "expo-router"
import { useMemo, useState } from "react"

type PreviewState = "disabled" | "enabled" | "error" | "loading"

function getPreviewState(value: string | string[] | undefined): PreviewState {
  const candidate = Array.isArray(value) ? value[0] : value

  if (
    candidate === "disabled" ||
    candidate === "error" ||
    candidate === "loading"
  ) {
    return candidate
  }

  return "enabled"
}

export default function StaffOnboardingPreviewRoute() {
  const params = useLocalSearchParams<{ state?: string }>()
  const previewState = getPreviewState(params.state)
  const [name, setName] = useState(
    previewState === "disabled" ? "" : "Adewale Dada",
  )
  const [displayName, setDisplayName] = useState(
    previewState === "disabled" ? "" : "Wale",
  )
  const canSubmit = useMemo(() => name.trim().length > 0, [name])

  if (!shouldShowInternalDesignSystemEntry()) {
    return <Redirect href="/login" />
  }

  return (
    <StaffOnboardingMarketNameplate
      businessName="Adebayo’s Provisions"
      canSubmit={canSubmit}
      displayName={displayName}
      email="adebayo@example.com"
      isSubmitting={previewState === "loading"}
      name={name}
      onChangeDisplayName={setDisplayName}
      onChangeName={setName}
      onSubmit={() => undefined}
      roleLabel="Attendant"
      submitError={
        previewState === "error"
          ? "We could not activate this staff access. Try again."
          : null
      }
    />
  )
}
