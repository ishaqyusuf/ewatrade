import { StartupSplash } from "@/components/mobile/startup-splash"
import { shouldShowInternalDesignSystemEntry } from "@/lib/app-variant"
import { Redirect } from "expo-router"

export default function StartupSplashReviewRoute() {
  if (!shouldShowInternalDesignSystemEntry()) {
    return <Redirect href="/login" />
  }

  return <StartupSplash />
}
