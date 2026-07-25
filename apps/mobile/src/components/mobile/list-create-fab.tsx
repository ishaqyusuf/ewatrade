import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { useColors } from "@/hooks/use-color"
import { useEffect } from "react"
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { getListCreateFabBottom } from "./list-create-fab-model"

type ListCreateFabProps = {
  accessibilityLabel: string
  bottomOffset?: number
  dockHidden?: boolean
  onPress: () => void
  sitsAboveDock?: boolean
  testID?: string
}

export function ListCreateFab({
  accessibilityLabel,
  bottomOffset = 0,
  dockHidden = false,
  onPress,
  sitsAboveDock = false,
  testID,
}: ListCreateFabProps) {
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const targetBottom = getListCreateFabBottom({
    bottomInset: insets.bottom,
    bottomOffset,
    dockHidden,
    sitsAboveDock,
  })
  const animatedBottom = useSharedValue(targetBottom)

  useEffect(() => {
    animatedBottom.value = withTiming(targetBottom, {
      duration: reduceMotion ? 0 : 220,
    })
  }, [animatedBottom, reduceMotion, targetBottom])

  const animatedStyle = useAnimatedStyle(() => ({
    bottom: animatedBottom.value,
  }))

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          elevation: 10,
          position: "absolute",
          right: 20,
          shadowColor: colors.foreground,
          shadowOffset: { height: 5, width: 0 },
          shadowOpacity: 0.18,
          shadowRadius: 14,
          zIndex: 900,
        },
        animatedStyle,
      ]}
    >
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className="size-14 items-center justify-center rounded-full bg-primary"
        haptic
        onPress={onPress}
        testID={testID}
        transition
      >
        <Icon className="size-md text-primary-foreground" name="Plus" />
      </Pressable>
    </Animated.View>
  )
}
