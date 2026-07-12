import { Pressable } from "@/components/ui/pressable"
import { useToast } from "@/context/toast-context"
import { useColors } from "@/hooks/use-color"
import type {
  Toast as ToastType,
  ToastType as ToastVariant,
} from "@/types/toast.types"
import type React from "react"
import { useCallback, useEffect, useRef } from "react"
import { LayoutAnimation, StyleSheet, Text, View } from "react-native"
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated"

interface ToastProps {
  toast: ToastType
  index: number
  onHeightChange?: (id: string, height: number) => void
}

type ToastPalette = {
  actionBackground: string
  actionForeground: string
  background: string
  foreground: string
  ripple: string
}

function withOpacity(color: string, opacity: number) {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)

  if (!match) {
    return color
  }

  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`
}

const getToastPalette = (
  type: ToastVariant,
  colors: ReturnType<typeof useColors>,
): ToastPalette => {
  switch (type) {
    case "success":
      return {
        actionBackground: withOpacity(colors.successForeground, 0.18),
        actionForeground: colors.successForeground,
        background: colors.success,
        foreground: colors.successForeground,
        ripple: withOpacity(colors.successForeground, 0.12),
      }
    case "error":
      return {
        actionBackground: withOpacity(colors.destructiveForeground, 0.18),
        actionForeground: colors.destructiveForeground,
        background: colors.destructive,
        foreground: colors.destructiveForeground,
        ripple: withOpacity(colors.destructiveForeground, 0.12),
      }
    case "warning":
      return {
        actionBackground: withOpacity(colors.foreground, 0.12),
        actionForeground: colors.foreground,
        background: colors.warn,
        foreground: colors.foreground,
        ripple: withOpacity(colors.foreground, 0.12),
      }
    case "info":
      return {
        actionBackground: withOpacity(colors.primaryForeground, 0.18),
        actionForeground: colors.primaryForeground,
        background: colors.primary,
        foreground: colors.primaryForeground,
        ripple: withOpacity(colors.primaryForeground, 0.12),
      }
    default:
      return {
        actionBackground: withOpacity(colors.background, 0.16),
        actionForeground: colors.background,
        background: colors.foreground,
        foreground: colors.background,
        ripple: withOpacity(colors.background, 0.12),
      }
  }
}

const getIconForType = (type: ToastVariant) => {
  switch (type) {
    case "success":
      return "✓"
    case "error":
      return "✗"
    case "warning":
      return "⚠"
    case "info":
      return "ℹ"
    default:
      return ""
  }
}

export const Toast: React.FC<ToastProps> = ({ toast, index }) => {
  const prevContentRef = useRef<string | React.ReactNode | null>(null)
  const prevTypeRef = useRef<ToastVariant | null>(null)
  const prevIndexRef = useRef<number>(-1)

  const colors = useColors()
  const { dismiss } = useToast()
  const opacity = useSharedValue(0)
  const translateY = useSharedValue(
    toast.options.position === "top" ? -100 : 100,
  )
  const scale = useSharedValue(0.9)
  const rotateZ = useSharedValue(0)
  const height = useSharedValue(0)
  const viewRef = useRef<View>(null)

  const getStackOffset = useCallback(() => {
    const baseOffset = 4
    const maxOffset = 12
    const offset = Math.min(index * baseOffset, maxOffset)
    return toast.options.position === "top" ? offset : -offset
  }, [index, toast.options.position])

  const getStackScale = useCallback(() => {
    const scaleReduction = 0.02
    const minScale = 0.92
    return Math.max(1 - index * scaleReduction, minScale)
  }, [index])

  useEffect(() => {
    if (prevIndexRef.current !== index && opacity.value > 0) {
      const soonerOffset = toast.options.position === "top" ? 2 : -2

      translateY.value = withTiming(getStackOffset() + soonerOffset, {
        duration: 400,
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
      })

      scale.value = withTiming(getStackScale() * 0.98, {
        duration: 400,
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
      })

      setTimeout(() => {
        translateY.value = withSpring(getStackOffset(), {
          damping: 25,
          stiffness: 120,
          mass: 0.8,
          velocity: 0,
        })

        scale.value = withSpring(getStackScale(), {
          damping: 25,
          stiffness: 120,
          mass: 0.8,
          velocity: 0,
        })
      }, 200)
    }

    prevIndexRef.current = index
  }, [
    getStackOffset,
    getStackScale,
    index,
    opacity,
    scale,
    toast.options.position,
    translateY,
  ])

  const handleDismiss = useCallback(() => {
    dismiss(toast.id)
    toast.options.onClose?.()
  }, [dismiss, toast.id, toast.options])

  useEffect(() => {
    const delay = index * 50

    LayoutAnimation.configureNext({
      duration: 300,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
    })

    setTimeout(() => {
      opacity.value = withTiming(1, {
        duration: 500,
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
      })

      translateY.value = withSpring(getStackOffset(), {
        damping: 28,
        stiffness: 140,
        mass: 0.8,
        velocity: 0,
      })

      scale.value = withSpring(getStackScale(), {
        damping: 28,
        stiffness: 140,
        mass: 0.8,
        velocity: 0,
      })

      rotateZ.value = withTiming(0, {
        duration: 500,
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
      })
    }, delay)

    if (toast.options.duration > 0) {
      const exitDelay = Math.max(0, toast.options.duration - 500)

      const exitAnimations = () => {
        opacity.value = withTiming(0, {
          duration: 400,
          easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
        })

        translateY.value = withTiming(
          toast.options.position === "top" ? -20 : 20,
          {
            duration: 400,
            easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
          },
        )

        scale.value = withTiming(0.95, {
          duration: 400,
          easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
        })

        setTimeout(() => {
          runOnJS(handleDismiss)()
        }, 400)
      }

      setTimeout(exitAnimations, exitDelay)
    }
  }, [
    getStackOffset,
    getStackScale,
    handleDismiss,
    index,
    opacity,
    rotateZ,
    scale,
    toast.options.duration,
    toast.options.position,
    translateY,
  ])

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [
        { translateY: translateY.value },
        { scale: scale.value },
        { rotateZ: `${rotateZ.value}deg` },
      ],
      zIndex: 1000 - index,
    }
  })

  const handlePress = () => {
    opacity.value = withTiming(0, {
      duration: 250,
      easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
    })

    translateY.value = withTiming(
      toast.options.position === "top" ? -100 : 100,
      {
        duration: 250,
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
      },
    )

    scale.value = withTiming(0.8, {
      duration: 250,
      easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
    })

    setTimeout(() => {
      handleDismiss()
    }, 250)
  }

  const palette = getToastPalette(toast.options.type, colors)
  const icon = getIconForType(toast.options.type)

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        animatedStyle,
        {
          marginTop: 0,
          marginBottom: 0,
          position: "absolute",
          shadowColor: colors.foreground,
          top: toast.options.position === "top" ? 100 : undefined,
          bottom: toast.options.position === "bottom" ? 0 : undefined,
        },
      ]}
    >
      <Pressable
        style={[styles.toast, { backgroundColor: palette.background }]}
        onPress={handlePress}
        android_ripple={{ color: palette.ripple }}
      >
        {icon ? (
          <Text style={[styles.icon, { color: palette.foreground }]}>
            {icon}
          </Text>
        ) : null}
        <View style={styles.contentContainer}>
          {typeof toast.content === "string" ? (
            <Text style={[styles.text, { color: palette.foreground }]}>
              {toast.content}
            </Text>
          ) : (
            toast.content
          )}
        </View>
        {toast.options.action && (
          <Pressable
            style={[
              styles.actionButton,
              { backgroundColor: palette.actionBackground },
            ]}
            haptic
            onPress={() => {
              toast?.options?.action?.onPress?.()
              handlePress()
            }}
          >
            <Text
              style={[styles.actionText, { color: palette.actionForeground }]}
            >
              {toast.options.action.label}
            </Text>
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  toastContainer: {
    width: "90%",
    maxWidth: 400,
    alignSelf: "center",
    marginVertical: 4,
    borderRadius: 12,
    overflow: "hidden",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
  },
  icon: {
    fontSize: 20,
    marginRight: 12,
    fontWeight: "bold",
    textAlign: "center",
    width: 24,
  },
  contentContainer: {
    flex: 1,
  },
  text: {
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 20,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 12,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "600",
  },
})
