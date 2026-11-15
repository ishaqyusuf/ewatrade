import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useEffect, useRef, useState } from "react"
import { AccessibilityInfo, Animated, Easing } from "react-native"

export {
  type SetupIntroKind,
  setupIntroKind,
  setupIntroMessages,
} from "./setup-intro-messages"

/** Wait before each message: a short beat, then longer for longer reads. */
export const SETUP_INTRO_DELAYS_MS = [700, 1100, 1500] as const

/** Reveals the intro one message at a time once `ready`; runs once. */
export function useSetupIntroReveal(count: number, ready: boolean) {
  const [shown, setShown] = useState(0)
  const started = useRef(false)
  useEffect(() => {
    if (!ready || started.current || !count) return
    started.current = true
    const timers: ReturnType<typeof setTimeout>[] = []
    let at = 0
    for (let index = 0; index < count; index++) {
      at += SETUP_INTRO_DELAYS_MS[index] ?? 1200
      timers.push(setTimeout(() => setShown(index + 1), at))
    }
    return () => {
      for (const timer of timers) clearTimeout(timer)
      // A cleared run (unmount, fast refresh) may start again.
      started.current = false
    }
  }, [count, ready])
  return { shown, typing: ready && shown < count }
}

/** Three pulsing dots while the intro "types". */
export function SetupTypingDots() {
  const colors = useColors()
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null
    let cancelled = false
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return
      loop = Animated.loop(
        Animated.timing(pulse, {
          duration: 900,
          easing: Easing.linear,
          toValue: 1,
          useNativeDriver: true,
        }),
      )
      loop.start()
    })
    return () => {
      cancelled = true
      loop?.stop()
    }
  }, [pulse])
  return (
    <View
      accessibilityLabel="Assistant is typing"
      accessible
      className="flex-row items-center gap-1.5 self-start rounded-full bg-muted px-3.5 py-3"
    >
      {[0, 1, 2].map((dot) => (
        <Animated.View
          key={dot}
          style={{
            backgroundColor: colors.mutedForeground,
            borderRadius: 4,
            height: 7,
            width: 7,
            opacity: pulse.interpolate({
              inputRange: [
                0,
                dot / 3,
                dot / 3 + 0.2,
                Math.min(1, dot / 3 + 0.5),
                1,
              ],
              outputRange: [0.35, 0.35, 1, 0.35, 0.35],
              extrapolate: "clamp",
            }),
          }}
        />
      ))}
    </View>
  )
}
