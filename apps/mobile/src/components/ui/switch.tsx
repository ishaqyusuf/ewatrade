import { Pressable } from "@/components/ui/pressable"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { useEffect } from "react"
import type { PressableProps } from "react-native"
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

type SwitchProps = Omit<PressableProps, "onPress" | "children"> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Kept for call-site compatibility; the switch is sized by the design. */
  className?: string
}

const TRACK_WIDTH = 44
const TRACK_HEIGHT = 26
const THUMB = 20
const TRAVEL = TRACK_WIDTH - THUMB - 6

/**
 * A 44×26 switch drawn with explicit styles. The @rn-primitives switch relied
 * on className inside a node_modules Pressable, which NativeWind does not
 * style, so it collapsed to nothing on Android.
 */
function Switch({
  checked,
  onCheckedChange,
  disabled,
  className: _className,
  ...props
}: SwitchProps) {
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const offset = useSharedValue(checked ? TRAVEL : 0)
  useEffect(() => {
    offset.value = withTiming(checked ? TRAVEL : 0, {
      duration: 160,
      reduceMotion: ReduceMotion.System,
    })
  }, [checked, offset])
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }))
  return (
    <Pressable
      allowOverflow
      haptic="selection"
      noRipple
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={10}
      onPress={() => onCheckedChange(!checked)}
      style={{
        backgroundColor: checked ? colors.primary : palette.switchOff,
        borderRadius: 999,
        height: TRACK_HEIGHT,
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
        paddingHorizontal: 3,
        width: TRACK_WIDTH,
      }}
      {...props}
    >
      <Animated.View
        style={[
          {
            backgroundColor: palette.switchThumb,
            borderRadius: 999,
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
            height: THUMB,
            width: THUMB,
          },
          thumbStyle,
        ]}
      />
    </Pressable>
  )
}

export { Switch }
