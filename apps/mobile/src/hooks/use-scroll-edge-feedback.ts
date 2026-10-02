import { useReducedMotion } from "react-native-reanimated"

export function useScrollEdgeFeedback() {
  const reducedMotion = useReducedMotion()
  return {
    alwaysBounceVertical: !reducedMotion,
    bounces: !reducedMotion,
    overScrollMode: reducedMotion ? ("never" as const) : ("always" as const),
  }
}
