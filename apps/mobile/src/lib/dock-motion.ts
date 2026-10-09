import { Easing, withSpring, withTiming } from "react-native-reanimated"

/**
 * The bottom dock's one motion, shared by the tab bar, the bottom search
 * footer and any FAB riding above them: a quick ease-out timing on the way
 * down, a firm spring on the way back up. Reduce Motion jumps straight there.
 */
export function animateDock(
  toValue: number,
  hiding: boolean,
  reduceMotion: boolean,
) {
  if (reduceMotion) return toValue
  return hiding
    ? withTiming(toValue, { duration: 200, easing: Easing.out(Easing.cubic) })
    : withSpring(toValue, {
        damping: 26,
        mass: 0.8,
        overshootClamping: true,
        stiffness: 240,
      })
}

/** Fades only through the last third of the slide, like the tab bar. */
export const DOCK_OPACITY_INPUT = [0, 0.65, 1]
export const DOCK_OPACITY_OUTPUT = [1, 1, 0]
