import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { QaBusinessesScreen } from "@/components/mobile/qa-businesses-screen"
import { isDevelopmentAppVariant } from "@/lib/app-variant"
import { Redirect, Stack, useRouter } from "expo-router"
import { useCallback } from "react"
import { useReducedMotion } from "react-native-reanimated"

// QA tooling only: the full-screen business list when a QA domain has more
// than five businesses. Development app variant only; redirects otherwise.
export default function QaBusinessesModalRoute() {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const close = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace("/")
  }, [router])
  if (!__DEV__ || !isDevelopmentAppVariant()) return <Redirect href="/" />
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
          // Reduce Motion fades instead of sliding, like the shared presets.
          animation: reduceMotion ? "fade" : "slide_from_bottom",
        }}
      />
      <MobileWorkflowChrome
        closeLabel="Close QA businesses"
        hideHeader={false}
        keyboardBottomOffset={0}
        title="QA businesses"
        onClose={close}
      >
        <QaBusinessesScreen onClose={close} />
      </MobileWorkflowChrome>
    </>
  )
}
