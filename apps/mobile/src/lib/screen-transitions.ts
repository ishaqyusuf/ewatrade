import type { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs"
import type { Stack } from "expo-router"
import type { ComponentProps } from "react"

type StackScreenOptions = Exclude<
  NonNullable<ComponentProps<typeof Stack>["screenOptions"]>,
  (...args: never[]) => unknown
>

export type StackTransitions = {
  /** Default for every stack screen: an ordinary push such as Order detail. */
  push: StackScreenOptions
  /** Routes presented as modals: create flows, settings and Finance sheets. */
  modal: StackScreenOptions
  /**
   * Entry, auth and shell routes that are reached through Redirect,
   * router.replace or a Stack.Protected guard flip rather than a user push.
   */
  gate: StackScreenOptions
}

// Screen changes stay on the native stack, as T3 Code does: no JS-driven
// interpolators, so native gestures and frame pacing are kept. We only choose
// which native animation each kind of route uses. Without an explicit choice
// Android falls back to its OS default, which reads as a static swap and
// treats presentation "modal" exactly like a push. iOS keeps its native push,
// swipe-back and modal sheet.
export function stackTransitions(os: string): StackTransitions {
  const android = os === "android"
  return {
    push: android ? { animation: "ios_from_right" } : {},
    modal: {
      presentation: "modal",
      ...(android ? { animation: "slide_from_bottom" } : {}),
    },
    // animationDuration only applies on iOS; Android uses its native timing.
    gate: { animation: "fade", animationDuration: 220 },
  }
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

export function tabTransitions(
  reduceMotion: boolean,
): Pick<BottomTabNavigationOptions, "animation" | "transitionSpec"> {
  // Bottom tabs animate in JS and ignore the OS reduce-motion setting, so the
  // caller passes it in.
  if (reduceMotion) return { animation: "none" }
  return {
    animation: "fade",
    transitionSpec: {
      animation: "timing",
      config: { duration: 180, easing: easeOutCubic },
    },
  }
}
