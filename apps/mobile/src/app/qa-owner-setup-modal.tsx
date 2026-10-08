import { AccountAgeEntry } from "@/components/mobile/sign-up/account-age-entry"
import { isDevelopmentAppVariant } from "@/lib/app-variant"
import { Redirect, Stack } from "expo-router"

// Exercises the real age and setup controller locally. Backend approval and
// legal checks still apply; never creates a session or accepts legal terms.
export default function OwnerSetupQaRoute() {
  if (!__DEV__ || !isDevelopmentAppVariant()) return <Redirect href="/" />
  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: "none" }} />
      <AccountAgeEntry />
    </>
  )
}
