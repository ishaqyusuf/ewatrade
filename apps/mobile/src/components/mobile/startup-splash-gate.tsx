import { StartupSplash } from "@/components/mobile/startup-splash"
import { isDevelopmentAppVariant } from "@/lib/app-variant"
import * as SplashScreen from "expo-splash-screen"
import { useCallback, useEffect, useRef, useState } from "react"
import { StyleSheet, View } from "react-native"

export const STARTUP_SPLASH_MINIMUM_MS = 1400
export const DEVELOPMENT_STARTUP_SPLASH_MINIMUM_MS = 4000

type StartupSplashGateProps = {
  onComplete: () => void
}

export function StartupSplashGate({ onComplete }: StartupSplashGateProps) {
  const [isVisible, setIsVisible] = useState(true)
  const hasLaidOut = useRef(false)
  const animationFrame = useRef<number | null>(null)
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const minimumVisibleMs = isDevelopmentAppVariant()
    ? DEVELOPMENT_STARTUP_SPLASH_MINIMUM_MS
    : STARTUP_SPLASH_MINIMUM_MS

  useEffect(() => {
    return () => {
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current)
      }
      if (completionTimer.current !== null) {
        clearTimeout(completionTimer.current)
      }
    }
  }, [])

  const handleSplashLayout = useCallback(() => {
    if (hasLaidOut.current) return
    hasLaidOut.current = true

    animationFrame.current = requestAnimationFrame(() => {
      void SplashScreen.hideAsync()
        .catch(() => undefined)
        .finally(() => {
          completionTimer.current = setTimeout(() => {
            setIsVisible(false)
            onComplete()
          }, minimumVisibleMs)
        })
    })
  }, [minimumVisibleMs, onComplete])

  if (!isVisible) return null

  return (
    <View
      accessibilityViewIsModal
      onLayout={handleSplashLayout}
      style={styles.root}
      testID="startup-splash-gate"
    >
      <StartupSplash />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
})
