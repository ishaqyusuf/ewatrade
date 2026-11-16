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
  /** Full-screen workflows that rise over the current route. */
  fullScreenModal: StackScreenOptions
  /**
   * Entry, auth and shell routes that are reached through Redirect,
   * router.replace or a Stack.Protected guard flip rather than a user push.
   */
  gate: StackScreenOptions
}

// Keep motion on the native stack. Full-screen workflow routes are cards
// with a vertical transition so they can still push child routes in this stack.
export function stackTransitions(
  os: string,
  reduceMotion = false,
): StackTransitions {
  const android = os === "android"
  return {
    push: reduceMotion
      ? { animation: "fade" }
      : android
        ? { animation: "ios_from_right" }
        : {},
    fullScreenModal: {
      animation: reduceMotion ? "fade" : "slide_from_bottom",
      ...(os === "ios" && !reduceMotion
        ? { gestureDirection: "vertical", gestureResponseDistance: { top: 56 } }
        : {}),
    },
    // animationDuration only applies on iOS; Android uses its native timing.
    gate: { animation: "fade", animationDuration: 220 },
  }
}

const easeInOutQuad = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2

type TabSceneInterpolator = NonNullable<
  BottomTabNavigationOptions["sceneStyleInterpolator"]
>

// A tab's progress is -1 when it sits before the active tab, 0 when active and
// 1 when after it, so following tab order reverses the direction going back.
// The tab being left slides 240dp away and is gone by 70% of the way.
const forLeavingTab: TabSceneInterpolator = ({ current }) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({
      inputRange: [-1, -0.7, 0, 0.7, 1],
      outputRange: [0, 0, 1, 0, 0],
    }),
    transform: [
      {
        translateX: current.progress.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: [-240, 0, 240],
        }),
      },
    ],
  },
})

// The tab being opened fades in where it is.
const forEnteringTab: TabSceneInterpolator = ({ current }) => ({
  sceneStyle: {
    // Keep the reset on the native animated graph, including repeated returns.
    transform: [
      {
        translateX: current.progress.interpolate({
          inputRange: [-1, 0, 1],
          outputRange: [0, 0, 0],
        }),
      },
    ],
    opacity: current.progress.interpolate({
      inputRange: [-1, 0, 1],
      outputRange: [0, 1, 0],
    }),
  },
})

export function tabTransitions(
  reduceMotion: boolean,
  focused: boolean,
): Pick<
  BottomTabNavigationOptions,
  "animation" | "transitionSpec" | "sceneStyleInterpolator"
> {
  // Bottom tabs animate in JS and ignore the OS reduce-motion setting, so the
  // caller passes it in. The interpolator only sees progress, so the caller
  // also says whether this tab is the focused (entering) one.
  if (reduceMotion) return { animation: "none" }
  return {
    animation: "shift",
    transitionSpec: {
      animation: "timing",
      config: { duration: 230, easing: easeInOutQuad },
    },
    sceneStyleInterpolator: focused ? forEnteringTab : forLeavingTab,
  }
}
