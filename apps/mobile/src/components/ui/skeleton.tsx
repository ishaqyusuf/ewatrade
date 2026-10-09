import { useColors } from "@/hooks/use-color"
import { LinearGradient } from "expo-linear-gradient"
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react"
import { StyleSheet, View, type ViewStyle } from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated"

const SWEEP_MS = 1300

const SweepContext = createContext<SharedValue<number> | null>(null)

function useSweepClock(enabled: boolean) {
  const progress = useSharedValue(0)
  useEffect(() => {
    if (!enabled) {
      cancelAnimation(progress)
      progress.value = 0
      return
    }
    progress.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    )
    return () => cancelAnimation(progress)
  }, [enabled, progress])
  return progress
}

/**
 * Shares one sweep animation across every Skeleton inside it, so a list of
 * placeholders shimmers in step instead of each block running its own clock.
 * The sweep is off under the system Reduce Motion setting.
 */
export function SkeletonGroup({
  accessibilityLabel,
  children,
}: {
  /** Read by screen readers instead of the placeholder shapes. */
  accessibilityLabel: string
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const progress = useSweepClock(!reduceMotion)
  return (
    <SweepContext.Provider value={reduceMotion ? null : progress}>
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="progressbar"
        accessibilityState={{ busy: true }}
      >
        <View importantForAccessibility="no-hide-descendants">{children}</View>
      </View>
    </SweepContext.Provider>
  )
}

function Sweep({
  progress,
  width,
}: {
  progress: SharedValue<number>
  width: number
}) {
  const colors = useColors()
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [-width, width]) },
    ],
  }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
    >
      <LinearGradient
        colors={["transparent", colors.skeletonHighlight, "transparent"]}
        end={{ x: 1, y: 0 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  )
}

/**
 * A placeholder block shaped like the content it stands in for. Pass explicit
 * width and height; use inside a SkeletonGroup so it shimmers with its peers.
 */
export function Skeleton({
  height,
  radius = 6,
  style,
  width = "100%",
}: {
  height: number
  radius?: number
  style?: ViewStyle
  width?: ViewStyle["width"]
}) {
  const colors = useColors()
  const progress = useContext(SweepContext)
  const [measured, setMeasured] = useState(0)
  return (
    <View
      onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
      style={[
        {
          backgroundColor: colors.skeleton,
          borderRadius: radius,
          height,
          overflow: "hidden",
          width,
        },
        style,
      ]}
    >
      {progress && measured > 0 ? (
        <Sweep progress={progress} width={measured} />
      ) : null}
    </View>
  )
}
