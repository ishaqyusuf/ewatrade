import {
  STEP_MOTION,
  type StepDirection,
  stepDirection,
  stepEnterOffset,
} from "@/lib/step-motion"
import { type ReactNode, useMemo, useRef } from "react"
import type { StyleProp, ViewStyle } from "react-native"
import Animated, {
  Easing,
  FadeIn,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  ReduceMotion,
  useReducedMotion,
} from "react-native-reanimated"

/**
 * Animates an in-screen workflow step change (Workshop
 * mobile/order-step-motion 01 v2). Each step is its own keyed view: the
 * leaving step unmounts from React at once, so its controls can't submit
 * while its snapshot fades, and the entering step drifts in from the
 * direction of travel. Keep step state in the owning model so input survives.
 * The first step appears without its own motion.
 *
 * Pass `direction` when the caller remounts this component on every step
 * (it can't remember the previous step itself).
 */
export function StepTransition<T extends string | number>({
  step,
  order,
  direction: explicit,
  style = { flex: 1 },
  children,
}: {
  step: T
  order: readonly T[]
  direction?: StepDirection
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const previous = useRef(step)
  const remembered = useRef<StepDirection>("none")
  if (previous.current !== step) {
    remembered.current = stepDirection(order, previous.current, step)
    previous.current = step
  }
  const enter = explicit ?? remembered.current
  const entering = useMemo(() => {
    if (enter === "none") return undefined
    if (reduceMotion)
      return FadeIn.duration(STEP_MOTION.reducedEnterMs).reduceMotion(
        ReduceMotion.Never,
      )
    return (enter === "forward" ? FadeInRight : FadeInLeft)
      .duration(STEP_MOTION.enterMs)
      .delay(STEP_MOTION.enterDelayMs)
      .easing(Easing.out(Easing.cubic))
      .withInitialValues({
        opacity: 0,
        transform: [{ translateX: stepEnterOffset(enter, false) }],
      })
      .reduceMotion(ReduceMotion.System)
  }, [enter, reduceMotion])
  const exiting = useMemo(
    () =>
      FadeOut.duration(
        reduceMotion ? STEP_MOTION.reducedExitMs : STEP_MOTION.exitMs,
      )
        .easing(Easing.in(Easing.quad))
        .reduceMotion(ReduceMotion.Never),
    [reduceMotion],
  )
  return (
    <Animated.View
      entering={entering}
      exiting={exiting}
      key={String(step)}
      style={style}
    >
      {children}
    </Animated.View>
  )
}
