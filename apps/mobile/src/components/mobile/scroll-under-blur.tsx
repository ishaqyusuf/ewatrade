import { useColorScheme } from "@/hooks/use-color"
import { BlurView } from "expo-blur"
import { LinearGradient } from "expo-linear-gradient"
import type { ReactNode } from "react"
import { StyleSheet, View } from "react-native"

/**
 * A bar that floats over a scrolling list (owner, 5 Nov 2026): what scrolls
 * under it is blurred, and a short fade above it lets the content melt in
 * instead of stopping at a hard edge. The bar's content goes inside: Android's
 * blur captures every view drawn over it, so content placed outside would be
 * blurred into a halo around itself.
 */
export function ScrollUnderBlur({
  color,
  fadeAbove = 24,
  veilAlpha = "99",
  children,
}: {
  /** The screen colour the bar settles into (`#RRGGBB`). */
  color: string
  /** How far the fade reaches above the bar, in points. */
  fadeAbove?: number
  /** Hex alpha of the colour wash over the blur; lower shows more of what scrolls under. */
  veilAlpha?: string
  children: ReactNode
}) {
  const { colorScheme } = useColorScheme()
  const veil = `${color}${veilAlpha}`
  return (
    <View>
      <LinearGradient
        pointerEvents="none"
        colors={[`${color}00`, veil]}
        style={{
          position: "absolute",
          top: -fadeAbove,
          right: 0,
          left: 0,
          height: fadeAbove,
        }}
      />
      <BlurView
        intensity={30}
        tint={colorScheme === "dark" ? "dark" : "light"}
        experimentalBlurMethod="dimezisBlurView"
      >
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: veil }]}
        />
        {children}
      </BlurView>
    </View>
  )
}
